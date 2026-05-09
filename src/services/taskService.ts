/**
 * 任務系統服務(階段 3.1 — 基礎函式 only)。
 *
 * 三個責任:
 *   - incrementTaskProgress(triggerEvent, delta) — 收 event payload 後加進度
 *   - claimTaskReward(taskId) — 玩家點「領取」
 *   - getActiveTasks() — 任務 tab 列表用
 *
 * 階段 3.1 不做的事:
 *   ✗ 從 task pool 抽 daily / weekly 任務生成 → 階段 3.4 / 3.5
 *   ✗ eventBus listeners attach + emit 點埋進業務邏輯 → 階段 3.7
 *
 * 已知競態:
 *   incrementTaskProgress 走 filter().toArray().forEach update,
 *   不在同一個 db.transaction 內。連續高頻 emit(同一 event 在 0ms 內 ×2)
 *   可能拿同一 progress 值 +delta 兩次寫成 progress + delta 而不是 +2*delta。
 *   實務上每個 event 都來自 user action(buy/feed/click 等),頻率夠低不會撞,
 *   不防。若日後要嚴格,改 db.transaction('rw', userTasks, ...) 包起來。
 */

import { db } from '@/db';
import type { TaskTriggerEvent, UserTask, CultivationReason } from '@/types';
import { earnCultivation } from './cultivationService';
import { eventBus } from './eventBus';

/**
 * 收到 trigger event 時加進度。如果某 task 進度首次達標,
 * 設 completed=true 並 emit 'task:completed' 通知 UI(右上角提示卡)。
 */
export async function incrementTaskProgress(
  triggerEvent: TaskTriggerEvent,
  delta: number
): Promise<void> {
  if (delta <= 0) return;

  const tasks = await db.userTasks
    .filter((t) => t.triggerEvent === triggerEvent && !t.completed)
    .toArray();

  for (const task of tasks) {
    if (task.id === undefined) continue;
    const newProgress = Math.min(task.target, task.progress + delta);
    const completed = newProgress >= task.target;
    await db.userTasks.update(task.id, { progress: newProgress, completed });
    if (completed) {
      // emit 完整最新 task,UI 直接拿就能顯示「任務完成」提示
      eventBus.emit('task:completed', {
        task: { ...task, progress: newProgress, completed }
      });
    }
  }
}

export interface ClaimTaskResult {
  success: boolean;
  reason?: 'not_found' | 'not_completed' | 'already_claimed';
  reward?: number;
}

/** 玩家點任務卡的「領取」按鈕。發修為 + 標記 claimed=true 讓進度條變灰。 */
export async function claimTaskReward(taskId: number): Promise<ClaimTaskResult> {
  const task = await db.userTasks.get(taskId);
  if (!task) return { success: false, reason: 'not_found' };
  if (!task.completed) return { success: false, reason: 'not_completed' };
  if (task.claimed) return { success: false, reason: 'already_claimed' };

  const reason: CultivationReason = task.taskType === 'daily' ? 'daily_task' : 'weekly_task';
  await earnCultivation(task.reward, reason, `完成任務:${task.title}`, undefined);

  await db.userTasks.update(taskId, { claimed: true });
  return { success: true, reward: task.reward };
}

/** 任務 tab 用。daily / weekly 兩個 array,UI 各自分區渲染 */
export interface ActiveTasks {
  daily: UserTask[];
  weekly: UserTask[];
}

export async function getActiveTasks(): Promise<ActiveTasks> {
  const [daily, weekly] = await Promise.all([
    db.userTasks.where('taskType').equals('daily').toArray(),
    db.userTasks.where('taskType').equals('weekly').toArray()
  ]);
  return { daily, weekly };
}
