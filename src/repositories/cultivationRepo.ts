/**
 * 階段 2 批次 B — `cultivationRepo`:同時包 `userCultivation`(singleton 餘額)
 * 跟 `cultivationLog`(append-only 變動歷史)兩張表。
 *
 * 兩表是同一個「修為點數」概念的存量 + 流量,合在一個 Repository 比較合 caller
 * 的心智模型(`cultivationService.earnCultivation` 寫兩邊)。
 *
 * 命名前綴:
 *  - `getBalance / putBalance / clearBalance` — 對應 userCultivation singleton
 *  - `addLog / listLogs / ...` — 對應 cultivationLog append-only
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import type { UserCultivation, CultivationLog } from '@/types';

export interface CultivationRepository {
  // userCultivation(singleton 'main')
  getBalance(): Promise<UserCultivation | undefined>;
  putBalance(u: UserCultivation): Promise<void>;
  clearBalance(): Promise<void>;

  // cultivationLog(append-only)
  addLog(entry: Omit<CultivationLog, 'id'>): Promise<number>;
  bulkPutLogs(entries: CultivationLog[]): Promise<void>;
  /** orderBy createdAt asc — 全部(算累計用) */
  listLogs(): Promise<CultivationLog[]>;
  /** orderBy createdAt desc + limit — UI 顯示最近 N 筆 */
  listRecentLogs(limit: number): Promise<CultivationLog[]>;
  countLogs(): Promise<number>;
  clearLogs(): Promise<void>;
}

class DexieCultivationRepo implements CultivationRepository {
  getBalance(): Promise<UserCultivation | undefined> {
    return db.userCultivation.get('main');
  }
  async putBalance(u: UserCultivation): Promise<void> {
    await db.userCultivation.put(u);
  }
  async clearBalance(): Promise<void> {
    await db.userCultivation.clear();
  }

  async addLog(entry: Omit<CultivationLog, 'id'>): Promise<number> {
    return db.cultivationLog.add(entry as CultivationLog);
  }
  async bulkPutLogs(entries: CultivationLog[]): Promise<void> {
    await db.cultivationLog.bulkPut(entries);
  }
  listLogs(): Promise<CultivationLog[]> {
    return db.cultivationLog.orderBy('createdAt').toArray();
  }
  listRecentLogs(limit: number): Promise<CultivationLog[]> {
    return db.cultivationLog.orderBy('createdAt').reverse().limit(limit).toArray();
  }
  countLogs(): Promise<number> {
    return db.cultivationLog.count();
  }
  async clearLogs(): Promise<void> {
    await db.cultivationLog.clear();
  }
}

export const cultivationRepo: CultivationRepository = new DexieCultivationRepo();

/** 修為餘額(`useCultivation` hook 在 `src/hooks/useCultivation` 已有更複雜邏輯,這個只給簡單場景) */
export function useCultivationBalance(): UserCultivation | undefined {
  return useLiveQuery(() => cultivationRepo.getBalance(), []);
}

/** 最近 N 筆 cultivationLog — CultivationTab 用 */
export function useRecentCultivationLogs(limit: number): CultivationLog[] | undefined {
  return useLiveQuery(() => cultivationRepo.listRecentLogs(limit), [limit]);
}

export const dexieUserCultivationTable = db.userCultivation;
export const dexieCultivationLogTable = db.cultivationLog;
