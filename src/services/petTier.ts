/**
 * 三維度養成系統(階段 1.1):純計算邏輯。
 *
 * 三個維度互相獨立,皆從現有資料 derived:
 *  - 等級 Lv.1-999       ← totalInvested(每 NT$1,000 = 1 級)
 *  - 魂環境界(凡/靈/妖/神/聖/仙)← monthsHeld(從 firstBuyDate 算)
 *  - 魂環特效(暗/普通/脈動/旋轉/噴光)← returnRate(從持倉現價 / totalInvested 算)
 *
 * 後續階段(1.2 - 1.7)會用這些函式驅動視覺:
 *  - SoulRingRenderer 用 realm 決定 9 顆環顏色,用 effect 決定動畫
 *  - PetInfoModal 用 monthsHeld 算「距下個境界還幾月」進度條
 *  - PetSprite 比較 status.realm vs pet.lastRealmCheck 觸發突破動畫
 *
 * 不存 DB 的 derived 欄位:
 *  - level / monthsHeld / returnRate / realm / effect 都是即時算
 *  - 只有 customName / lastRealmCheck 真的存 pet 表(階段 1.1 已加)
 */

import type { Pet, Holding, StockPrice } from '@/types';
import { calculateLevel } from './evolution';

// ─── 魂環境界 ──────────────────────────────────────────────────────────────

/** 魂環境界:6 階,隨持有月數累積。跟報酬率無關 — 只看時間 */
export type SoulRealm = 'fan' | 'ling' | 'yao' | 'shen' | 'sheng' | 'xian';

export const REALM_ORDER: SoulRealm[] = ['fan', 'ling', 'yao', 'shen', 'sheng', 'xian'];

const REALM_LABELS: Record<SoulRealm, string> = {
  fan: '凡',
  ling: '靈',
  yao: '妖',
  shen: '神',
  sheng: '聖',
  xian: '仙'
};

/** 升到該境界所需的最少持有月數(下界,>=) */
export const REALM_THRESHOLD_MONTHS: Record<SoulRealm, number> = {
  fan: 0,
  ling: 3,
  yao: 12,
  shen: 36,
  sheng: 60,
  xian: 120
};

/** 魂環顏色(0xRRGGBB),xian 為 null 表示彩虹特殊處理 */
export const REALM_COLOR: Record<SoulRealm, number | null> = {
  fan: 0xffffff,
  ling: 0xffd700,
  yao: 0x9c27b0,
  shen: 0x1a1a1a,
  sheng: 0xe63946,
  xian: null
};

export function getRealm(monthsHeld: number): SoulRealm {
  if (monthsHeld >= REALM_THRESHOLD_MONTHS.xian) return 'xian';
  if (monthsHeld >= REALM_THRESHOLD_MONTHS.sheng) return 'sheng';
  if (monthsHeld >= REALM_THRESHOLD_MONTHS.shen) return 'shen';
  if (monthsHeld >= REALM_THRESHOLD_MONTHS.yao) return 'yao';
  if (monthsHeld >= REALM_THRESHOLD_MONTHS.ling) return 'ling';
  return 'fan';
}

export function realmLabel(realm: SoulRealm): string {
  return REALM_LABELS[realm];
}

export function realmRank(realm: SoulRealm): number {
  return REALM_ORDER.indexOf(realm);
}

/**
 * 距離下一個境界的進度(0-1)。已仙境回 1。
 * 用於 PetInfoModal 顯示「距 X 境還需 Y 個月」進度條。
 */
export function realmProgress(monthsHeld: number): {
  current: SoulRealm;
  next: SoulRealm | null;
  monthsToNext: number;
  progress: number;
} {
  const current = getRealm(monthsHeld);
  const idx = realmRank(current);
  const next = idx < REALM_ORDER.length - 1 ? REALM_ORDER[idx + 1] : null;
  if (!next) {
    return { current, next: null, monthsToNext: 0, progress: 1 };
  }
  const currMin = REALM_THRESHOLD_MONTHS[current];
  const nextMin = REALM_THRESHOLD_MONTHS[next];
  const span = nextMin - currMin;
  const into = monthsHeld - currMin;
  const progress = Math.max(0, Math.min(1, into / span));
  const monthsToNext = Math.max(0, nextMin - monthsHeld);
  return { current, next, monthsToNext, progress };
}

// ─── 魂環特效 ──────────────────────────────────────────────────────────────

/** 魂環特效:5 種,隨報酬率區段切換。跟時間無關 — 只看當下盈虧 */
export type RingEffect = 'dim' | 'normal' | 'pulsing' | 'rotating' | 'erupting';

export const EFFECT_ORDER: RingEffect[] = ['dim', 'normal', 'pulsing', 'rotating', 'erupting'];

const EFFECT_LABELS: Record<RingEffect, string> = {
  dim: '暗淡',
  normal: '普通',
  pulsing: '脈動',
  rotating: '旋轉',
  erupting: '噴光'
};

/** 升到該特效所需的最低報酬率(下界,>=) */
export const EFFECT_THRESHOLD: Record<RingEffect, number> = {
  dim: -Infinity,
  normal: 0,
  pulsing: 0.2,
  rotating: 0.5,
  erupting: 1.0
};

export function getRingEffect(returnRate: number): RingEffect {
  if (returnRate >= EFFECT_THRESHOLD.erupting) return 'erupting';
  if (returnRate >= EFFECT_THRESHOLD.rotating) return 'rotating';
  if (returnRate >= EFFECT_THRESHOLD.pulsing) return 'pulsing';
  if (returnRate >= EFFECT_THRESHOLD.normal) return 'normal';
  return 'dim';
}

export function effectLabel(effect: RingEffect): string {
  return EFFECT_LABELS[effect];
}

// ─── 三維度狀態計算器 ──────────────────────────────────────────────────────

export interface PetStatus {
  /** Lv.1-999 */
  level: number;
  /** 凡/靈/妖/神/聖/仙 */
  realm: SoulRealm;
  /** 暗/普通/脈動/旋轉/噴光 */
  effect: RingEffect;
  /** 持有月數(浮點) */
  monthsHeld: number;
  /** 累積投入 NT$(holding.totalCost) */
  totalInvested: number;
  /** 當前市值 NT$(shares × price.currentPrice) */
  currentValue: number;
  /** 累積報酬率 */
  returnRate: number;
}

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30;

/**
 * 給一隻 pet + 對應 holding + 當前 price,算三維度狀態。
 * 純函式,不寫 DB,不依賴 React。
 *
 * holding 拿不到 / 已退役時所有欄位回 0(避免 modal 在資料還沒載完時崩)。
 * price 拿不到時 currentValue / returnRate 回 0(視為持平)。
 */
export function getPetStatus(
  pet: Pet,
  holding: Holding | undefined,
  price: StockPrice | undefined,
  now: number = Date.now()
): PetStatus {
  const totalInvested = holding?.totalCost ?? 0;
  const shares = holding?.shares ?? 0;
  const currentValue = price && shares > 0 ? price.currentPrice * shares : 0;
  const returnRate = totalInvested > 0 ? (currentValue - totalInvested) / totalInvested : 0;

  const firstBuy = holding?.firstPurchasedAt ?? pet.bornAt;
  const monthsHeld = Math.max(0, (now - firstBuy) / MS_PER_MONTH);

  return {
    level: calculateLevel(totalInvested),
    realm: getRealm(monthsHeld),
    effect: getRingEffect(returnRate),
    monthsHeld,
    totalInvested,
    currentValue,
    returnRate
  };
}
