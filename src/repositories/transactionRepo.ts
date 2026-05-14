/**
 * 階段 2 批次 B — `transactionRepo`:Dexie `transactions` 表的 Repository 抽象。
 *
 * 沿用 `settingsRepo` 風格:
 *  - 簡單 wrapper,內部直接打 `db.transactions.xxx`,完全不接 Supabase
 *  - 命名統一(`list` / `get` / `count` / `put` / `bulkPut` / `clear`)
 *  - 提供 `useTransactions` hook 取代分散各處的 `useLiveQuery(() => db.transactions.orderBy(...), [])`
 *  - `dexieTransactionsTable` escape hatch:給 `portfolio.ts` / `cloudSync.ts` 的
 *    `db.transaction('rw', [...tables], ...)` 用,因為 Dexie transactional scope
 *    必須帶實體 Table reference
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import type { Transaction } from '@/types';

export interface TransactionRepository {
  /** orderBy timestamp asc(最早 → 最近)— 計算累計 / 重建快照都用這個方向 */
  list(): Promise<Transaction[]>;
  /** orderBy timestamp desc + limit — 紀錄彈窗顯示最近 N 筆用 */
  listRecent(limit: number): Promise<Transaction[]>;
  /** 按 `type` indexed query — summary.ts 算已實現損益用 */
  listByType(type: Transaction['type']): Promise<Transaction[]>;
  /** 第一筆(時間最早),null = 從沒交易過 */
  getEarliest(): Promise<Transaction | undefined>;
  count(): Promise<number>;
  put(tx: Transaction): Promise<void>;
  bulkPut(txs: Transaction[]): Promise<void>;
  clear(): Promise<void>;
}

class DexieTransactionRepo implements TransactionRepository {
  list(): Promise<Transaction[]> {
    return db.transactions.orderBy('timestamp').toArray();
  }
  listRecent(limit: number): Promise<Transaction[]> {
    return db.transactions.orderBy('timestamp').reverse().limit(limit).toArray();
  }
  listByType(type: Transaction['type']): Promise<Transaction[]> {
    return db.transactions.where('type').equals(type).toArray();
  }
  getEarliest(): Promise<Transaction | undefined> {
    return db.transactions.orderBy('timestamp').first();
  }
  count(): Promise<number> {
    return db.transactions.count();
  }
  async put(tx: Transaction): Promise<void> {
    await db.transactions.put(tx);
  }
  async bulkPut(txs: Transaction[]): Promise<void> {
    await db.transactions.bulkPut(txs);
  }
  async clear(): Promise<void> {
    await db.transactions.clear();
  }
}

export const transactionRepo: TransactionRepository = new DexieTransactionRepo();

/** useLiveQuery(() => repo.list(), []) — orderBy timestamp asc */
export function useTransactions(): Transaction[] | undefined {
  return useLiveQuery(() => transactionRepo.list(), []);
}

/** Dexie 交易範圍 escape hatch — portfolio.ts / cloudSync.ts 用,日後 Supabase 切換消失 */
export const dexieTransactionsTable = db.transactions;
