/**
 * 階段 5A:修仙稱號(根據累積修為自動升級)。
 *
 * 用「累積總修為」(lifetimeEarned)而非當前餘額計算,避免「消費後降級」的負反饋。
 * 從 userCultivation.lifetimeEarned 拿值。
 *
 * 8 階稱號:練氣 → 築基 → 金丹 → 元嬰 → 化神 → 煉虛 → 大乘 → 渡劫
 */

export interface CultivationTitle {
  id: number;
  min: number;
  max: number;
  name: string;
  emoji: string;
}

export const CULTIVATION_TITLES: readonly CultivationTitle[] = [
  { id: 1, min: 0, max: 500, name: '練氣境', emoji: '🌱' },
  { id: 2, min: 500, max: 2000, name: '築基境', emoji: '🪨' },
  { id: 3, min: 2000, max: 5000, name: '金丹境', emoji: '⚱️' },
  { id: 4, min: 5000, max: 15000, name: '元嬰境', emoji: '👶' },
  { id: 5, min: 15000, max: 50000, name: '化神境', emoji: '✨' },
  { id: 6, min: 50000, max: 150000, name: '煉虛境', emoji: '🌌' },
  { id: 7, min: 150000, max: 500000, name: '大乘境', emoji: '⭐' },
  { id: 8, min: 500000, max: Number.POSITIVE_INFINITY, name: '渡劫境', emoji: '⚡' }
];

export function getTitle(totalCultivation: number): CultivationTitle {
  const total = Math.max(0, totalCultivation);
  return (
    CULTIVATION_TITLES.find((t) => total >= t.min && total < t.max) ?? CULTIVATION_TITLES[0]
  );
}

export function getNextTitle(totalCultivation: number): CultivationTitle | null {
  const current = getTitle(totalCultivation);
  return CULTIVATION_TITLES.find((t) => t.id === current.id + 1) ?? null;
}

/**
 * 0-1 的進度條值,目前境界距下一階還差多少。
 * 渡劫境(頂)永遠 1.0(已封頂)。
 */
export function titleProgress(totalCultivation: number): number {
  const current = getTitle(totalCultivation);
  if (!Number.isFinite(current.max)) return 1;
  const total = Math.max(0, totalCultivation);
  return Math.min(1, Math.max(0, (total - current.min) / (current.max - current.min)));
}
