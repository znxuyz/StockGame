import Dexie, { type Table } from 'dexie';
import type {
  Stock,
  StockPrice,
  Holding,
  Pet,
  Transaction,
  AchievementProgress,
  DailySnapshot,
  Settings
} from '@/types';

/**
 * 山海經股市 IndexedDB schema（v1）
 *
 * 設計考量：
 *  - 表的劃分對應 src/types 一一對映，型別不會在 DB 層改寫
 *  - 索引以「之後最常需要 query 的欄位」為主：交易紀錄會依時間倒序、按代號分群
 *  - Holding 主鍵 = stock code（同代號同時間只會有一筆 active holding）
 *  - Pet 主鍵 = UUID；用 code 索引以便 holding 反查
 *  - 任何 schema 升級都要在這個檔案集中宣告 version().upgrade()，避免使用者資料遺失
 */
export class StockGameDB extends Dexie {
  stocks!: Table<Stock, string>;
  prices!: Table<StockPrice, string>;
  holdings!: Table<Holding, string>;
  pets!: Table<Pet, string>;
  transactions!: Table<Transaction, string>;
  achievements!: Table<AchievementProgress, string>;
  snapshots!: Table<DailySnapshot, string>;
  settings!: Table<Settings, string>;

  constructor() {
    super('StockGameDB');

    this.version(1).stores({
      stocks: 'code, market, industry, isActive',
      prices: 'code, updatedAt',
      holdings: 'code, lastTransactionAt, firstPurchasedAt',
      pets: 'id, code, tier, retiredAt',
      transactions: 'id, code, type, timestamp',
      achievements: 'id, unlockedAt',
      snapshots: 'date',
      settings: 'id'
    });
  }
}

/** 全域單例（任何模組透過這個 import） */
export const db = new StockGameDB();
