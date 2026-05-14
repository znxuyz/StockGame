/**
 * 階段 2 批次 B — `loginStreakRepo`:Dexie `userLoginStreak` 表的 Repository 抽象。
 *
 * Singleton row(id='main'):currentStreak / longestStreak / lastLoginDate /
 * todayClaimed 等。`loginStreakService.checkAndUpdateStreak` 寫,App.tsx +
 * DailyCheckInModal 讀。
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import type { LoginStreak } from '@/types';

export interface LoginStreakRepository {
  get(): Promise<LoginStreak | undefined>;
  put(s: LoginStreak): Promise<void>;
  clear(): Promise<void>;
}

class DexieLoginStreakRepo implements LoginStreakRepository {
  get(): Promise<LoginStreak | undefined> {
    return db.userLoginStreak.get('main');
  }
  async put(s: LoginStreak): Promise<void> {
    await db.userLoginStreak.put(s);
  }
  async clear(): Promise<void> {
    await db.userLoginStreak.clear();
  }
}

export const loginStreakRepo: LoginStreakRepository = new DexieLoginStreakRepo();

export function useLoginStreak(): LoginStreak | undefined {
  return useLiveQuery(() => loginStreakRepo.get(), []);
}

export const dexieLoginStreakTable = db.userLoginStreak;
