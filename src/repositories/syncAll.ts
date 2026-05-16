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
