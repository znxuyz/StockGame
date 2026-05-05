/**
 * 寵物境界進化 / 黑化 / 淨化 / 等級計算。
 *
 * 規則回顧（已與使用者確認）：
 *
 * 等級 (level)：
 *   - 與累積投入金額（holding.totalCost）成正比
 *   - 每 1,000 NT$ 升 1 級，最高 99 級
 *   - 等級獨立於境界，賣出/加碼不重置
 *
 * 正向境界（六階）：
 *   tier         | 累積報酬率 | 持有時間
 *   ─────────────┼──────────┼────────
 *   normal       | 起始       | -
 *   spirit       | +5%       | ≥ 30 天
 *   demon        | +15%      | ≥ 90 天
 *   god          | +30%      | ≥ 180 天
 *   saint        | +50%      | ≥ 365 天
 *   celestial    | +100%     | ≥ 730 天
 *
 *   一旦達成不會降回（maxNormalTier 記錄歷史最高）。
 *
 * 黑化（凶獸三階）：
 *   cursed1      | -10%      | ≥ 30 天
 *   cursed2      | -25%      | ≥ 90 天
 *   cursed3      | -50%      | ≥ 180 天
 *
 *   黑化是「狀態覆蓋」：tier 變成 cursedX，但 maxNormalTier 不動。
 *
 * 淨化：
 *   - 黑化狀態下累積報酬率 ≥ +5% → 立刻回到 maxNormalTier
 *   - 同時 purificationCount += 1
 *
 * 觸發點：每次價格更新 + 每次買入/加碼/賣出後。
 */

import type { Pet, NormalTier, Tier } from '@/types';
import { TIER_ORDER } from '@/types';

export interface EvolutionInput {
  /** 累積報酬率（小數，0.05 = +5%） */
  returnRate: number;
  /** 從首次購入到現在持有的天數 */
  daysHeld: number;
}

interface Threshold {
  tier: NormalTier;
  minReturnRate: number;
  minDays: number;
}

const NORMAL_THRESHOLDS: Threshold[] = [
  { tier: 'normal', minReturnRate: -Infinity, minDays: 0 },
  { tier: 'spirit', minReturnRate: 0.05, minDays: 30 },
  { tier: 'demon', minReturnRate: 0.15, minDays: 90 },
  { tier: 'god', minReturnRate: 0.30, minDays: 180 },
  { tier: 'saint', minReturnRate: 0.50, minDays: 365 },
  { tier: 'celestial', minReturnRate: 1.00, minDays: 730 }
];

interface CursedThreshold {
  tier: 'cursed1' | 'cursed2' | 'cursed3';
  maxReturnRate: number;
  minDays: number;
}

const CURSED_THRESHOLDS: CursedThreshold[] = [
  { tier: 'cursed1', maxReturnRate: -0.10, minDays: 30 },
  { tier: 'cursed2', maxReturnRate: -0.25, minDays: 90 },
  { tier: 'cursed3', maxReturnRate: -0.50, minDays: 180 }
];

const PURIFY_RETURN_RATE = 0.05;

/** 該報酬率 + 持有天數 對應到的最高正向境界 */
function bestNormalTier(input: EvolutionInput): NormalTier {
  let result: NormalTier = 'normal';
  for (const t of NORMAL_THRESHOLDS) {
    if (input.returnRate >= t.minReturnRate && input.daysHeld >= t.minDays) {
      result = t.tier;
    }
  }
  return result;
}

/** 該報酬率 + 持有天數 對應到的凶獸階級（找不到就回 null） */
function matchedCursedTier(input: EvolutionInput): CursedThreshold | null {
  let result: CursedThreshold | null = null;
  for (const t of CURSED_THRESHOLDS) {
    if (input.returnRate <= t.maxReturnRate && input.daysHeld >= t.minDays) {
      result = t; // 越往後越嚴重，所以最後賦值的是最高凶獸階
    }
  }
  return result;
}

/** 計算等級：每 1,000 NT$ 投入 = 1 級，最低 1，最高 99 */
export function calculateLevel(totalCost: number): number {
  return Math.max(1, Math.min(99, Math.floor(totalCost / 1000) + 1));
}

/** 在 TIER_ORDER 中的索引（用來比較進化高低） */
function normalTierIndex(tier: NormalTier): number {
  return TIER_ORDER.indexOf(tier);
}

export interface EvolutionResult {
  /** 新的 tier（顯示用） */
  tier: Tier;
  /** 新的 maxNormalTier（達成過的最高正向境界） */
  maxNormalTier: NormalTier;
  /** 是否本次發生了「正向晉升」（成就 / 動畫用） */
  promoted: boolean;
  /** 是否本次發生了「黑化加深或首次黑化」 */
  corrupted: boolean;
  /** 是否本次發生了「淨化」 */
  purified: boolean;
}

/**
 * 計算寵物應該處於的新狀態。
 * 這個 function 是純的（不修改 pet），呼叫端拿結果再決定如何寫回 DB。
 */
export function evolvePet(pet: Pet, input: EvolutionInput): EvolutionResult {
  const wasCursed = pet.tier === 'cursed1' || pet.tier === 'cursed2' || pet.tier === 'cursed3';

  // 1. 看 normal 路線能達到的最高境界
  const candidateNormal = bestNormalTier(input);
  const newMaxNormal: NormalTier =
    normalTierIndex(candidateNormal) > normalTierIndex(pet.maxNormalTier)
      ? candidateNormal
      : pet.maxNormalTier;
  const promoted = newMaxNormal !== pet.maxNormalTier;

  // 2. 黑化判斷
  if (wasCursed) {
    // 已黑化：先看是否達到淨化條件
    if (input.returnRate >= PURIFY_RETURN_RATE) {
      return {
        tier: newMaxNormal,
        maxNormalTier: newMaxNormal,
        promoted,
        corrupted: false,
        purified: true
      };
    }
    // 還在黑化：看凶獸階級會不會更深
    const cursed = matchedCursedTier(input);
    if (cursed) {
      const order = ['cursed1', 'cursed2', 'cursed3'] as const;
      const newIdx = order.indexOf(cursed.tier);
      const oldIdx = order.indexOf(pet.tier as 'cursed1' | 'cursed2' | 'cursed3');
      if (newIdx > oldIdx) {
        return {
          tier: cursed.tier,
          maxNormalTier: newMaxNormal,
          promoted,
          corrupted: true,
          purified: false
        };
      }
    }
    // 沒淨化、沒加深，維持原狀
    return {
      tier: pet.tier,
      maxNormalTier: newMaxNormal,
      promoted,
      corrupted: false,
      purified: false
    };
  }

  // 未黑化：先看會不會黑化
  const cursed = matchedCursedTier(input);
  if (cursed) {
    return {
      tier: cursed.tier,
      maxNormalTier: newMaxNormal,
      promoted,
      corrupted: true,
      purified: false
    };
  }

  // 未黑化、不會黑化：用 normal 路線結果
  return {
    tier: newMaxNormal,
    maxNormalTier: newMaxNormal,
    promoted,
    corrupted: false,
    purified: false
  };
}
