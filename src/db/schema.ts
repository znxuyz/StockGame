import Dexie, { type Table } from 'dexie';
import type {
  Stock,
  StockPrice,
  Holding,
  Pet,
  Transaction,
  AchievementProgress,
  DailySnapshot,
  Settings,
  MarketIndexBar
} from '@/types';

/**
 * 神獸股市 IndexedDB schema
 *
 * 設計考量：
 *  - 表的劃分對應 src/types 一一對映，型別不會在 DB 層改寫
 *  - 索引以「之後最常需要 query 的欄位」為主：交易紀錄會依時間倒序、按代號分群
 *  - Holding 主鍵 = stock code（同代號同時間只會有一筆 active holding）
 *  - Pet 主鍵 = UUID；用 code 索引以便 holding 反查
 *  - 任何 schema 升級都要在這個檔案集中宣告 version().upgrade()，避免使用者資料遺失
 *  - marketIndices(v2 加):大盤指數歷史,主鍵 [symbol+date] 複合鍵
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
  /** 大盤指數歷史(只 TAIEX,日 K 收盤 + 盤中最新) */
  marketIndices!: Table<MarketIndexBar, [string, string]>;

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

    // v2:加 marketIndices 表,主鍵複合 [symbol+date],date 二級索引方便排序
    this.version(2).stores({
      marketIndices: '[symbol+date], symbol, date'
    });

    /**
     * v3:Pet 拿掉廢棄的 position / territory 欄位。
     *  - 改用 Phaser tween-based 漫遊後,寵物座標完全在 game scene 內管理,
     *    DB 不再儲存(每次 spawn 在 grid cell 隨機派位)
     *  - 用 upgrade callback 走訪每筆 pet,delete 兩欄位後寫回
     *  - 寵物 / 持倉 / 交易 / 成就 等其他資料完全保留
     */
    this.version(3)
      .stores({})
      .upgrade(async (tx) => {
        await tx
          .table('pets')
          .toCollection()
          .modify((pet) => {
            const p = pet as Record<string, unknown>;
            delete p.position;
            delete p.territory;
          });
      });
  }
}

/** 全域單例（任何模組透過這個 import） */
export const db = new StockGameDB();
