/**
 * 階段 4-B 緊急救援:把本機所有 cloud-first Repository 的資料**強推**到雲端,
 * 修復 self-heal 靜默失敗造成的雲端資料缺失。
 *
 * 用法:SettingsModal 內的「強制同步」按鈕呼叫 `forceSyncAllToCloud()`,
 *      console 顯示每個 table 的同步報告。
 *
 * 設計:
 *  - **逐 row upsert**(非 batch)— 避免一筆撞 constraint 把整批拖累
 *  - **不刪雲端任何東西** — 純 upsert by PK,新 row 進入,舊 row 覆蓋,
 *    雲端額外的 row 保留(下次 revalidate merge 回本機)
 *  - **完整 console log** — 每個 table 印「本機 X 筆,雲端原 Y 筆,
 *    成功 N 筆,失敗 M 筆 + 個別失敗原因」
 *  - **不依賴各 Repository 的 toRemote**(避免改既有 Repository 介面;
 *    inline mapper 跟各 repo 對齊,改動隔離在這檔)
 *  - **不碰 transactions / cloud-only 表**(notifications / feed_events 等)
 *  - **失敗不 throw** — 整段包 try/catch,回傳 summary 給 UI 用
 */

import { db } from '@/db';
import { supabase, isCloudConfigured } from '@/lib/supabase';
import type {
  Settings,
  HudTheme,
  Holding,
  Pet,
  UserCultivation,
  LoginStreak,
  AchievementProgress,
  CreatureUnlock,
  UserTask,
  MilestoneReward
} from '@/types';

export interface TableSyncReport {
  table: string;
  localCount: number;
  cloudCountBefore: number;
  cloudCountAfter: number;
  attempted: number;
  succeeded: number;
  failed: { id: string; reason: string }[];
}

export interface ForceSyncResult {
  ok: boolean;
  userId: string | null;
  reports: TableSyncReport[];
  totalAttempted: number;
  totalSucceeded: number;
  totalFailed: number;
  durationMs: number;
}

// ─── helper ──────────────────────────────────────────

async function getUserIdOrNull(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

async function cloudCount(table: string, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) {
    console.warn(`[forceSync] cloudCount(${table}) failed:`, error.message);
    return -1;
  }
  return count ?? 0;
}

function emptyReport(table: string, localCount: number, before: number): TableSyncReport {
  return {
    table,
    localCount,
    cloudCountBefore: before,
    cloudCountAfter: before,
    attempted: 0,
    succeeded: 0,
    failed: []
  };
}

function logReport(r: TableSyncReport): void {
  // eslint-disable-next-line no-console
  console.log(
    `[forceSync] ${r.table}: 本機 ${r.localCount} 筆,雲端原有 ${r.cloudCountBefore} 筆 → ` +
      `推送 ${r.attempted} 筆,成功 ${r.succeeded},失敗 ${r.failed.length} → ` +
      `雲端現有 ${r.cloudCountAfter} 筆`
  );
  if (r.failed.length > 0) {
    for (const f of r.failed) {
      console.warn(`[forceSync] ${r.table} 失敗 ${f.id}: ${f.reason}`);
    }
  }
}

// ─── inline mapper(跟各 Repo 對齊,不引用避免循環依賴)──

function settingsToRemote(s: Settings, userId: string) {
  return {
    user_id: userId,
    brokerage_fee_discount: s.brokerageFeeDiscount,
    brokerage_min_fee: s.brokerageMinFee,
    sound_enabled: s.soundEnabled,
    unlocked_backgrounds: s.unlockedBackgrounds ?? ['default'],
    current_background: s.currentBackground ?? 'default',
    hud_theme: (s.hudTheme ?? 'default') as HudTheme,
    unlocked_hud_themes: (s.unlockedHudThemes ?? ['default']) as HudTheme[]
  };
}

function holdingToRemote(h: Holding, userId: string) {
  return {
    user_id: userId,
    code: h.code,
    shares: h.shares,
    avg_cost: h.avgCost,
    total_cost: h.totalCost,
    realized_pnl: h.realizedPnL,
    // **重要**:雲端 holdings.first_purchased_at / last_transaction_at 是 timestamptz,
    // 直接送 unix ms 數字會被 PG 拒絕「22008 date/time field value out of range」。
    first_purchased_at: new Date(h.firstPurchasedAt).toISOString(),
    last_transaction_at: new Date(h.lastTransactionAt).toISOString()
  };
}

function petToRemote(p: Pet, userId: string) {
  return {
    id: p.id,
    user_id: userId,
    code: p.code,
    species_id: p.speciesId,
    level: p.level,
    custom_name: p.customName ?? null,
    born_at: new Date(p.bornAt).toISOString(),
    retired_at: p.retiredAt ? new Date(p.retiredAt).toISOString() : null,
    color_variant: p.colorVariant ?? 'default',
    boosted_days: p.boostedDays ?? 0,
    effect_boost_until: p.effectBoostUntil ? new Date(p.effectBoostUntil).toISOString() : null,
    is_eternal: p.isEternal ?? false,
    eternal_date: p.eternalDate ? new Date(p.eternalDate).toISOString() : null,
    final_effect: p.finalEffect ?? null
  };
}

