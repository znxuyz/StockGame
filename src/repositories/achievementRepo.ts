/**
 * 階段 2 批次 B — `achievementRepo`:Dexie `achievements` 表的 Repository 抽象。
 *
 * 表 schema:主鍵 = id(成就 id),欄位含 `progress`、`unlockedAt` 等。
 * 主要 caller 是 `services/achievements.ts` 的 `runAchievementChecks`,做大量
 * read-modify-write,故只暴露 `list / put / bulkPut / clear`。沒看到 caller
 * 用 `get(id)` 單筆讀,先不暴露(YAGNI),日後需要再加。
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import type { AchievementProgress } from '@/types';

export interface AchievementRepository {
  list(): Promise<AchievementProgress[]>;
  put(a: AchievementProgress): Promise<void>;
  bulkPut(a: AchievementProgress[]): Promise<void>;
  clear(): Promise<void>;
}

class DexieAchievementRepo implements AchievementRepository {
  list(): Promise<AchievementProgress[]> {
    return db.achievements.toArray();
  }
  async put(a: AchievementProgress): Promise<void> {
    await db.achievements.put(a);
  }
  async bulkPut(a: AchievementProgress[]): Promise<void> {
    await db.achievements.bulkPut(a);
  }
  async clear(): Promise<void> {
    await db.achievements.clear();
  }
}

export const achievementRepo: AchievementRepository = new DexieAchievementRepo();

export function useAchievements(): AchievementProgress[] | undefined {
  return useLiveQuery(() => achievementRepo.list(), []);
}

export const dexieAchievementsTable = db.achievements;
