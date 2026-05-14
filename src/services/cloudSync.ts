/**
 * 雲端同步服務(Supabase user_data 表 ↔ 本地 IndexedDB)。
 *
 * 設計:
 *  - 全部資料當 JSON blob 一次上下傳(MVP 取簡)
 *  - 排除 `prices` 表(那是 API 抓的快取,本地隨時可重抓,不必占雲端空間)
 *  - sync 狀態用 syncInProgress flag 防止 pull/push race
 *  - debounce 1 秒,連續寫入只推一次
 *  - schemaVersion 之後若改 Dexie schema 用來判斷要不要 migrate
 */

import { supabase, isCloudConfigured } from '@/lib/supabase';
import { db } from '@/db';
import { settingsRepo, dexieSettingsTable } from '@/repositories/settingsRepo';
import type {
  Stock,
  Holding,
  Pet,
  Transaction,
  AchievementProgress,
  DailySnapshot,
  Settings,
  UserCultivation,
  CultivationLog,
  LoginStreak,
  UserTask,
  MilestoneReward,
  CreatureUnlock
} from '@/types';

/** SCHEMA_VERSION 4(階段 4C.5 加 creatureUnlocks) */
const SCHEMA_VERSION = 4;
const PUSH_DEBOUNCE_MS = 1000;

export interface CloudBlob {
  schemaVersion: number;
  stocks: Stock[];
  holdings: Holding[];
  /**
   * 神獸列表。階段 4A/4B/4C 新增 7 個 optional 欄位都自動隨 JSON 序列化同步,
   * 不需要 cloudSync 程式碼動:
   *   - customName(階段 4A.2 改名)
   *   - boostedDays(階段 4A.3 催熟累積天數)
   *   - effectBoostUntil(階段 4A.4 淬煉到期 unix ms)
   *   - colorVariant(階段 4B.2 配色淬煉)
   *   - isEternal / eternalDate(階段 4C.2 永恆紀念)
   *   - finalEffect(階段 4C.2 退役當下的特效快照)
   * 跨裝置 race 已驗證:effectBoostUntil 是時間戳,B 裝置拉到後仍以 now 比對,
   * 過期就自動降回自然 effect,不會卡狀態。
   */
  pets: Pet[];
  transactions: Transaction[];
  achievements: AchievementProgress[];
  snapshots: DailySnapshot[];
  /**
   * 全域設定 singleton。階段 4B 新增 4 個 optional 欄位都自動隨 JSON 同步:
   *   - unlockedBackgrounds(4B.4 家園背景解鎖清單)
   *   - currentBackground(4B.4 當前家園背景 id)
   *   - hudTheme(4B.3 HUD 主題色 id)
   *   - unlockedHudThemes(4B.3 HUD 主題解鎖清單)
   * 跨裝置:A 解鎖玉藍 → push → B pull → HUD 立刻變綠調(useEffect 同步
   * data-theme)。沒 race issue 因為解鎖是 append-only。
   */
  settings: Settings | null;
  /** 階段 2.6:玩家修為總額(singleton row) */
  userCultivation?: UserCultivation | null;
  /** 階段 2.6:修為變動歷史(append-only) */
  cultivationLog?: CultivationLog[];
  /** 階段 3.8:連登紀錄(singleton row) — 同步 currentStreak/longestStreak/lastLoginDate */
  userLoginStreak?: LoginStreak | null;
  /**
   * @deprecated 階段 3.8 後改純本地。
   * 任務有時效性(每日/週),跨裝置同步會清掉本地剛抽的任務。
   * 雲端 blob 仍保留欄位讓舊 client push 上來不會 reject,但 readAll 不再寫入、
   * writeAll 不再讀取。新裝置登入後跑 checkAndGenerateTasks 重新生成。
   */
  userTasks?: UserTask[];
  /**
   * @deprecated 同 userTasks。已領取的里程碑由 currentStreak 推算,不需 sync。
   */
  milestoneRewards?: MilestoneReward[];
  /**
   * 階段 4C.5:圖鑑修仙傳說解鎖紀錄(階段 4C.3 寫入)。
   * 紀錄以 creatureId 為單位(`&` 唯一索引),賣光重買仍解鎖。
   * append-only,沒 race issue:clear + bulkPut 即可。
   */
  creatureUnlocks?: CreatureUnlock[];
}

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

let pushTimer: number | undefined;
let syncInProgress = false;
let lastError: string | null = null;
let statusListeners = new Set<(s: SyncStatus, err: string | null) => void>();
let currentStatus: SyncStatus = 'idle';

function setStatus(s: SyncStatus, err: string | null = null) {
  currentStatus = s;
  lastError = err;
  for (const fn of statusListeners) fn(s, err);
}

