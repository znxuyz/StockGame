/**
 * 階段 3D 批 2 — `taskRepo`:同時包雲端 `user_tasks` + `milestone_rewards`
 * 兩張表。
 *
 * 沿用 settingsRepo 模板;list 用 stale-while-revalidate,write 樂觀更新 +
 * cloud sync。caller 全在 Dexie tx 外,**不用 tx-detection**。
 *
 * ──────────── 雲端 vs 本機欄位範圍 ────────────
 *
 *  ── user_tasks 表 ──
 *  ✅ 上雲(white-list):
 *     - id               uuid,crypto.randomUUID() 生成存進 UserTask.cloudId
 *     - user_id
 *     - task_key         ← UserTask.taskKey
 *     - task_type        ← UserTask.taskType('daily' | 'weekly')
 *     - progress
 *     - completed
 *     - claimed
 *     - created_at       ← UserTask.generatedAt(unix ms → timestamptz)
 *
 *  ❌ 本機限定(task pool 靜態定義):
 *     - id(number)      Dexie auto-increment 主鍵
 *     - title / description / target / reward / triggerEvent / resetAt
 *       — 從 task pool 查回;雲端不重複存
 *
 *  cloudId bridging:本機 id 保持 number,雲端 id 是 uuid;`UserTask.cloudId`
 *  存對應的 uuid。`addTask` 時生 uuid;cloud refetch 用 cloudId dedupe。
 *
 *  ── milestone_rewards 表 ──
 *  ✅ 上雲(white-list):
 *     - user_id
 *     - milestone_day    ← MilestoneReward.milestoneDay
 *     - claimed_at       ← MilestoneReward.claimedAt(unix ms → timestamptz)
 *
 *  ❌ 本機限定:
 *     - id(Dexie auto-increment;雲端用 (user_id, milestone_day) 複合 PK)
 *
 * ──────────── 寫失敗策略 ────────────
 *
 *  - tasks(addTask / patchTask / deleteTasksByType):雲端失敗只 console.warn +
 *    toast,**不 rollback** 本機。任務動作冪等性低(progress 累加 / claimed
 *    觸發 reward 都不該重做),rollback 會造成 progress 跳動 / 重複領 reward。
 *  - milestone(addMilestone):雲端 unique violation 視為 idempotent success;
 *    其他失敗 toast,**不 rollback** 本機(玩家已領 reward)。
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { supabase, isCloudConfigured } from '@/lib/supabase';
import { eventBus } from '@/services/eventBus';
import type { UserTask, MilestoneReward } from '@/types';

type TaskType = UserTask['taskType'];

// ─── helper ──────────────────────────────────────────

async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

// ─── 公開 interface(不變)─────────────────────────────

export interface TaskRepository {
  // userTasks
  listAllTasks(): Promise<UserTask[]>;
  listTasksByType(type: TaskType): Promise<UserTask[]>;
  getTask(id: number): Promise<UserTask | undefined>;
  addTask(t: Omit<UserTask, 'id'>): Promise<number>;
  patchTask(id: number, partial: Partial<UserTask>): Promise<void>;
  deleteTasksByType(type: TaskType): Promise<void>;

  // milestoneRewards
  countMilestones(): Promise<number>;
  getMilestoneByDay(day: number): Promise<MilestoneReward | undefined>;
  addMilestone(m: Omit<MilestoneReward, 'id'>): Promise<number>;
}

// ─── 雲端 ↔ 本機 mapper ──────────────────────────────

interface RemoteUserTask {
  id: string; // uuid
  user_id: string;
  task_key: string;
  task_type: TaskType;
  progress: number;
  completed: boolean;
  claimed: boolean;
  created_at: string; // ISO timestamptz
}

function userTaskToRemote(
  t: UserTask,
  cloudId: string,
  userId: string
): RemoteUserTask {
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

/** 雲端 row 套用到本機 — `existing` 提供 task pool 帶來的本機限定欄位 */
function userTaskApplyCloud(
  remote: RemoteUserTask,
  existing: UserTask | undefined
): UserTask | null {
  // 沒對應 local entry 跟 task pool 查不到 → 跳過(無法構造完整 UserTask:
  // title / description / target / reward / triggerEvent / resetAt 都缺)
  if (!existing) return null;
  return {
    ...existing,
    cloudId: remote.id,
    progress: remote.progress,
    completed: remote.completed,
    claimed: remote.claimed
    // taskKey / taskType / generatedAt 維持 existing 值(本機已正確;
    // 雲端應該一致,以本機 task pool 為準)
  };
}

