/**
 * 寵物等級 + 階級計算(精簡版,2026-05 後改版)。
 *
 * 設計改變(原本有進化/黑化/淨化機制全部刪除):
 *  - **沒有進化事件**:寵物階級單純隨等級升降,沒有「促進化」、「黑化」、
 *    「淨化」這類戲劇性轉變,UI 也不彈這類 toast。
 *  - **沒有黑化路線**:寵物永遠走正向(凡獸 → 仙獸),不論報酬率多差也不會
 *    變成凶獸。對應的 cursedX 三階仍保留在型別定義中(legacy 資料相容),
 *    但業務邏輯不會再寫進去。
 *  - **階級只看等級**:tier = tierFromLevel(level)。等級 1-19 是凡獸境、
 *    20-39 靈獸、40-59 妖獸、60-79 神獸、80-94 聖獸、95-99 仙獸。
 *  - **等級** 仍依 totalCost(累積投入)計算:每 1000 NT$ 一級,上限 99。
 *
 * 觸發點:每次價格更新 + 每次買入/加碼/賣出後,結果通通是「靜默更新」,
 * 沒有事件 toast。
 */

import type { Pet, NormalTier, Tier } from '@/types';

export interface EvolutionInput {
  /** 累積報酬率(舊欄位,目前不影響階級判斷,保留 API 相容) */
  returnRate: number;
  /** 從首次購入到現在持有的天數(同上,保留相容) */
  daysHeld: number;
}

/** 計算等級:每 1,000 NT$ 投入 = 1 級,最低 1,最高 99 */
export function calculateLevel(totalCost: number): number {
  return Math.max(1, Math.min(99, Math.floor(totalCost / 1000) + 1));
}

/** 等級 → 階級的對應(純顯示用) */
export function tierFromLevel(level: number): NormalTier {
  if (level >= 95) return 'celestial';
  if (level >= 80) return 'saint';
  if (level >= 60) return 'god';
  if (level >= 40) return 'demon';
  if (level >= 20) return 'spirit';
  return 'normal';
}

export interface EvolutionResult {
  /** 新的 tier(顯示用) */
  tier: Tier;
  /** 新的 maxNormalTier — 跟 tier 等值(不再有黑化覆蓋) */
  maxNormalTier: NormalTier;
  /** 是否本次發生了正向晉升 — 永遠 false(無事件) */
  promoted: false;
  /** 是否本次發生了黑化 — 永遠 false(已取消) */
  corrupted: false;
  /** 是否本次發生了淨化 — 永遠 false(已取消) */
  purified: false;
}

/**
 * 計算寵物應該處於的新狀態。
 * 純函式,不修改 pet。
 *
 * 取消進化/黑化邏輯後,這函式只做「依當前等級回傳階級」。
 * 等級本身在外面用 calculateLevel(totalCost) 算好,這裡只看 pet.level。
 */
export function evolvePet(pet: Pet, _input: EvolutionInput): EvolutionResult {
  const tier = tierFromLevel(pet.level);
  return {
    tier,
    maxNormalTier: tier,
    promoted: false,
    corrupted: false,
    purified: false
  };
}