export function getSyncStatus(): { status: SyncStatus; error: string | null } {
  return { status: currentStatus, error: lastError };
}

export function subscribeSyncStatus(fn: (s: SyncStatus, err: string | null) => void): () => void {
  statusListeners.add(fn);
  fn(currentStatus, lastError);
  return () => statusListeners.delete(fn);
}

/**
 * 把所有要同步的 Dexie 表讀進 blob。
 *
 * 階段 3.8 修正:userTasks / milestoneRewards **不**讀進 blob(純本地狀態)。
 * 任務跨裝置同步會清掉本地剛抽的任務,違反「每日任務 = 本地時區概念」。
 * 已領里程碑由 currentStreak 推算,沒必要同步。
 */
async function readAllForSync(): Promise<CloudBlob> {
  const [
    stocks,
    holdings,
    pets,
    transactions,
    achievements,
    snapshots,
    settings,
    userCultivation,
    cultivationLog,
    userLoginStreak,
    creatureUnlocks
  ] = await Promise.all([
    db.stocks.toArray(),
    db.holdings.toArray(),
    db.pets.toArray(),
    db.transactions.toArray(),
    db.achievements.toArray(),
    db.snapshots.toArray(),
    settingsRepo.get(),
    db.userCultivation.get('main'),
    db.cultivationLog.toArray(),
    db.userLoginStreak.get('main'),
    // 防呆:極早期 v12 → v13 過渡,creatureUnlocks 表可能還沒就緒;吞錯誤當空陣列
    db.creatureUnlocks.toArray().catch((e) => {
      console.warn('[cloudSync] creatureUnlocks toArray failed:', e);
      return [] as CreatureUnlock[];
    })
  ]);

  return {
    schemaVersion: SCHEMA_VERSION,
    stocks,
    holdings,
    pets,
    transactions,
    achievements,
    snapshots,
    settings: settings ?? null,
    userCultivation: userCultivation ?? null,
    cultivationLog,
    userLoginStreak: userLoginStreak ?? null,
    creatureUnlocks
    // userTasks / milestoneRewards 故意不寫(階段 3.8 後純本地)
  };
}

/**
 * 把雲端 blob 寫回本地。整個交易內先 clear 再 bulkPut,確保沒有殘留。
 * `prices` 表不動(它是 API 抓的,沒在 sync 範圍)。
 *
 * 階段 3.8 修正:**userTasks / milestoneRewards 不從雲端覆蓋本地**。
 * 任務跨裝置同步邏輯不對(每日任務是本地時區概念,雲端把今天的任務清掉
 * 違反期待)。已領里程碑由 currentStreak 推算,不需 sync。
 *
 * 流程:登入時 cloudSync.pullNow() 寫完 → caller 跑
 *   - checkAndUpdateStreak()      根據雲端來的 lastLoginDate 重算 todayClaimed
 *   - checkAndGenerateDailyTasks  確保今日有任務(本地若已有不重抽)
 *   - checkAndGenerateWeeklyTasks 同上
 *
 * 對舊版 blob(沒 userCultivation/cultivationLog/userLoginStreak)處理:
 * 對應本地表 clear 後 bulkPut undefined 跳過 → 該功能歸零(等於「換手機才登入,
 * 雲端還沒新版資料」可接受)。
 */
async function writeAllFromSync(blob: CloudBlob): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.stocks,
      db.holdings,
      db.pets,
      db.transactions,
      db.achievements,
      db.snapshots,
      dexieSettingsTable,
      db.userCultivation,
      db.cultivationLog,
      db.userLoginStreak,
      db.creatureUnlocks
    ],
    async () => {
      await db.stocks.clear();
      if (blob.stocks?.length) await db.stocks.bulkPut(blob.stocks);

      await db.holdings.clear();
      if (blob.holdings?.length) await db.holdings.bulkPut(blob.holdings);

      await db.pets.clear();
      if (blob.pets?.length) await db.pets.bulkPut(blob.pets);

      await db.transactions.clear();
      if (blob.transactions?.length) await db.transactions.bulkPut(blob.transactions);

      await db.achievements.clear();
      if (blob.achievements?.length) await db.achievements.bulkPut(blob.achievements);

      await db.snapshots.clear();
      if (blob.snapshots?.length) await db.snapshots.bulkPut(blob.snapshots);

      if (blob.settings) await dexieSettingsTable.put(blob.settings);

      // 階段 2.6:cultivation 兩表
      await db.userCultivation.clear();
      if (blob.userCultivation) await db.userCultivation.put(blob.userCultivation);

      await db.cultivationLog.clear();
      if (blob.cultivationLog?.length) await db.cultivationLog.bulkPut(blob.cultivationLog);

      // 階段 3.8:userLoginStreak 同步,userTasks / milestoneRewards 不動本地
      await db.userLoginStreak.clear();
      if (blob.userLoginStreak) await db.userLoginStreak.put(blob.userLoginStreak);

      // 階段 4C.5:圖鑑故事解鎖紀錄。append-only,clear + bulkPut 同步即可。
      // 舊版 blob 沒這欄位 → 等於從零開始解鎖(換手機才登入可接受)。
      // 防呆:若舊版 client 連上、creatureUnlocks 表還沒就緒,吞錯誤不中斷 tx
      try {
        await db.creatureUnlocks.clear();
        if (blob.creatureUnlocks?.length) {
          await db.creatureUnlocks.bulkPut(blob.creatureUnlocks);
        }
      } catch (e) {
        console.warn('[cloudSync] creatureUnlocks restore failed:', e);
      }

      // 注意:userTasks / milestoneRewards 不 clear、不 write(純本地狀態)。
      // caller 在 pullNow 後跑 checkAndGenerateTasks 確保任務存在。
    }
  );
}

