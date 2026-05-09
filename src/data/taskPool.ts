import type { TaskTriggerEvent } from '@/types';

/**
 * 任務池(階段 3.4 加 daily / 3.5 加 weekly)。
 *
 * 每天凌晨從 DAILY_TASK_POOL 隨機抽 3 個寫進 db.userTasks。
 * 每週日從 WEEKLY_TASK_POOL 隨機抽 4 個。
 *
 * taskKey 是識別字串,同 key 同一輪不會重抽(shuffle 抽樣自然不重)。
 */

export interface TaskTemplate {
  /** 任務識別 key,跨重啟保持穩定 */
  taskKey: string;
  /** 顯示名(任務 tab 顯示) */
  title: string;
  /** 玩家看的說明文 */
  description: string;
  /** 目標數量 */
  target: number;
  /** 修為獎勵 */
  reward: number;
  /** 哪個 event 觸發進度更新(階段 3.7 才埋 emit 點) */
  triggerEvent: TaskTriggerEvent;
}

/** 每日任務池(階段 3.4)— 每天凌晨抽 3 個 */
export const DAILY_TASK_POOL: TaskTemplate[] = [
  {
    taskKey: 'daily_buy_new',
    title: '召喚新神獸',
    description: '今日召喚 1 隻新神獸',
    target: 1,
    reward: 20,
    triggerEvent: 'pet_buy_new'
  },
  {
    taskKey: 'daily_feed',
    title: '加碼修煉',
    description: '加碼任意神獸 1 次',
    target: 1,
    reward: 20,
    triggerEvent: 'pet_feed'
  },
  {
    taskKey: 'daily_view_chart',
    title: '參悟天機',
    description: '查看大盤對比圖',
    target: 1,
    reward: 20,
    triggerEvent: 'view_chart'
  },
  {
    taskKey: 'daily_check_pet',
    title: '巡視道場',
    description: '查看任意神獸詳細頁 3 次',
    target: 3,
    reward: 20,
    triggerEvent: 'open_pet_info'
  },
  {
    taskKey: 'daily_level_up',
    title: '修為精進',
    description: '神獸累計升 5 級',
    target: 5,
    reward: 30,
    triggerEvent: 'pet_level_up'
  },
  {
    taskKey: 'daily_view_codex',
    title: '查閱圖鑑',
    description: '開啟圖鑑頁面',
    target: 1,
    reward: 20,
    triggerEvent: 'view_codex'
  },
  {
    taskKey: 'daily_view_records',
    title: '回顧歷程',
    description: '查看交易紀錄',
    target: 1,
    reward: 20,
    triggerEvent: 'view_records'
  },
  {
    taskKey: 'daily_total_invest',
    title: '投資修煉',
    description: '今日累計買入 NT$ 5,000',
    target: 5000,
    reward: 30,
    triggerEvent: 'pet_buy_amount'
  }
];

/** 週任務池(階段 3.5)— 每週日 0:00 重置抽 4 個 */
export const WEEKLY_TASK_POOL: TaskTemplate[] = [
  {
    taskKey: 'weekly_streak',
    title: '七日不輟',
    description: '連續登入 7 天',
    target: 7,
    reward: 100,
    triggerEvent: 'login'
  },
  {
    taskKey: 'weekly_invest_50k',
    title: '萬金散去',
    description: '本週累計買入 NT$ 50,000',
    target: 50000,
    reward: 100,
    triggerEvent: 'pet_buy_amount'
  },
  {
    taskKey: 'weekly_sell_profit',
    title: '修煉有成',
    description: '賣出獲利 1 次',
    target: 1,
    reward: 100,
    triggerEvent: 'pet_sell_profit'
  },
  {
    taskKey: 'weekly_realm_up',
    title: '境界突破',
    description: '神獸境界突破 1 次',
    target: 1,
    reward: 200,
    triggerEvent: 'realm_breakthrough'
  },
  {
    taskKey: 'weekly_summon',
    title: '萬獸來朝',
    description: '召喚 3 隻新神獸',
    target: 3,
    reward: 150,
    triggerEvent: 'pet_buy_new'
  },
  {
    taskKey: 'weekly_level_up',
    title: '飛躍千級',
    description: '本週神獸累計升 100 級',
    target: 100,
    reward: 150,
    triggerEvent: 'pet_level_up'
  },
  {
    taskKey: 'weekly_effect',
    title: '報酬之神',
    description: '任一神獸報酬率突破 +20%',
    target: 1,
    reward: 100,
    triggerEvent: 'effect_unlock'
  }
];
