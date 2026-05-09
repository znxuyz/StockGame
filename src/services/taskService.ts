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
import { DAILY_TASK_POOL, type TaskTemplate } from '@/data/taskPool';

/** 每日抽幾個任務 */
const DAILY_PICK_COUNT = 3;

/** Fisher-Yates shuffle,純函式 */
function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 今日凌晨 0:00:00 unix millis */
function getTodayStart(now: Date = new Date()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 明日凌晨 0:00:00 unix millis(daily 任務 resetAt) */
function getNextMidnight(now: Date = new Date()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

/**
 * 從 template 建一筆 UserTask(progress 0,not completed/claimed)。
 */
function buildTaskFromTemplate(
  t: TaskTemplate,
  taskType: 'daily' | 'weekly',
  generatedAt: number,
  resetAt: number
): Omit<UserTask, 'id'> {
  return {
    taskKey: t.taskKey,
    taskType,
    title: t.title,
    description: t.description,
    target: t.target,
    progress: 0,
    reward: t.reward,
    completed: false,
    claimed: false,
    triggerEvent: t.triggerEvent,
    generatedAt,
    resetAt
  };
}

/**
 * 確保今日有 daily 任務:
 *   - 若任一 daily task generatedAt >= 今日凌晨 → 已生成,no-op
 *   - 否則:清掉所有 daily(過期),從 pool shuffle 抽 DAILY_PICK_COUNT 個寫進
 *
 * App.tsx 啟動時呼叫一次。同一天重開不重抽(已生成過)。
 */
export async function checkAndGenerateDailyTasks(now: Date = new Date()): Promise<void> {
  const todayStart = getTodayStart(now);
  const existing = await db.userTasks.where('taskType').equals('daily').toArray();
  const hasToday = existing.some((t) => t.generatedAt >= todayStart);
  if (hasToday) return;

  // 清舊 daily(包含未領完的,過期就放棄,玩家錯過自負)
  await db.userTasks.where('taskType').equals('daily').delete();

  const picked = shuffle(DAILY_TASK_POOL).slice(0, DAILY_PICK_COUNT);
  const generatedAt = now.getTime();
  const resetAt = getNextMidnight(now);

  for (const t of picked) {
    await db.userTasks.add(buildTaskFromTemplate(t, 'daily', generatedAt, resetAt));
  }
}

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
