/**
 * 階段 2 批次 B — `holdingRepo`:Dexie `holdings` 表的 Repository 抽象。
 *
 * 主鍵 = stock code(同代號同時間只會有一筆 active holding)。
 * 持倉清單常用 `orderBy('lastTransactionAt').reverse()` 顯示「最近交易」排序。
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import type { Holding } from '@/types';

export interface HoldingRepository {
  count(): Promise<number>;
  get(code: string): Promise<Holding | undefined>;
  /** 無排序,給匯整 / 計算用 */
  list(): Promise<Holding[]>;
  /** orderBy lastTransactionAt desc — HoldingPicker 排序「最近交易」 */
  listRecent(): Promise<Holding[]>;
  put(holding: Holding): Promise<void>;
  bulkPut(holdings: Holding[]): Promise<void>;
  delete(code: string): Promise<void>;
  clear(): Promise<void>;
}

class DexieHoldingRepo implements HoldingRepository {
  count(): Promise<number> {
    return db.holdings.count();
  }
  get(code: string): Promise<Holding | undefined> {
    return db.holdings.get(code);
  }
  list(): Promise<Holding[]> {
    return db.holdings.toArray();
  }
  listRecent(): Promise<Holding[]> {
    return db.holdings.orderBy('lastTransactionAt').reverse().toArray();
  }
  async put(holding: Holding): Promise<void> {
    await db.holdings.put(holding);
  }
  async bulkPut(holdings: Holding[]): Promise<void> {
    await db.holdings.bulkPut(holdings);
  }
  async delete(code: string): Promise<void> {
    await db.holdings.delete(code);
  }
  async clear(): Promise<void> {
    await db.holdings.clear();
  }
}

export const holdingRepo: HoldingRepository = new DexieHoldingRepo();

export function useHoldings(): Holding[] | undefined {
  return useLiveQuery(() => holdingRepo.list(), []);
}

/** lastTransactionAt desc — HoldingPicker 用 */
export function useRecentHoldings(): Holding[] | undefined {
  return useLiveQuery(() => holdingRepo.listRecent(), []);
}

export const dexieHoldingsTable = db.holdings;