interface RemoteMilestone {
  user_id: string;
  milestone_day: number;
  claimed_at: string; // ISO timestamptz
}

function milestoneToRemote(m: MilestoneReward, userId: string): RemoteMilestone {
  return {
    user_id: userId,
    milestone_day: m.milestoneDay,
    claimed_at: new Date(m.claimedAt).toISOString()
  };
}

function milestoneToLocal(remote: RemoteMilestone): Omit<MilestoneReward, 'id'> {
  return {
    milestoneDay: remote.milestone_day,
    claimedAt: Date.parse(remote.claimed_at)
  };
}

// ─── Dexie-only impl(dev fallback)─────────────────

class DexieTaskRepo implements TaskRepository {
  listAllTasks(): Promise<UserTask[]> {
    return db.userTasks.toArray();
  }
  listTasksByType(type: TaskType): Promise<UserTask[]> {
    return db.userTasks.where('taskType').equals(type).toArray();
  }
  getTask(id: number): Promise<UserTask | undefined> {
    return db.userTasks.get(id);
  }
  async addTask(t: Omit<UserTask, 'id'>): Promise<number> {
    return db.userTasks.add(t as UserTask);
  }
  async patchTask(id: number, partial: Partial<UserTask>): Promise<void> {
    await db.userTasks.update(id, partial);
  }
  async deleteTasksByType(type: TaskType): Promise<void> {
    await db.userTasks.where('taskType').equals(type).delete();
  }
  countMilestones(): Promise<number> {
    return db.milestoneRewards.count();
  }
  getMilestoneByDay(day: number): Promise<MilestoneReward | undefined> {
    return db.milestoneRewards.where('milestoneDay').equals(day).first();
  }
  async addMilestone(m: Omit<MilestoneReward, 'id'>): Promise<number> {
    return db.milestoneRewards.add(m as MilestoneReward);
  }
}

// ─── Cloud-first impl ──────────────────────────────

const REVALIDATE_INTERVAL_MS = 10_000;
let lastTasksRevalidateAt = 0;
let lastMilestonesRevalidateAt = 0;

class CloudFirstTaskRepo implements TaskRepository {
  // ── userTasks ──

  async listAllTasks(): Promise<UserTask[]> {
    try {
      const local = await db.userTasks.toArray();
      void this.scheduleTasksRevalidate();
      return local;
    } catch (e) {
      console.error('[taskRepo] listAllTasks failed:', e);
      return [];
    }
  }

  async listTasksByType(type: TaskType): Promise<UserTask[]> {
    try {
      const local = await db.userTasks.where('taskType').equals(type).toArray();
      void this.scheduleTasksRevalidate();
      return local;
    } catch (e) {
      console.error('[taskRepo] listTasksByType failed:', e);
      return [];
    }
  }

  getTask(id: number): Promise<UserTask | undefined> {
    return db.userTasks.get(id);
  }

  async addTask(t: Omit<UserTask, 'id'>): Promise<number> {
    // 1. 樂觀本機 add(用 crypto.randomUUID 生 cloudId 一起存)
    const cloudId = crypto.randomUUID();
    const withCloudId = { ...t, cloudId } as UserTask;
    const localId = await db.userTasks.add(withCloudId);

    // 2. 沒 auth → 本機-only
    const userId = await getCurrentUserId();
    if (!userId) return localId;

    // 3. cloud insert — 失敗只 toast,**不 rollback**(任務動作冪等性低)
    try {
      const { error } = await supabase
        .from('user_tasks')
        .insert(userTaskToRemote(withCloudId, cloudId, userId));
      if (error && error.code !== '23505') throw new Error(error.message);
    } catch (e) {
      console.warn('[taskRepo] addTask cloud insert failed:', e);
      eventBus.emit('toast:show', {
        message: '任務雲端同步失敗(本機已建立)',
        variant: 'error'
      });
    }
    return localId;
  }

