/**
 * 顯示用的格式化 helper。
 * 不在這裡做 i18n，全部 zh-TW 字串。
 */

/** 千位逗號，整數 */
export function formatInt(n: number): string {
  return Math.round(n).toLocaleString('zh-TW');
}

/** 帶正負號的千位逗號（賺/賠用） */
export function formatSigned(n: number): string {
  const v = Math.round(n);
  return (v >= 0 ? '+' : '') + v.toLocaleString('zh-TW');
}

/** 兩位小數的千位逗號（價格用） */
export function formatPrice(n: number): string {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 百分比（小數轉百分比，固定兩位小數） */
export function formatPercent(rate: number, withSign = true): string {
  const pct = rate * 100;
  const fixed = pct.toFixed(2);
  if (!withSign) return `${fixed}%`;
  return (pct >= 0 ? '+' : '') + fixed + '%';
}

/** 兩個 unix millis 之間相差幾天（向下取整） */
export function daysBetween(from: number, to: number): number {
  return Math.floor((to - from) / 86_400_000);
}
