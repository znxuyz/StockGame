/**
 * 顯示用的格式化 helper。
 * 不在這裡做 i18n，全部 zh-TW 字串。
 */

/** 千位逗號，整數 */
export function formatInt(n: number): string {
  return Math.round(n).toLocaleString('zh-TW');
}

/**
 * 緊湊整數格式(HUD / 飄字用):
 *   < 1,000      → 純數字 "987"
 *   < 10,000     → 千分位 "1,234"
 *   < 1,000,000  → "12.3K"(1 位小數,夠看細節又省空間)
 *   >= 1,000,000 → "1.2M"
 * 負數保留正負號(例如 -1,200 / -12.3K)。
 */
export function formatCount(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs < 1000) return sign + Math.round(abs).toString();
  if (abs < 10_000) return sign + Math.round(abs).toLocaleString('en-US');
  if (abs < 1_000_000) return `${sign}${(abs / 1000).toFixed(1)}K`;
  return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
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

/**
 * 相對時間字串(中文,給「上次更新於」這類顯示用)。
 *  - 10 秒以內 → 「剛剛」
 *  - 1 分鐘以內 → 「N 秒前」
 *  - 1 小時以內 → 「N 分前」
 *  - 24 小時以內 → 「N 時前」
 *  - 否則 → 「N 天前」
 */
export function relativeTime(past: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - past);
  if (diff < 10_000) return '剛剛';
  if (diff < 60_000) return `${Math.floor(diff / 1000)} 秒前`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 時前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}