  async patchTask(id: number, partial: Partial<UserTask>): Promise<void> {
    const local = await db.userTasks.get(id);
    if (!local) return;

    // 1. 樂觀本機 update
    await db.userTasks.update(id, partial);

    // 2. 沒 cloudId(legacy 本機-only entry)→ 不 sync 雲端
    if (!local.cloudId) return;

    // 3. 沒 auth → 本機-only
    const userId = await getCurrentUserId();
    if (!userId) return;

    // 4. cloud upsert(only sync 白名單 fields,partial 可能有非雲端欄位)
    const updated: UserTask = { ...local, ...partial };
    try {
      const { error } = await supabase
        .from('user_tasks')
        .upsert(userTaskToRemote(updated, local.cloudId, userId), {
          onConflict: 'id'
        });
      if (error) throw new Error(error.message);
    } catch (e) {
      console.warn('[taskRepo] patchTask cloud upsert failed:', e);
      eventBus.emit('toast:show', {
        message: '任務進度同步失敗(本機已更新)',
        variant: 'error'
      });
    }
  }

  async deleteTasksByType(type: TaskType): Promise<void> {
    // 1. 樂觀本機 delete(取 cloudIds 用於後續雲端 delete)
    const matching = await db.userTasks.where('taskType').equals(type).toArray();
    const cloudIds = matching
      .map((t) => t.cloudId)
      .filter((id): id is string => !!id);
    await db.userTasks.where('taskType').equals(type).delete();

    // 2. 沒 auth → 本機-only
    const userId = await getCurrentUserId();
    if (!userId) return;
    if (cloudIds.length === 0) return;

    // 3. cloud delete by user_id + task_type — 失敗只 toast 不 rollback
    try {
      const { error } = await supabase
        .from('user_tasks')
        .delete()
        .eq('user_id', userId)
        .eq('task_type', type);
      if (error) throw new Error(error.message);
    } catch (e) {
      console.warn('[taskRepo] deleteTasksByType cloud delete failed:', e);
      eventBus.emit('toast:show', {
        message: '舊任務雲端清除失敗(本機已清)',
        variant: 'error'
      });
    }
  }

  // ── milestoneRewards ──

  countMilestones(): Promise<number> {
    return db.milestoneRewards.count();
  }

  getMilestoneByDay(day: number): Promise<MilestoneReward | undefined> {
    void this.scheduleMilestonesRevalidate();
    return db.milestoneRewards.where('milestoneDay').equals(day).first();
  }

  async addMilestone(m: Omit<MilestoneReward, 'id'>): Promise<number> {
    // 1. 樂觀本機 add(&milestoneDay 唯一索引,race 時 throw → caller catch)
    const localId = await db.milestoneRewards.add(m as MilestoneReward);

    const userId = await getCurrentUserId();
    if (!userId) return localId;

    // 2. cloud insert — 玩家已領 reward,**不 rollback**;unique violation 視為 idempotent
    try {
      const { error } = await supabase
        .from('milestone_rewards')
        .insert(milestoneToRemote(m as MilestoneReward, userId));
      if (error && error.code !== '23505') throw new Error(error.message);
    } catch (e) {
      console.warn('[taskRepo] addMilestone cloud insert failed:', e);
      eventBus.emit('toast:show', {
        message: '里程碑同步失敗(本機已領)',
        variant: 'error'
      });
    }
    return localId;
  }

  // ─ private revalidate ─