function cultivationBalanceToRemote(u: UserCultivation, userId: string) {
  return {
    user_id: userId,
    total_points: u.amount,
    lifetime_earned: u.lifetimeEarned,
    lifetime_spent: u.lifetimeSpent
  };
}

function loginStreakToRemote(s: LoginStreak, userId: string) {
  return {
    user_id: userId,
    current_streak: s.currentStreak,
    max_streak: s.longestStreak,
    last_login_date: s.lastLoginDate,
    today_claimed: s.todayClaimed
  };
}

function achievementToRemote(a: AchievementProgress, userId: string) {
  return {
    user_id: userId,
    achievement_id: a.id,
    progress: a.current,
    unlocked_at: a.unlockedAt ? new Date(a.unlockedAt).toISOString() : null
  };
}

function creatureUnlockToRemote(u: CreatureUnlock, userId: string) {
  return {
    user_id: userId,
    creature_id: u.creatureId,
    unlocked_at: new Date(u.unlockedAt).toISOString()
  };
}

function userTaskToRemote(t: UserTask, userId: string, cloudId: string) {
  return {
    id: cloudId,
    user_id: userId,
    task_key: t.taskKey,
    task_type: t.taskType,
    progress: t.progress,
    completed: t.completed,
    claimed: t.claimed,
    created_at: new Date(t.generatedAt).toISOString()
  };
}

function milestoneToRemote(m: MilestoneReward, userId: string) {
  return {
    user_id: userId,
    milestone_day: m.milestoneDay,
    claimed_at: new Date(m.claimedAt).toISOString()
  };
}

// ─── per-row uploader(共用 pattern)──────────────────

interface UploadArgs<T> {
  table: string;
  conflictBy: string;
  items: T[];
  toPayload: (item: T) => Record<string, unknown>;
  idOf: (item: T) => string;
}

