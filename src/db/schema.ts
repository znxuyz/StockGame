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
  MarketIndexBar,
  UserCultivation,
  CultivationLog,
  LoginStreak,
  UserTask,
  MilestoneReward
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
  /** 玩家修為總額(階段 2.1,單一 row id='main') */
  userCultivation!: Table<UserCultivation, string>;
  /** 修為變動歷史(階段 2.1,append-only) */
  cultivationLog!: Table<CultivationLog, number>;
  /** 連登紀錄(階段 3.1,單一 row id='main') */
  userLoginStreak!: Table<LoginStreak, string>;
  /** 任務進度(階段 3.1) */
  userTasks!: Table<UserTask, number>;
  /** 連登里程碑領取紀錄(階段 3.1) */
  milestoneRewards!: Table<MilestoneReward, number>;

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

    /**
     * v4:整套 tier / 黑化 / 淨化 系統移除 — 第一步「資料 hygiene」。
     *  - 凶獸 tier (cursed1/2/3) 全改回 'normal',讓 v5 拔欄位前資料一致
     *  - tier 主鍵索引仍保留,等 v5 才一起拔
     *  - 順便刪除已棄用的 corruption 相關成就紀錄(用戶解過的也拿不到了)
     */
    this.version(4)
      .stores({})
      .upgrade(async (tx) => {
        await tx
          .table('pets')
          .toCollection()
          .modify((pet) => {
            const p = pet as Record<string, unknown>;
            if (p.tier === 'cursed1' || p.tier === 'cursed2' || p.tier === 'cursed3') {
              p.tier = 'normal';
            }
          });
        const removedAchievements = [
          'first-corruption',
          'cursed-3',
          'evo-spirit',
          'evo-demon',
          'evo-god',
          'evo-saint',
          'evo-celestial',
          'purify-1',
          'celestial-3'
        ];
        await tx.table('achievements').bulkDelete(removedAchievements);
      });

    /**
     * v5:Pet 拔掉 tier / maxNormalTier / evolutionCount / firstCorruptedAt /
     *     purificationCount 五個欄位,並從 stores 主鍵索引拔掉 tier。
     *  - 新版 Pet 只有 id / code / speciesId / level / bornAt / retiredAt
     *  - 用戶現有 pet 的所有非廢欄位資料(level / bornAt / retiredAt / speciesId)完全保留
     */
    this.version(5)
      .stores({
        pets: 'id, code, retiredAt' // 拔掉 tier index
      })
      .upgrade(async (tx) => {
        await tx
          .table('pets')
          .toCollection()
          .modify((pet) => {
            const p = pet as Record<string, unknown>;
            delete p.tier;
            delete p.maxNormalTier;
            delete p.evolutionCount;
            delete p.firstCorruptedAt;
            delete p.purificationCount;
          });
      });

    /**
     * v6:三維度養成系統(階段 1.1)準備 — Pet 加 customName / lastRealmCheck 兩個 optional 欄位。
     *  - 兩欄位都 optional,沒值 = undefined,IndexedDB document store 不需要 schema 改動
     *  - 純粹 bump version 把「我們開始用這兩欄位」這事釘死
     *  - 既有 pet 不需要 backfill — 兩欄位首次寫入時會自然出現
     *  - 不加 stores indexes(這兩個都不需要被 query)
     */
    this.version(6).stores({});

    /**
     * v7:修為點數系統(階段 2.1)— 加 2 張表:
     *   userCultivation(id 'main' 單一 row)— 玩家修為總額
     *   cultivationLog(++id auto-increment)— 修為變動歷史
     *
     * cultivationLog 索引:
     *   - createdAt:orderBy 拉時間軸快(紀錄 tab 用)
     *   - reason:filter「只看升級」這類 view
     *   - relatedPetId:filter「跟某神獸有關的紀錄」(點 pet 跳到歷史)
     */
    this.version(7).stores({
      userCultivation: 'id',
      cultivationLog: '++id, createdAt, reason, relatedPetId'
    });

    /**
     * v8:Pet 加 lastEffectCheck optional 欄位(階段 2.3)。
     *  - 對 effect_unlock 修為獎勵做去抖
     *  - 跟 v6 加 lastRealmCheck 一樣,IndexedDB document store 不需 schema 改
     *  - 純粹 bump version 釘死「我們開始用這欄位」
     */
    this.version(8).stores({});

    /**
     * v9:每日簽到 + 任務系統(階段 3.1)— 加 3 張表:
     *   userLoginStreak  — 連登紀錄,id='main' 單例
     *   userTasks        — 任務進度,++id auto + indexed by taskKey/taskType/completed/claimed
     *   milestoneRewards — 連登里程碑領取紀錄,milestoneDay 唯一索引(&)防重領
     */
    this.version(9).stores({
      userLoginStreak: 'id',
      userTasks: '++id, taskKey, taskType, completed, claimed',
      milestoneRewards: '++id, &milestoneDay'
    });
  }
}

/** 全域單例（任何模組透過這個 import） */
export const db = new StockGameDB();