  private async scheduleTasksRevalidate(): Promise<void> {
    const now = Date.now();
    if (now - lastTasksRevalidateAt < REVALIDATE_INTERVAL_MS) return;

    // **Race fix**:throttle slot 同步 claim,auth 失敗才 release(見 cultivationRepo)
    lastTasksRevalidateAt = now;
    let userId: string | null;
    try {
      userId = await getCurrentUserId();
    } catch {
      lastTasksRevalidateAt = 0;
      return;
    }
    if (!userId) {
      lastTasksRevalidateAt = 0;
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_tasks')
        .select('*')
        .eq('user_id', userId);
      if (error) throw new Error(error.message);
      if (!data) return;

      if (data.length === 0) {
        // 雲端空 + 本機有 → 一次性 seed(用本機 cloudId 或新生 uuid)
        const local = await db.userTasks.toArray();
        if (local.length === 0) return;
        const rows: RemoteUserTask[] = [];
        for (const t of local) {
          const cloudId = t.cloudId ?? crypto.randomUUID();
          if (!t.cloudId && t.id !== undefined) {
            // 補寫 cloudId 到本機,讓後續同步認得
            await db.userTasks.update(t.id, { cloudId });
          }
          rows.push(userTaskToRemote(t, cloudId, userId));
        }
        const { error: upErr } = await supabase
          .from('user_tasks')
          .upsert(rows, { onConflict: 'id' });
        if (upErr) throw new Error(upErr.message);
        return;
      }

      // 雲端有資料 → 用 cloudId 在本機找對應 entry,更新 progress/completed/claimed
      const allLocal = await db.userTasks.toArray();
      const byCloudId = new Map<string, UserTask>();
      for (const t of allLocal) {
        if (t.cloudId) byCloudId.set(t.cloudId, t);
      }
      for (const row of data as RemoteUserTask[]) {
        const existing = byCloudId.get(row.id);
        if (!existing || existing.id === undefined) continue;
        const merged = userTaskApplyCloud(row, existing);
        if (!merged) continue;
        await db.userTasks.update(existing.id, {
          progress: merged.progress,
          completed: merged.completed,
          claimed: merged.claimed,
          cloudId: merged.cloudId
        });
      }
    } catch (e) {
      console.warn('[taskRepo] tasks revalidate failed:', e);
    }
  }

  private async scheduleMilestonesRevalidate(): Promise<void> {
    const now = Date.now();
    if (now - lastMilestonesRevalidateAt < REVALIDATE_INTERVAL_MS) return;

    // **Race fix**:throttle slot 同步 claim,auth 失敗才 release(見 cultivationRepo)
    lastMilestonesRevalidateAt = now;
    let userId: string | null;
    try {
      userId = await getCurrentUserId();
    } catch {
      lastMilestonesRevalidateAt = 0;
      return;
    }
    if (!userId) {
      lastMilestonesRevalidateAt = 0;
      return;
    }

    try {
      const { data, error } = await supabase
        .from('milestone_rewards')
        .select('*')
        .eq('user_id', userId);
      if (error) throw new Error(error.message);
      if (!data) return;

      if (data.length === 0) {
        // 雲端空 → 本機 seed
        const local = await db.milestoneRewards.toArray();
        if (local.length > 0) {
          const rows = local.map((m) => milestoneToRemote(m, userId));
          const { error: upErr } = await supabase
            .from('milestone_rewards')
            .upsert(rows, { onConflict: 'user_id,milestone_day' });
          if (upErr) throw new Error(upErr.message);
        }
        return;
      }

      // 雲端有資料 → 拉進本機(本機 &milestoneDay 唯一索引,重複 add 會 throw,
      // 個別跳過避免整批中斷)
      for (const row of data as RemoteMilestone[]) {
        const existing = await db.milestoneRewards
          .where('milestoneDay')
          .equals(row.milestone_day)
          .first();
        if (existing) continue;
        try {
          await db.milestoneRewards.add(milestoneToLocal(row) as MilestoneReward);
        } catch {
          // race / 唯一索引衝突 — 跳過
        }
      }
    } catch (e) {
      console.warn('[taskRepo] milestones revalidate failed:', e);
    }
  }
}

// ─── factory + singleton ─────────────────────────────

export const taskRepo: TaskRepository = isCloudConfigured
  ? new CloudFirstTaskRepo()
  : new DexieTaskRepo();

export function useAllTasks(): UserTask[] | undefined {
  return useLiveQuery(() => taskRepo.listAllTasks(), []);
}

export function useDailyTasks(): UserTask[] | undefined {
  return useLiveQuery(() => taskRepo.listTasksByType('daily'), []);
}

export function useWeeklyTasks(): UserTask[] | undefined {
  return useLiveQuery(() => taskRepo.listTasksByType('weekly'), []);
}

export const dexieUserTasksTable = db.userTasks;
export const dexieMilestoneRewardsTable = db.milestoneRewards;
