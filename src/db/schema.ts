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
  MilestoneReward,
  CreatureUnlock
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
  /** 圖鑑故事解鎖紀錄(階段 4C.3,creatureId 唯一索引防重複解鎖) */
  creatureUnlocks!: Table<CreatureUnlock, number>;

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

    /**
     * v10:**重大修正** — userTasks 拿掉 `completed` / `claimed` 這兩個 boolean index。
     *
     * Root cause:IndexedDB 規範**不接受 boolean 作為 valid key**(只接受
     * string / number / Date / Array)。Dexie schema declare boolean index 時,
     * 任何 `db.userTasks.add({...completed: false, claimed: false...})` 會在
     * IndexedDB 層級 throw DataError → task 完全寫不進去 → 任務 tab 永遠空。
     *
     * 修法:stores 改成 `'++id, taskKey, taskType'`,拿掉兩個 boolean index。
     * UI 端早就用 `.toArray() + memory filter` 不靠這 index(BottomBar / TasksTab),
     * 拿掉不影響功能。
     *
     * 不需要 upgrade callback:只改 schema declaration,Dexie 自動 modify
     * IndexedDB store schema(IndexedDB 不會丟資料,只更新 indexes)。
     */
    this.version(10).stores({
      userTasks: '++id, taskKey, taskType'
    });

    /**
     * v11:Pet 加 `boostedDays?` / `effectBoostUntil?` 兩個 optional 欄位
     * (階段 4A.3 境界催熟 + 4A.4 魂環淬煉,修為消耗管道)。
     *
     *  - boostedDays:累積催熟天數,monthsHeld 計算時加上去。
     *    既有 pet 不需 backfill — undefined 在 petTier 層當 0 處理 — 但
     *    為了符合「migration 把舊資料設為 0」的設計慣例,這裡顯式 backfill。
     *  - effectBoostUntil:淬煉到期 unix ms。undefined / <= now = 沒 boost。
     *    既有 pet 一律沒 boost,不 backfill。
     *
     * IndexedDB document store 對新增 optional 欄位本來就不需要 schema 改,
     * 純粹 bump version 釘死「我們開始用這兩個欄位」。stores 不變。
     */
    this.version(11)
      .stores({})
      .upgrade(async (tx) => {
        await tx
          .table('pets')
          .toCollection()
          .modify((pet) => {
            const p = pet as Record<string, unknown>;
            if (p.boostedDays === undefined) p.boostedDays = 0;
            // effectBoostUntil 不 backfill,undefined = 沒 boost(預設值)
          });
      });

    /**
     * v12:進階消耗管道(階段 4B)資料層。
     *
     * pets 表加 `colorVariant?: PetColorVariant`(階段 4B.2 配色淬煉,
     *   tint 在 Phaser scene 套用)— 預設 'default' 不套 tint。
     *
     * settings 表加 4 個 optional 欄位:
     *   - unlockedBackgrounds: string[](階段 4B.4 家園背景解鎖清單)— 預設 ['default']
     *   - currentBackground: string(當前背景 id)— 預設 'default'
     *   - hudTheme: HudTheme(階段 4B.3 HUD 主題色)— 預設 'default'
     *   - unlockedHudThemes: HudTheme[](已解鎖的 HUD 主題清單)— 預設 ['default']
     *
     * stores 不變(IndexedDB document store 對新欄位不需 schema 改)。
     * upgrade 顯式 backfill 上面所有預設值,讓 DB 跟新邏輯一致,避免 caller
     * 每處 `?? 'default'` 防呆,集中在 migration 處理一次。
     */
    this.version(12)
      .stores({})
      .upgrade(async (tx) => {
        await tx
          .table('pets')
          .toCollection()
          .modify((pet) => {
            const p = pet as Record<string, unknown>;
            if (p.colorVariant === undefined) p.colorVariant = 'default';
          });
        await tx
          .table('settings')
          .toCollection()
          .modify((s) => {
            const r = s as Record<string, unknown>;
            if (r.unlockedBackgrounds === undefined) r.unlockedBackgrounds = ['default'];
            if (r.currentBackground === undefined) r.currentBackground = 'default';
            if (r.hudTheme === undefined) r.hudTheme = 'default';
            if (r.unlockedHudThemes === undefined) r.unlockedHudThemes = ['default'];
          });
      });

    /**
     * v13:深度消耗管道(階段 4C)資料層。
     *
     * pets 表加 3 個 optional 欄位(階段 4C.2 永恆紀念):
     *   - isEternal:boolean,2000 修為「永恆封印」後 true,圖鑑卡魂環變動態
     *   - eternalDate:unix ms,紀念日期(顯示「✨ 已紀念 · 2025/05/10」)
     *   - finalEffect:RingEffect,退役當下的特效快照,圖鑑卡用這個還原動態
     *
     * 新增 creatureUnlocks 表(階段 4C.3 圖鑑故事解鎖):
     *   - 主鍵 ++id auto-increment
     *   - &creatureId 唯一索引(防 race 重複解鎖)
     *   - unlockedAt unix ms
     *   - 解鎖一個 creatureId 永久解鎖(賣光重買仍解鎖狀態)
     *
     * pets backfill isEternal=false 給舊資料;eternalDate/finalEffect undefined。
     */
    this.version(13)
      .stores({
        creatureUnlocks: '++id, &creatureId'
      })
      .upgrade(async (tx) => {
        await tx
          .table('pets')
          .toCollection()
          .modify((pet) => {
            const p = pet as Record<string, unknown>;
            if (p.isEternal === undefined) p.isEternal = false;
            // eternalDate / finalEffect 不 backfill,undefined = 還沒紀念 / 還在世
          });
      });

    /**
     * v14:pets 加 `speciesId` 二級索引。
     *
     * Root cause:`portfolio.ts buyOrFeed` 走
     *   `db.pets.where('speciesId').equals(species.id).count()`
     * 判定「是否第一次召喚此物種」(發 +20 修為入圖鑑用)。但 v5 拔 tier 那次
     * 把 pets index 整串改成 `'id, code, retiredAt'`,**沒加 speciesId**,
     * 結果 Excel 匯入(走 buyOrFeed 第一筆新檔)整批 throw:
     *   「KeyPath speciesId on object store pets is not indexed」
     *
     * 修法:加 secondary index,**不動主鍵 / 不轉資料**。Dexie 會自動從現有
     * pets 重建 speciesId index,IndexedDB 索引修改不會丟資料 — 神獸 / 持倉 /
     * 修為點數全部保留(這是 IndexedDB 規範,不是 Dexie 額外保證)。
     *
     * (CLAUDE.md「已知雷」段早有此雷的規律記錄,這次踩到也是因為 speciesId
     *  用法是 v5 之後才從 portfolio.ts 加進來,當下沒一起補 index。)
     */
    this.version(14).stores({
      pets: 'id, code, retiredAt, speciesId'
    });
  }
}

/** 全域單例（任何模組透過這個 import） */
export const db = new StockGameDB();