async function uploadPerRow<T>(args: UploadArgs<T>): Promise<{ succeeded: number; failed: { id: string; reason: string }[] }> {
  let succeeded = 0;
  const failed: { id: string; reason: string }[] = [];
  for (const item of args.items) {
    const id = args.idOf(item);
    try {
      const { error } = await supabase
        .from(args.table)
        .upsert(args.toPayload(item), { onConflict: args.conflictBy });
      if (error) {
        failed.push({
          id,
          reason: `${error.code ?? '?'} ${error.message ?? 'unknown'}`
        });
      } else {
        succeeded++;
      }
    } catch (e) {
      failed.push({ id, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return { succeeded, failed };
}

// ─── 各 table sync ────────────────────────────────────

async function syncSettings(userId: string): Promise<TableSyncReport> {
  const local = await db.settings.get('singleton');
  const before = await cloudCount('user_settings', userId);
  if (!local) return emptyReport('user_settings', 0, before);
  const r = await uploadPerRow({
    table: 'user_settings',
    conflictBy: 'user_id',
    items: [local],
    toPayload: (s) => settingsToRemote(s, userId),
    idOf: (s) => s.id
  });
  const after = await cloudCount('user_settings', userId);
  return {
    table: 'user_settings',
    localCount: 1,
    cloudCountBefore: before,
    cloudCountAfter: after,
    attempted: 1,
    succeeded: r.succeeded,
    failed: r.failed
  };
}

async function syncLoginStreak(userId: string): Promise<TableSyncReport> {
  const local = await db.userLoginStreak.get('main');
  const before = await cloudCount('user_login_streak', userId);
  if (!local) return emptyReport('user_login_streak', 0, before);
  const r = await uploadPerRow({
    table: 'user_login_streak',
    conflictBy: 'user_id',
    items: [local],
    toPayload: (s) => loginStreakToRemote(s, userId),
    idOf: (s) => s.id
  });
  const after = await cloudCount('user_login_streak', userId);
  return {
    table: 'user_login_streak',
    localCount: 1,
    cloudCountBefore: before,
    cloudCountAfter: after,
    attempted: 1,
    succeeded: r.succeeded,
    failed: r.failed
  };
}

async function syncCultivation(userId: string): Promise<TableSyncReport[]> {
  const balance = await db.userCultivation.get('main');
  const balanceBefore = await cloudCount('user_cultivation', userId);
  const balanceReport: TableSyncReport = balance
    ? {
        table: 'user_cultivation',
        localCount: 1,
        cloudCountBefore: balanceBefore,
        cloudCountAfter: balanceBefore,
        attempted: 1,
        succeeded: 0,
        failed: []
      }
    : emptyReport('user_cultivation', 0, balanceBefore);

  if (balance) {
    try {
      const { error } = await supabase
        .from('user_cultivation')
        .upsert(cultivationBalanceToRemote(balance, userId), { onConflict: 'user_id' });
      if (error) {
        balanceReport.failed.push({ id: 'main', reason: `${error.code ?? '?'} ${error.message}` });
      } else {
        balanceReport.succeeded = 1;
      }
    } catch (e) {
      balanceReport.failed.push({ id: 'main', reason: e instanceof Error ? e.message : String(e) });
    }
    balanceReport.cloudCountAfter = await cloudCount('user_cultivation', userId);
  }

  // cultivation_log (本機 id 是 auto-increment number,雲端是 bigserial,**用 cloudId 對齊**)
  // 沒 cloudId 的本機 log entry 跳過(它們是 pre-cloud-first 留下的,無雲端對應 id)
  const logs = await db.cultivationLog.toArray();
  const logsBefore = await cloudCount('cultivation_log', userId);
  // 注意:cultivation_log 沒上雲(階段 3D 批 1 emergency fix 拿掉),本檔不主動推
  const logReport: TableSyncReport = {
    table: 'cultivation_log',
    localCount: logs.length,
    cloudCountBefore: logsBefore,
    cloudCountAfter: logsBefore,
    attempted: 0,
    succeeded: 0,
    failed: []
  };

  return [balanceReport, logReport];
}

async function syncHoldings(userId: string): Promise<TableSyncReport> {
  const local = await db.holdings.toArray();
  const before = await cloudCount('holdings', userId);
  const r = await uploadPerRow({
    table: 'holdings',
    conflictBy: 'user_id,code',
    items: local,
    toPayload: (h) => holdingToRemote(h, userId),
    idOf: (h) => h.code
  });
  const after = await cloudCount('holdings', userId);
  return {
    table: 'holdings',
    localCount: local.length,
    cloudCountBefore: before,
    cloudCountAfter: after,
    attempted: local.length,
    succeeded: r.succeeded,
    failed: r.failed
  };
}

async function syncPets(userId: string): Promise<TableSyncReport> {
  const local = await db.pets.toArray();
  const before = await cloudCount('pets', userId);
  const r = await uploadPerRow({
    table: 'pets',
    conflictBy: 'id',
    items: local,
    toPayload: (p) => petToRemote(p, userId),
    idOf: (p) => `${p.id} (code=${p.code}, customName=${p.customName ?? 'null'})`
  });
  const after = await cloudCount('pets', userId);
  return {
    table: 'pets',
    localCount: local.length,
    cloudCountBefore: before,
    cloudCountAfter: after,
    attempted: local.length,
    succeeded: r.succeeded,
    failed: r.failed
  };
}

async function syncAchievements(userId: string): Promise<TableSyncReport> {
  const local = await db.achievements.toArray();
  const before = await cloudCount('achievements', userId);
  const r = await uploadPerRow({
    table: 'achievements',
    conflictBy: 'user_id,achievement_id',
    items: local,
    toPayload: (a) => achievementToRemote(a, userId),
    idOf: (a) => a.id
  });
  const after = await cloudCount('achievements', userId);
  return {
    table: 'achievements',
    localCount: local.length,
    cloudCountBefore: before,
    cloudCountAfter: after,
    attempted: local.length,
    succeeded: r.succeeded,
    failed: r.failed
  };
}

async function syncCreatureUnlocks(userId: string): Promise<TableSyncReport> {
  const local = await db.creatureUnlocks.toArray();
  const before = await cloudCount('creature_unlocks', userId);
  const r = await uploadPerRow({
    table: 'creature_unlocks',
    conflictBy: 'user_id,creature_id',
    items: local,
    toPayload: (u) => creatureUnlockToRemote(u, userId),
    idOf: (u) => u.creatureId
  });
  const after = await cloudCount('creature_unlocks', userId);
  return {
    table: 'creature_unlocks',
    localCount: local.length,
    cloudCountBefore: before,
    cloudCountAfter: after,
    attempted: local.length,
    succeeded: r.succeeded,
    failed: r.failed
  };
}

async function syncTasks(userId: string): Promise<TableSyncReport[]> {
  // user_tasks — uuid id 用 cloudId 對齊;沒 cloudId 的本機 task 生一個
  const tasks = await db.userTasks.toArray();
  const tasksBefore = await cloudCount('user_tasks', userId);
  let tasksOk = 0;
  const tasksFailed: { id: string; reason: string }[] = [];
  for (const t of tasks) {
    let cloudId = t.cloudId;
    if (!cloudId) {
      cloudId = crypto.randomUUID();
      // 補寫 cloudId 回本機,讓後續 sync 認得
      if (t.id !== undefined) {
        try {
          await db.userTasks.update(t.id, { cloudId });
        } catch {
          // 本機更新失敗不致命,繼續上雲(下次再補)
        }
      }
    }
    try {
      const { error } = await supabase
        .from('user_tasks')
        .upsert(userTaskToRemote(t, userId, cloudId), { onConflict: 'id' });
      if (error) {
        tasksFailed.push({
          id: `${t.id ?? '?'} (${t.taskKey})`,
          reason: `${error.code ?? '?'} ${error.message}`
        });
      } else {
        tasksOk++;
      }
    } catch (e) {
      tasksFailed.push({
        id: `${t.id ?? '?'} (${t.taskKey})`,
        reason: e instanceof Error ? e.message : String(e)
      });
    }
  }
  const tasksAfter = await cloudCount('user_tasks', userId);
  const tasksReport: TableSyncReport = {
    table: 'user_tasks',
    localCount: tasks.length,
    cloudCountBefore: tasksBefore,
    cloudCountAfter: tasksAfter,
    attempted: tasks.length,
    succeeded: tasksOk,
    failed: tasksFailed
  };

  // milestone_rewards
  const ms = await db.milestoneRewards.toArray();
  const msBefore = await cloudCount('milestone_rewards', userId);
  const msR = await uploadPerRow({
    table: 'milestone_rewards',
    conflictBy: 'user_id,milestone_day',
    items: ms,
    toPayload: (m) => milestoneToRemote(m, userId),
    idOf: (m) => `day=${m.milestoneDay}`
  });
  const msAfter = await cloudCount('milestone_rewards', userId);
  const msReport: TableSyncReport = {
    table: 'milestone_rewards',
    localCount: ms.length,
    cloudCountBefore: msBefore,
    cloudCountAfter: msAfter,
    attempted: ms.length,
    succeeded: msR.succeeded,
    failed: msR.failed
  };

  return [tasksReport, msReport];
}

// ─── 主入口 ──────────────────────────────────────────

export async function forceSyncAllToCloud(): Promise<ForceSyncResult> {
  const startedAt = Date.now();
  // eslint-disable-next-line no-console
  console.log('[forceSync] === BEGIN ===');

  if (!isCloudConfigured) {
    console.warn('[forceSync] isCloudConfigured=false,跳過');
    return {
      ok: false,
      userId: null,
      reports: [],
      totalAttempted: 0,
      totalSucceeded: 0,
      totalFailed: 0,
      durationMs: Date.now() - startedAt
    };
  }

  const userId = await getUserIdOrNull();
  if (!userId) {
    console.warn('[forceSync] 未登入,跳過');
    return {
      ok: false,
      userId: null,
      reports: [],
      totalAttempted: 0,
      totalSucceeded: 0,
      totalFailed: 0,
      durationMs: Date.now() - startedAt
    };
  }

  const reports: TableSyncReport[] = [];

  // 各 table 平行跑,加快整體時間(每個內部仍是 per-row,不會互相干擾)
  const settled = await Promise.allSettled([
    syncSettings(userId),
    syncLoginStreak(userId),
    syncCultivation(userId),
    syncHoldings(userId),
    syncPets(userId),
    syncAchievements(userId),
    syncCreatureUnlocks(userId),
    syncTasks(userId)
  ]);

  for (const s of settled) {
    if (s.status === 'fulfilled') {
      const v = s.value;
      if (Array.isArray(v)) {
        for (const r of v) {
          reports.push(r);
          logReport(r);
        }
      } else {
        reports.push(v);
        logReport(v);
      }
    } else {
      console.error('[forceSync] table sync threw:', s.reason);
    }
  }

  const totalAttempted = reports.reduce((s, r) => s + r.attempted, 0);
  const totalSucceeded = reports.reduce((s, r) => s + r.succeeded, 0);
  const totalFailed = reports.reduce((s, r) => s + r.failed.length, 0);
  const durationMs = Date.now() - startedAt;

  // eslint-disable-next-line no-console
  console.log(
    `[forceSync] === DONE === 嘗試 ${totalAttempted},成功 ${totalSucceeded},失敗 ${totalFailed},耗時 ${durationMs}ms`
  );

  return {
    ok: totalFailed === 0,
    userId,
    reports,
    totalAttempted,
    totalSucceeded,
    totalFailed,
    durationMs
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 反向 — 把雲端拉進本機 Dexie
// ═══════════════════════════════════════════════════════════════════════════
//
// 用情境:無痕視窗 / 新裝置首次登入。本機 Dexie 是空的(或 seedIfEmpty 只放
// 預設值),Repository 的 stale-while-revalidate 自帶 throttle + auth race,
// 第一次 list() 拿到 [] 後 useLiveQuery 不會被任何 Dexie 寫入 retrigger →
// UI 永遠空。
//
// `forceFetchAllFromCloud()` 在登入後 post-init 主動跑一次:fetch 雲端 →
// bulkPut 進本機 Dexie。Dexie 寫入會觸發 useLiveQuery 重跑,UI 自動補上。
//
// 注意 idempotent:同 user 重複呼叫只是 overwrite local 為 cloud 值,不會
// 造成資料增生。
//
// 設計上**不依賴各 Repository 內部 toLocal**(避免循環 import),自己 inline
// fromRemote mapper。對應的 toRemote(在本檔上面)已存在,兩兩成對。

export interface TableFetchReport {
  table: string;
  cloudCount: number;
  localCountBefore: number;
  localCountAfter: number;
  succeeded: boolean;
  error?: string;
}

export interface ForceFetchResult {
  ok: boolean;
  userId: string | null;
  reports: TableFetchReport[];
  totalRowsPulled: number;
  durationMs: number;
}

// ─── 本機 count helper ───────────────────────────────

function logFetchReport(r: TableFetchReport): void {
  if (r.succeeded) {
    // eslint-disable-next-line no-console
    console.log(
      `[forceFetch] ${r.table}: 雲端 ${r.cloudCount} 筆 → 本機 ${r.localCountBefore} → ${r.localCountAfter}`
    );
  } else {
    console.warn(`[forceFetch] ${r.table} 失敗: ${r.error ?? 'unknown'}`);
  }
}

// ─── inline fromRemote mapper(對應上方 toRemote) ───

function settingsFromRemote(r: {
  brokerage_fee_discount: number;
  brokerage_min_fee: number;
  sound_enabled: boolean;
  unlocked_backgrounds: string[];
  current_background: string;
  hud_theme: HudTheme;
  unlocked_hud_themes: HudTheme[];
  updated_at?: string;
}, existing: Settings | undefined): Settings {
  const baseline: Settings = existing ?? {
    id: 'singleton',
    brokerageFeeDiscount: 1.0,
    brokerageMinFee: 20,
    soundEnabled: true,
    createdAt: Date.now(),
    consecutiveDays: 0,
    maxConsecutiveDays: 0
  };
  return {
    ...baseline,
    brokerageFeeDiscount: r.brokerage_fee_discount,
    brokerageMinFee: r.brokerage_min_fee,
    soundEnabled: r.sound_enabled,
    unlockedBackgrounds: r.unlocked_backgrounds,
    currentBackground: r.current_background,
    hudTheme: r.hud_theme,
    unlockedHudThemes: r.unlocked_hud_themes,
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now()
  };
}

function holdingFromRemote(r: {
  code: string;
  shares: number;
  avg_cost: number;
  total_cost: number;
  realized_pnl: number;
  first_purchased_at: string;
  last_transaction_at: string;
}, existing: Holding | undefined): Holding {
  return {
    code: r.code,
    shares: r.shares,
    avgCost: r.avg_cost,
    totalCost: r.total_cost,
    realizedPnL: r.realized_pnl,
    firstPurchasedAt: Date.parse(r.first_purchased_at),
    lastTransactionAt: Date.parse(r.last_transaction_at),
    petId: existing?.petId ?? crypto.randomUUID()
  };
}

function petFromRemote(r: {
  id: string;
  code: string;
  species_id: string;
  level: number;
  custom_name: string | null;
  born_at: string;
  retired_at: string | null;
  color_variant: Pet['colorVariant'];
  boosted_days: number;
  effect_boost_until: string | null;
  is_eternal: boolean;
  eternal_date: string | null;
  final_effect: Pet['finalEffect'];
}, existing: Pet | undefined): Pet {
  return {
    id: r.id,
    code: r.code,
    speciesId: r.species_id,
    level: r.level,
    customName: r.custom_name ?? undefined,
    bornAt: Date.parse(r.born_at),
    retiredAt: r.retired_at ? Date.parse(r.retired_at) : undefined,
    colorVariant: r.color_variant,
    boostedDays: r.boosted_days,
    effectBoostUntil: r.effect_boost_until ? Date.parse(r.effect_boost_until) : undefined,
    isEternal: r.is_eternal,
    eternalDate: r.eternal_date ? Date.parse(r.eternal_date) : undefined,
    finalEffect: r.final_effect ?? undefined,
    // 本機 UI 狀態保留
    lastRealmCheck: existing?.lastRealmCheck,
    lastEffectCheck: existing?.lastEffectCheck
  };
}

function cultivationFromRemote(r: {
  total_points: number;
  lifetime_earned: number;
  lifetime_spent: number;
  updated_at?: string;
}): UserCultivation {
  return {
    id: 'main',
    amount: r.total_points,
    lifetimeEarned: r.lifetime_earned,
    lifetimeSpent: r.lifetime_spent,
    lastUpdated: r.updated_at ? new Date(r.updated_at).getTime() : Date.now()
  };
}

function loginStreakFromRemote(r: {
  current_streak: number;
  max_streak: number;
  last_login_date: string;
  today_claimed: boolean;
  updated_at?: string;
}, existing: LoginStreak | undefined): LoginStreak {
  return {
    id: 'main',
    currentStreak: r.current_streak,
    longestStreak: r.max_streak,
    lastLoginDate: r.last_login_date,
    todayClaimed: r.today_claimed,
    lifetimeLogins: existing?.lifetimeLogins ?? 0,
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now()
  };
}

function achievementFromRemote(r: {
  achievement_id: string;
  progress: number;
  unlocked_at: string | null;
}): AchievementProgress {
  return {
    id: r.achievement_id,
    current: r.progress,
    unlockedAt: r.unlocked_at ? new Date(r.unlocked_at).getTime() : undefined
  };
}

function creatureUnlockFromRemote(r: {
  creature_id: string;
  unlocked_at: string;
}): CreatureUnlock {
  return {
    creatureId: r.creature_id,
    unlockedAt: new Date(r.unlocked_at).getTime()
  };
}

function userTaskFromRemote(r: {
  id: string;
  task_key: string;
  task_type: string;
  progress: number;
  completed: boolean;
  claimed: boolean;
  created_at: string;
}, existing: UserTask | undefined): UserTask | null {
  // 雲端有 task 但本機沒對應 row → 沒辦法 reconstruct title/description/target/reward
  // (這些只存在 task pool 靜態定義 + 本機原始建立時的 row)。若 existing 有 → 寫入更新;
  // 沒有 → 跳過(等本機自己生成 task 再去雲端 dedupe by cloudId)。
  // 未來改進:把 task pool definitions 也搬上雲。
  if (!existing) return null;
  return {
    ...existing,
    cloudId: r.id,
    progress: r.progress,
    completed: r.completed,
    claimed: r.claimed
  };
}

function milestoneFromRemote(r: {
  milestone_day: number;
  claimed_at: string;
}): MilestoneReward {
  return {
    milestoneDay: r.milestone_day,
    claimedAt: new Date(r.claimed_at).getTime()
  };
}

// ─── 各表 fetch ──────────────────────────────────────

async function fetchSettings(userId: string): Promise<TableFetchReport> {
  const before = await db.settings.count();
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return {
        table: 'user_settings',
        cloudCount: 0,
        localCountBefore: before,
        localCountAfter: before,
        succeeded: true
      };
    }
    const existing = await db.settings.get('singleton');
    await db.settings.put(settingsFromRemote(data, existing));
    return {
      table: 'user_settings',
      cloudCount: 1,
      localCountBefore: before,
      localCountAfter: await db.settings.count(),
      succeeded: true
    };
  } catch (e) {
    return {
      table: 'user_settings',
      cloudCount: -1,
      localCountBefore: before,
      localCountAfter: before,
      succeeded: false,
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

async function fetchLoginStreak(userId: string): Promise<TableFetchReport> {
  const before = await db.userLoginStreak.count();
  try {
    const { data, error } = await supabase
      .from('user_login_streak')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return {
        table: 'user_login_streak',
        cloudCount: 0,
        localCountBefore: before,
        localCountAfter: before,
        succeeded: true
      };
    }
    const existing = await db.userLoginStreak.get('main');
    await db.userLoginStreak.put(loginStreakFromRemote(data, existing));
    return {
      table: 'user_login_streak',
      cloudCount: 1,
      localCountBefore: before,
      localCountAfter: await db.userLoginStreak.count(),
      succeeded: true
    };
  } catch (e) {
    return {
      table: 'user_login_streak',
      cloudCount: -1,
      localCountBefore: before,
      localCountAfter: before,
      succeeded: false,
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

async function fetchCultivation(userId: string): Promise<TableFetchReport> {
  const before = await db.userCultivation.count();
  try {
    const { data, error } = await supabase
      .from('user_cultivation')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return {
        table: 'user_cultivation',
        cloudCount: 0,
        localCountBefore: before,
        localCountAfter: before,
        succeeded: true
      };
    }
    await db.userCultivation.put(cultivationFromRemote(data));
    return {
      table: 'user_cultivation',
      cloudCount: 1,
      localCountBefore: before,
      localCountAfter: await db.userCultivation.count(),
      succeeded: true
    };
  } catch (e) {
    return {
      table: 'user_cultivation',
      cloudCount: -1,
      localCountBefore: before,
      localCountAfter: before,
      succeeded: false,
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

async function fetchHoldings(userId: string): Promise<TableFetchReport> {
  const before = await db.holdings.count();
  try {
    const { data, error } = await supabase
      .from('holdings')
      .select('*')
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Parameters<typeof holdingFromRemote>[0][];
    if (rows.length > 0) {
      const existingMap = new Map<string, Holding>();
      for (const h of await db.holdings.toArray()) existingMap.set(h.code, h);
      const local = rows.map((r) => holdingFromRemote(r, existingMap.get(r.code)));
      await db.holdings.bulkPut(local);
    }
    return {
      table: 'holdings',
      cloudCount: rows.length,
      localCountBefore: before,
      localCountAfter: await db.holdings.count(),
      succeeded: true
    };
  } catch (e) {
    return {
      table: 'holdings',
      cloudCount: -1,
      localCountBefore: before,
      localCountAfter: before,
      succeeded: false,
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

async function fetchPets(userId: string): Promise<TableFetchReport> {
  const before = await db.pets.count();
  try {
    const { data, error } = await supabase
      .from('pets')
      .select('*')
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Parameters<typeof petFromRemote>[0][];
    if (rows.length > 0) {
      const existingMap = new Map<string, Pet>();
      for (const p of await db.pets.toArray()) existingMap.set(p.id, p);
      const local = rows.map((r) => petFromRemote(r, existingMap.get(r.id)));
      await db.pets.bulkPut(local);
    }
    return {
      table: 'pets',
      cloudCount: rows.length,
      localCountBefore: before,
      localCountAfter: await db.pets.count(),
      succeeded: true
    };
  } catch (e) {
    return {
      table: 'pets',
      cloudCount: -1,
      localCountBefore: before,
      localCountAfter: before,
      succeeded: false,
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

async function fetchTransactions(userId: string): Promise<TableFetchReport> {
  const before = await db.transactions.count();
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{
      id: string;
      code: string;
      type: 'buy' | 'feed' | 'sell';
      shares: number;
      price: number;
      gross_amount: number;
      fee: number;
      tax: number;
      net_amount: number;
      realized_pnl: number;
      timestamp: string;
      note: string | null;
    }>;
    if (rows.length > 0) {
      const local = rows.map((r) => ({
        id: r.id,
        code: r.code,
        type: r.type,
        shares: r.shares,
        price: r.price,
        grossAmount: r.gross_amount,
        fee: r.fee,
        tax: r.tax,
        netAmount: r.net_amount,
        realizedPnL: r.realized_pnl,
        timestamp: Date.parse(r.timestamp),
        note: r.note ?? undefined
      }));
      await db.transactions.bulkPut(local);
    }
    return {
      table: 'transactions',
      cloudCount: rows.length,
      localCountBefore: before,
      localCountAfter: await db.transactions.count(),
      succeeded: true
    };
  } catch (e) {
    return {
      table: 'transactions',
      cloudCount: -1,
      localCountBefore: before,
      localCountAfter: before,
      succeeded: false,
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

async function fetchAchievements(userId: string): Promise<TableFetchReport> {
  const before = await db.achievements.count();
  try {
    const { data, error } = await supabase
      .from('achievements')
      .select('*')
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Parameters<typeof achievementFromRemote>[0][];
    if (rows.length > 0) {
      await db.achievements.bulkPut(rows.map(achievementFromRemote));
    }
    return {
      table: 'achievements',
      cloudCount: rows.length,
      localCountBefore: before,
      localCountAfter: await db.achievements.count(),
      succeeded: true
    };
  } catch (e) {
    return {
      table: 'achievements',
      cloudCount: -1,
      localCountBefore: before,
      localCountAfter: before,
      succeeded: false,
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

async function fetchCreatureUnlocks(userId: string): Promise<TableFetchReport> {
  const before = await db.creatureUnlocks.count();
  try {
    const { data, error } = await supabase
      .from('creature_unlocks')
      .select('*')
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Parameters<typeof creatureUnlockFromRemote>[0][];
    if (rows.length > 0) {
      // creatureUnlocks 用 &creatureId 唯一索引,直接 bulkPut 會 throw;
      // 個別塞 + try/catch 避開重複
      for (const r of rows) {
        const local = creatureUnlockFromRemote(r);
        const existing = await db.creatureUnlocks
          .where('creatureId')
          .equals(local.creatureId)
          .first();
        if (existing) continue;
        try {
          await db.creatureUnlocks.add(local);
        } catch {
          // race / 唯一索引衝突 — 跳過
        }
      }
    }
    return {
      table: 'creature_unlocks',
      cloudCount: rows.length,
      localCountBefore: before,
      localCountAfter: await db.creatureUnlocks.count(),
      succeeded: true
    };
  } catch (e) {
    return {
      table: 'creature_unlocks',
      cloudCount: -1,
      localCountBefore: before,
      localCountAfter: before,
      succeeded: false,
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

async function fetchTasks(userId: string): Promise<TableFetchReport[]> {
  const beforeTasks = await db.userTasks.count();
  const beforeMs = await db.milestoneRewards.count();

  // user_tasks
  let tasksReport: TableFetchReport;
  try {
    const { data, error } = await supabase
      .from('user_tasks')
      .select('*')
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Parameters<typeof userTaskFromRemote>[0][];
    let written = 0;
    if (rows.length > 0) {
      const allLocal = await db.userTasks.toArray();
      const byCloudId = new Map<string, UserTask>();
      for (const t of allLocal) {
        if (t.cloudId) byCloudId.set(t.cloudId, t);
      }
      for (const r of rows) {
        const existing = byCloudId.get(r.id);
        const merged = userTaskFromRemote(r, existing);
        if (!merged || existing?.id === undefined) continue;
        await db.userTasks.update(existing.id, {
          cloudId: merged.cloudId,
          progress: merged.progress,
          completed: merged.completed,
          claimed: merged.claimed
        });
        written++;
      }
    }
    tasksReport = {
      table: 'user_tasks',
      cloudCount: rows.length,
      localCountBefore: beforeTasks,
      localCountAfter: await db.userTasks.count(),
      succeeded: true,
      error: written < rows.length
        ? `${rows.length - written} 筆雲端 task 本機無對應 row 跳過(等本機重生 task 再 dedupe)`
        : undefined
    };
  } catch (e) {
    tasksReport = {
      table: 'user_tasks',
      cloudCount: -1,
      localCountBefore: beforeTasks,
      localCountAfter: beforeTasks,
      succeeded: false,
      error: e instanceof Error ? e.message : String(e)
    };
  }

  // milestone_rewards
  let msReport: TableFetchReport;
  try {
    const { data, error } = await supabase
      .from('milestone_rewards')
      .select('*')
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Parameters<typeof milestoneFromRemote>[0][];
    for (const r of rows) {
      const local = milestoneFromRemote(r);
      const existing = await db.milestoneRewards
        .where('milestoneDay')
        .equals(local.milestoneDay)
        .first();
      if (existing) continue;
      try {
        await db.milestoneRewards.add(local);
      } catch {
        // race / 唯一索引衝突 — 跳過
      }
    }
    msReport = {
      table: 'milestone_rewards',
      cloudCount: rows.length,
      localCountBefore: beforeMs,
      localCountAfter: await db.milestoneRewards.count(),
      succeeded: true
    };
  } catch (e) {
    msReport = {
      table: 'milestone_rewards',
      cloudCount: -1,
      localCountBefore: beforeMs,
      localCountAfter: beforeMs,
      succeeded: false,
      error: e instanceof Error ? e.message : String(e)
    };
  }

  return [tasksReport, msReport];
}

// ─── 主入口 ──────────────────────────────────────────

/**
 * 把雲端**所有 user-owned 表**拉進本機 Dexie,適合新裝置 / 無痕視窗首次登入。
 *
 * 為什麼需要這個:
 *   - 各 Repository 的 stale-while-revalidate 在 boot race(cachedUserId 還沒
 *     就緒)時被 Bug A 抵擋早退,後續沒有 trigger 重跑 list() → 永遠 [] → 白屏。
 *   - settingsRepo 還有「local newer than cloud」邏輯,本機 seedIfEmpty 剛塞的
 *     預設值 updatedAt=NOW > 雲端 updated_at(幾天前) → 雲端永遠勝不過本機預設。
 *
 * 此函式:
 *   1. 一次性 SELECT 8 個表(平行)
 *   2. bulkPut 進本機 Dexie(overwrite 預設值)
 *   3. useLiveQuery 訂閱 Dexie 變動 → UI 自動 retrigger
 */
export async function forceFetchAllFromCloud(): Promise<ForceFetchResult> {
  const startedAt = Date.now();
  // eslint-disable-next-line no-console
  console.log('[forceFetch] === BEGIN ===');

  if (!isCloudConfigured) {
    console.warn('[forceFetch] isCloudConfigured=false,跳過');
    return {
      ok: false,
      userId: null,
      reports: [],
      totalRowsPulled: 0,
      durationMs: Date.now() - startedAt
    };
  }

  const userId = await getUserIdOrNull();
  if (!userId) {
    console.warn('[forceFetch] 未登入,跳過');
    return {
      ok: false,
      userId: null,
      reports: [],
      totalRowsPulled: 0,
      durationMs: Date.now() - startedAt
    };
  }

  const settled = await Promise.allSettled([
    fetchSettings(userId),
    fetchLoginStreak(userId),
    fetchCultivation(userId),
    fetchHoldings(userId),
    fetchPets(userId),
    fetchTransactions(userId),
    fetchAchievements(userId),
    fetchCreatureUnlocks(userId),
    fetchTasks(userId)
  ]);

  const reports: TableFetchReport[] = [];
  for (const s of settled) {
    if (s.status === 'fulfilled') {
      const v = s.value;
      if (Array.isArray(v)) {
        for (const r of v) {
          reports.push(r);
          logFetchReport(r);
        }
      } else {
        reports.push(v);
        logFetchReport(v);
      }
    } else {
      console.error('[forceFetch] table fetch threw:', s.reason);
    }
  }

  const totalRowsPulled = reports.reduce(
    (s, r) => s + (r.cloudCount > 0 ? r.cloudCount : 0),
    0
  );
  const durationMs = Date.now() - startedAt;
  const failed = reports.filter((r) => !r.succeeded).length;

  // eslint-disable-next-line no-console
  console.log(
    `[forceFetch] === DONE === 拉回 ${totalRowsPulled} 列,失敗 ${failed} 個表,耗時 ${durationMs}ms`
  );

  return {
    ok: failed === 0,
    userId,
    reports,
    totalRowsPulled,
    durationMs
  };
}
