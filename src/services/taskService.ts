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

import { taskRepo } from '@/repositories/taskRepo';
import type { TaskTriggerEvent, UserTask, CultivationReason } from '@/types';
import { earnCultivation } from './cultivationService';
import { eventBus } from './eventBus';
import { DAILY_TASK_POOL, WEEKLY_TASK_POOL, type TaskTemplate } from '@/data/taskPool';

/** 每日抽幾個 / 每週抽幾個 */
const DAILY_PICK_COUNT = 3;
const WEEKLY_PICK_COUNT = 4;

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
 * 本週開始 = 上一個週日凌晨 0:00。Date.getDay() 0=Sun, 1=Mon, ..., 6=Sat
 * 例:今天週三 → 退 3 天到週日;今天週日 → 不退,本週開始就是今天 0:00
 */
function getThisWeekStart(now: Date = new Date()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

/** 下週日凌晨 0:00(本週 resetAt) */
function getNextWeekStart(now: Date = new Date()): number {
  return getThisWeekStart(now) + 7 * 24 * 60 * 60 * 1000;
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

interface GenerateOpts {
  taskType: 'daily' | 'weekly';
  pool: readonly TaskTemplate[];
  pickCount: number;
  /** 本期開始的 unix millis(daily=今日 0:00,weekly=上週日 0:00) */
  periodStart: number;
  /** 本期結束(下期開始)的 unix millis,寫進 task.resetAt 給 UI 倒數計時 */
  periodResetAt: number;
}

/**
 * Daily / Weekly 共用的「過期才重生」邏輯:
 *   - 拉現有同 type task,看有沒有 generatedAt >= periodStart
 *   - 有 → 同期內不重抽(no-op)
 *   - 沒有 → 清舊(過期未領的也放棄,玩家錯過自負)+ shuffle 抽 pickCount 個寫進
 */
async function checkAndGenerateTasks(opts: GenerateOpts): Promise<void> {
  const existing = await taskRepo.listTasksByType(opts.taskType);
  const hasCurrentPeriod = existing.some((t) => t.generatedAt >= opts.periodStart);
  if (hasCurrentPeriod) return;

  await taskRepo.deleteTasksByType(opts.taskType);

  const picked = shuffle(opts.pool).slice(0, opts.pickCount);
  const generatedAt = Date.now();
  let added = 0;
  for (const t of picked) {
    try {
      await taskRepo.addTask(
        buildTaskFromTemplate(t, opts.taskType, generatedAt, opts.periodResetAt)
      );
      added++;
    } catch (e) {
      // 不靜默吞:Dexie 出錯時 log 給 dev console 看
      console.error(`[taskService] add ${opts.taskType} task ${t.taskKey} failed:`, e);
    }
  }
  if (added !== opts.pickCount) {
    console.warn(
      `[taskService] expected ${opts.pickCount} ${opts.taskType} tasks, only added ${added}`
    );
  }
}

/** App.tsx 啟動呼叫:確保今日有 daily 任務(同一天重開不重抽) */
export async function checkAndGenerateDailyTasks(now: Date = new Date()): Promise<void> {
  await checkAndGenerateTasks({
    taskType: 'daily',
    pool: DAILY_TASK_POOL,
    pickCount: DAILY_PICK_COUNT,
    periodStart: getTodayStart(now),
    periodResetAt: getNextMidnight(now)
  });
}

/** App.tsx 啟動呼叫:確保本週有 weekly 任務(週日 0:00 重置) */
export async function checkAndGenerateWeeklyTasks(now: Date = new Date()): Promise<void> {
  await checkAndGenerateTasks({
    taskType: 'weekly',
    pool: WEEKLY_TASK_POOL,
    pickCount: WEEKLY_PICK_COUNT,
    periodStart: getThisWeekStart(now),
    periodResetAt: getNextWeekStart(now)
  });
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

  // triggerEvent 不是 indexed field(boolean / non-key 規範限制),memory filter 即可
  const all = await taskRepo.listAllTasks();
  const tasks = all.filter((t) => t.triggerEvent === triggerEvent && !t.completed);

  for (const task of tasks) {
    if (task.id === undefined) continue;
    const newProgress = Math.min(task.target, task.progress + delta);
    const completed = newProgress >= task.target;
    await taskRepo.patchTask(task.id, { progress: newProgress, completed });
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
  const task = await taskRepo.getTask(taskId);
  if (!task) return { success: false, reason: 'not_found' };
  if (!task.completed) return { success: false, reason: 'not_completed' };
  if (task.claimed) return { success: false, reason: 'already_claimed' };

  const reason: CultivationReason = task.taskType === 'daily' ? 'daily_task' : 'weekly_task';
  await earnCultivation(task.reward, reason, `完成任務:${task.title}`, undefined);

  await taskRepo.patchTask(taskId, { claimed: true });
  return { success: true, reward: task.reward };
}

/** 任務 tab 用。daily / weekly 兩個 array,UI 各自分區渲染 */
export interface ActiveTasks {
  daily: UserTask[];
  weekly: UserTask[];
}

export async function getActiveTasks(): Promise<ActiveTasks> {
  const [daily, weekly] = await Promise.all([
    taskRepo.listTasksByType('daily'),
    taskRepo.listTasksByType('weekly')
  ]);
  return { daily, weekly };
}

/**
 * 業務模組 emit 任務 trigger 的 sugar(階段 3.7)。
 * 統一從這個出口呼叫 eventBus,future 改機制只動這裡。
 */
export function emitTaskTrigger(triggerEvent: TaskTriggerEvent, delta: number = 1): void {
  if (delta <= 0) return;
  eventBus.emit('task:trigger', { triggerEvent, delta });
}

/**
 * App.tsx 啟動時呼叫一次,attach 'task:trigger' listener → incrementTaskProgress。
 * 回傳 detach fn 給 cleanup;重複 attach 會被 attached flag 擋掉。
 */
let attached = false;
export function attachTaskListeners(): () => void {
  if (attached) return () => undefined;
  attached = true;
  const off = eventBus.on('task:trigger', ({ triggerEvent, delta }) => {
    incrementTaskProgress(triggerEvent, delta).catch((e) => {
      console.warn('[taskService] progress update failed:', e);
    });
  });
  return () => {
    attached = false;
    off();
  };
}
