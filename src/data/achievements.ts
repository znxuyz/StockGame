import type { AchievementDef } from '@/types';

/**
 * 成就清單。
 * 每個成就的 id 不可變動（已解鎖紀錄存於 DB 用 id 對應）。
 */
export const ACHIEVEMENTS: AchievementDef[] = [
  // 收集類
  { id: 'first-buy', category: 'collection', name: '初次相遇', description: '購入第一檔股票，召喚出第一隻神獸。', target: 1 },
  { id: 'collect-25', category: 'collection', name: '初窺天機', description: '圖鑑收集達 25%。', target: 1 },
  { id: 'collect-50', category: 'collection', name: '半冊神祇', description: '圖鑑收集達 50%。', target: 1 },
  { id: 'collect-75', category: 'collection', name: '博覽眾神', description: '圖鑑收集達 75%。', target: 1 },
  { id: 'collect-100', category: 'collection', name: '萬神大全', description: '圖鑑收集 100%。', target: 1 },
  { id: 'four-symbols', category: 'collection', name: '天罡四極', description: '同時擁有 鴻鈞道祖、玄黃地母、滄溟海尊、紫微天樞 — 天地水星四極。', target: 4 },
  { id: 'pets-10', category: 'collection', name: '初具規模', description: '同時飼養 10 隻寵物。', target: 10 },
  { id: 'pets-20', category: 'collection', name: '萬獸朝堂', description: '同時飼養 20 隻寵物。', target: 20 },
  { id: 'pets-50', category: 'collection', name: '神獸動物園', description: '同時飼養 50 隻寵物。', target: 50 },

  // 獲利類
  { id: 'first-profit', category: 'profit', name: '首戰告捷', description: '首次達成總報酬率為正。', target: 1 },
  { id: 'profit-10', category: 'profit', name: '報酬 10%', description: '累積總報酬率達 +10%。', target: 1 },
  { id: 'profit-30', category: 'profit', name: '報酬 30%', description: '累積總報酬率達 +30%。', target: 1 },
  { id: 'profit-50', category: 'profit', name: '報酬 50%', description: '累積總報酬率達 +50%。', target: 1 },
  { id: 'profit-100', category: 'profit', name: '翻倍人生', description: '累積總報酬率達 +100%。', target: 1 },
  { id: 'profit-200', category: 'profit', name: '股神附身', description: '累積總報酬率達 +200%。', target: 1 },
  { id: 'single-10k', category: 'profit', name: '小有斬獲', description: '單檔股票賺超過 NT$10,000。', target: 10000 },
  { id: 'single-100k', category: 'profit', name: '十萬賺手', description: '單檔股票賺超過 NT$100,000。', target: 100000 },
  { id: 'single-1m', category: 'profit', name: '百萬大戶', description: '單檔股票賺超過 NT$1,000,000。', target: 1000000 },
  { id: 'monthly-3', category: 'profit', name: '連勝三月', description: '連續 3 個月每月帳上正報酬。', target: 3 },
  { id: 'monthly-6', category: 'profit', name: '半年常勝', description: '連續 6 個月每月帳上正報酬。', target: 6 },
  { id: 'monthly-12', category: 'profit', name: '年度長紅', description: '連續 12 個月每月帳上正報酬。', target: 12 },

  // 虧損類（黑色幽默）
  { id: 'first-corruption', category: 'loss', name: '首次黑化', description: '第一隻寵物落入凶獸境。', target: 1 },
  { id: 'single-down-50', category: 'loss', name: '腰斬達人', description: '單檔股票虧損達 -50%。', target: 1 },
  { id: 'cursed-3', category: 'loss', name: '凶獸動物園', description: '同時擁有 3 隻凶獸。', target: 3 },
  { id: 'feed-down-5', category: 'loss', name: '越跌越買', description: '同檔加碼 5 次後仍處於虧損狀態。', target: 5 },
  { id: 'realize-loss-10', category: 'loss', name: '割肉藝術家', description: '已實現虧損交易達 10 次。', target: 10 },

  // 進化類
  { id: 'evo-spirit', category: 'evolution', name: '初登靈獸', description: '首次有寵物突破到靈獸境。', target: 1 },
  { id: 'evo-demon', category: 'evolution', name: '入妖獸境', description: '首次有寵物突破到妖獸境。', target: 1 },
  { id: 'evo-god', category: 'evolution', name: '神獸誕生', description: '首次有寵物突破到神獸境。', target: 1 },
  { id: 'evo-saint', category: 'evolution', name: '聖獸出世', description: '首次有寵物突破到聖獸境。', target: 1 },
  { id: 'evo-celestial', category: 'evolution', name: '飛升仙獸', description: '首次有寵物突破到仙獸境。', target: 1 },
  { id: 'level-99', category: 'evolution', name: '修為大成', description: '寵物修為達 Lv.99。', target: 99 },
  { id: 'purify-1', category: 'evolution', name: '回頭是岸', description: '首次淨化凶獸回到正向境界。', target: 1 },
  { id: 'celestial-3', category: 'evolution', name: '三仙同朝', description: '同時擁有 3 隻仙獸。', target: 3 },

  // 長期類
  { id: 'login-7', category: 'long-term', name: '一週簽到', description: '連續登入 7 天。', target: 7 },
  { id: 'login-30', category: 'long-term', name: '滿月達成', description: '連續登入 30 天。', target: 30 },
  { id: 'login-100', category: 'long-term', name: '百日修煉', description: '連續登入 100 天。', target: 100 },
  { id: 'login-365', category: 'long-term', name: '一年如一日', description: '連續登入 365 天。', target: 365 },
  { id: 'hold-1y', category: 'long-term', name: '長期持有', description: '同檔股票持有超過 1 年。', target: 365 },
  { id: 'hold-3y', category: 'long-term', name: '價值投資人', description: '同檔股票持有超過 3 年。', target: 1095 },
  { id: 'diamond-hand', category: 'long-term', name: '鑽石手', description: '同檔股票持有超過 5 年從未賣出。', target: 1825 },
  { id: 'anniv-1y', category: 'long-term', name: '帳戶週年', description: '帳戶建立滿 1 年。', target: 365 },
  { id: 'anniv-3y', category: 'long-term', name: '老玩家', description: '帳戶建立滿 3 年。', target: 1095 },

  // 操作類
  { id: 'first-sell', category: 'operation', name: '首次賣出', description: '完成第一筆賣出交易。', target: 1 },
  { id: 'first-feed', category: 'operation', name: '初次加碼', description: '對同一檔股票進行首次加碼。', target: 1 },
  { id: 'feed-10', category: 'operation', name: '勤奮餵食', description: '累積加碼次數達 10 次。', target: 10 },
  { id: 'feed-50', category: 'operation', name: '加碼大師', description: '累積加碼次數達 50 次。', target: 50 },
  { id: 'feed-100', category: 'operation', name: '加碼狂魔', description: '累積加碼次數達 100 次。', target: 100 },
  { id: 'day-trader', category: 'operation', name: '短線達人', description: '單日完成 10 次交易。', target: 10 },
  { id: 'zen-investor', category: 'operation', name: '佛系投資人', description: '一週內無任何交易。', target: 7 }
];

/** id 對應 def 的查詢索引 */
const ACHIEVEMENT_MAP = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export function getAchievementDef(id: string): AchievementDef | undefined {
  return ACHIEVEMENT_MAP.get(id);
}
