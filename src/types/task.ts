/**
 * 簽到 + 任務系統 types(階段 3.1)。
 *
 * 三張 IndexedDB table:
 *   userLoginStreak  — 連登紀錄,單一 row id='main'
 *   userTasks        — 任務進度,append + update
 *   milestoneRewards — 連登里程碑領取紀錄,milestoneDay 唯一索引防重領
 */

/** 連登紀錄(singleton) */
export interface LoginStreak {
  id: 'main';
  /** 當前連續登入天數(斷簽會重設為 1) */
  currentStreak: number;
  /** 歷史最長連登(只增不減,激勵用) */
  longestStreak: number;
  /** 最後一次有效登入日,用台灣時區 'YYYY-MM-DD' */
  lastLoginDate: string;
  /** 今日是否已點過「領取簽到」 */
  todayClaimed: boolean;
  /** 累計登入過幾天(unique day) */
  lifetimeLogins: number;
}

/**
 * 任務 trigger event 名稱集中定義,task pool / eventBus / 進度更新都引用。
 * 這些 event 的實際 emit 點 留階段 3.7 埋。
 */
export type TaskTriggerEvent =
  | 'pet_buy_new'         // 召喚新檔(舊 species 也算)
  | 'pet_feed'            // 加碼
  | 'pet_buy_amount'      // 累計買入金額(payload 用 amount NT$)
  | 'pet_level_up'        // 神獸升級(payload 用 levelsGained)
  | 'pet_sell_profit'     // 賣出有獲利(realizedPnL > 0)
  | 'realm_breakthrough'  // 升境
  | 'effect_unlock'       // 報酬率特效升級
  | 'view_chart'          // 開圖表 tab
  | 'view_codex'          // 開圖鑑 tab
  | 'view_records'        // 開交易 tab
  | 'open_pet_info'       // 點神獸開詳細頁
  | 'login';              // 新一天登入

/** 任務實例(每筆 daily/weekly 都有自己的 row) */
export interface UserTask {
  /** Dexie auto-increment */
  id?: number;
  /** 對應 task pool 的識別 key,同 key 同一輪不重抽 */
  taskKey: string;
  taskType: 'daily' | 'weekly';
  title: string;
  description: string;
  /** 目標數量(例如「加碼 1 次」target=1,「累積投入 NT$5,000」target=5000) */
  target: number;
  /** 當前進度,從 0 累積到 target */
  progress: number;
  /** 完成時可領的修為 */
  reward: number;
  /** 進度 >= target 後翻 true */
  completed: boolean;
  /** 玩家點過「領取」翻 true,進度條變灰 */
  claimed: boolean;
  /** 觸發進度增加的 event 名 */
  triggerEvent: TaskTriggerEvent;
  /** 任務生成時間 unix millis */
  generatedAt: number;
  /** 重置時間 unix millis(每日 = 隔日凌晨 / 週 = 下週日) */
  resetAt: number;
}

/** 連登里程碑領取紀錄(milestoneDay 唯一索引防重領) */
export interface MilestoneReward {
  id?: number;
  /** 7 / 14 / 30 / 60 / 100 */
  milestoneDay: number;
  /** unix millis */
  claimedAt: number;
}
