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
import type {
  Stock,
  Holding,
  Pet,
  Transaction,
  AchievementProgress,
  DailySnapshot,
  Settings,
  UserCultivation,
  CultivationLog
} from '@/types';

/** SCHEMA_VERSION 2(階段 2.6 加 cultivation 兩表) */
const SCHEMA_VERSION = 2;
const PUSH_DEBOUNCE_MS = 1000;

export interface CloudBlob {
  schemaVersion: number;
  stocks: Stock[];
  holdings: Holding[];
  pets: Pet[];
  transactions: Transaction[];
  achievements: AchievementProgress[];
  snapshots: DailySnapshot[];
  settings: Settings | null;
  /** 階段 2.6:玩家修為總額(singleton row) */
  userCultivation?: UserCultivation | null;
  /** 階段 2.6:修為變動歷史(append-only) */
  cultivationLog?: CultivationLog[];
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

/** 把所有要同步的 Dexie 表讀進 blob */
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
    cultivationLog
  ] = await Promise.all([
    db.stocks.toArray(),
    db.holdings.toArray(),
    db.pets.toArray(),
    db.transactions.toArray(),
    db.achievements.toArray(),
    db.snapshots.toArray(),
    db.settings.get('singleton'),
    db.userCultivation.get('main'),
    db.cultivationLog.toArray()
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
    cultivationLog
  };
}

/**
 * 把雲端 blob 寫回本地。整個交易內先 clear 再 bulkPut,確保沒有殘留。
 * `prices` 表不動(它是 API 抓的,沒在 sync 範圍)。
 *
 * 對舊版 blob(schemaVersion === 1,沒 userCultivation/cultivationLog 欄位)
 * 兩個 cultivation 表的 clear 仍會跑(本地清空),但 bulkPut 因 array 為 undefined 跳過,
 * 結果:本地修為歸零。對 user 來說等於「換手機才登入,雲端還沒有 v2 資料」可接受。
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
      db.settings,
      db.userCultivation,
      db.cultivationLog
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

      if (blob.settings) await db.settings.put(blob.settings);

      // 階段 2.6:cultivation 兩表
      await db.userCultivation.clear();
      if (blob.userCultivation) await db.userCultivation.put(blob.userCultivation);

      await db.cultivationLog.clear();
      if (blob.cultivationLog?.length) await db.cultivationLog.bulkPut(blob.cultivationLog);
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