/** 從雲端拉資料、覆蓋本地。回傳遠端 updated_at(unix ms),isEmpty 表示雲端沒資料 */
export async function pullNow(
  userId: string
): Promise<{ ok: boolean; error?: string; isEmpty?: boolean; remoteUpdatedAt?: number }> {
  if (!isCloudConfigured) return { ok: false, error: '雲端同步未啟用' };
  if (syncInProgress) return { ok: false, error: '另一同步進行中' };

  syncInProgress = true;
  setStatus('syncing');
  try {
    const { data, error } = await supabase
      .from('user_data')
      .select('blob, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      setStatus('error', error.message);
      return { ok: false, error: error.message };
    }
    if (!data) {
      setStatus('idle');
      return { ok: true, isEmpty: true };
    }
    await writeAllFromSync(data.blob as CloudBlob);
    setStatus('idle');
    return {
      ok: true,
      remoteUpdatedAt: data.updated_at ? new Date(data.updated_at).getTime() : undefined
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setStatus('error', msg);
    return { ok: false, error: msg };
  } finally {
    syncInProgress = false;
  }
}

/** 把本地資料推到雲端 */
export async function pushNow(userId: string): Promise<{ ok: boolean; error?: string }> {
  if (!isCloudConfigured) return { ok: false, error: '雲端同步未啟用' };
  if (syncInProgress) return { ok: false, error: '另一同步進行中' };

  syncInProgress = true;
  setStatus('syncing');
  try {
    const blob = await readAllForSync();
    const { error } = await supabase.from('user_data').upsert(
      { user_id: userId, blob },
      { onConflict: 'user_id' }
    );
    if (error) {
      setStatus('error', error.message);
      return { ok: false, error: error.message };
    }
    setStatus('idle');
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setStatus('error', msg);
    return { ok: false, error: msg };
  } finally {
    syncInProgress = false;
  }
}

/** debounced push;連續呼叫 1 秒內只會跑最後一次 */
export function pushDebounced(userId: string): void {
  if (pushTimer) {
    window.clearTimeout(pushTimer);
  }
  pushTimer = window.setTimeout(() => {
    pushTimer = undefined;
    pushNow(userId).catch((e) => {
      console.warn('[cloudSync] debounced push failed:', e);
    });
  }, PUSH_DEBOUNCE_MS);
}

/** 取消尚未執行的 debounced push(登出時用) */
export function cancelPendingPush(): void {
  if (pushTimer) {
    window.clearTimeout(pushTimer);
    pushTimer = undefined;
  }
}

/** 查雲端有沒有該 user 的資料 + 上次更新時間 */
export async function fetchRemoteMeta(
  userId: string
): Promise<{ exists: boolean; updatedAt?: number; error?: string }> {
  if (!isCloudConfigured) return { exists: false, error: '雲端同步未啟用' };
  const { data, error } = await supabase
    .from('user_data')
    .select('updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { exists: false, error: error.message };
  if (!data) return { exists: false };
  return { exists: true, updatedAt: data.updated_at ? new Date(data.updated_at).getTime() : undefined };
}

/** 本地有沒有「使用者建立的資料」(有買股票才算,光 settings/seed 不算) */
export async function localHasUserData(): Promise<boolean> {
  const [holdings, pets, txns] = await Promise.all([
    db.holdings.count(),
    db.pets.count(),
    db.transactions.count()
  ]);
  return holdings > 0 || pets > 0 || txns > 0;
}
