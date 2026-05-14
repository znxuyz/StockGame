/**
 * 階段 2 批次 B — `taskRepo`:同時包 `userTasks`(每日 / 每週任務進度)+
 * `milestoneRewards`(連登里程碑領取紀錄)。
 *
 * 兩表合在一個 Repository 是因為兩者一起組成「任務 / 簽到」這個 feature 的
 * 持久狀態,caller `taskService` / `loginStreakService` 也是混著用。
 *
 * 命名前綴:
 *  - `addTask` / `listAllTasks` / ... — 對應 userTasks
 *  - `addMilestone` / `countMilestones` / ... — 對應 milestoneRewards
 *
 * 注意:userTasks `taskType` 索引能 query 'daily' | 'weekly'。**`completed` /
 * `claimed` boolean 不是 index**(IndexedDB 規範不接受 boolean key,v10 拿掉,
 * 詳見 CLAUDE.md 已知雷段),所以這兩個 filter 一律 caller 自己 memory filter。
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import type { UserTask, MilestoneReward } from '@/types';

type TaskType = UserTask['taskType'];

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
  /** &milestoneDay 唯一索引 query — 防重領 race 用 */
  getMilestoneByDay(day: number): Promise<MilestoneReward | undefined>;
  addMilestone(m: Omit<MilestoneReward, 'id'>): Promise<number>;
}

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

export const taskRepo: TaskRepository = new DexieTaskRepo();

/** BottomBar 紅點 badge / 任務 tab 全部任務 — 用 toArray + memory filter 算「待領取」 */
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
