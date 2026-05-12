/**
 * 階段 5F:勿擾時間判斷。
 *
 *  - 'HH:MM' 格式 → 分鐘數
 *  - 跨午夜(例 22:00 → 08:00)正確處理
 *  - 在勿擾時間內 → caller 只寫站內通知不發推播
 */

function toMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return 0;
  const h = Math.max(0, Math.min(23, Number(m[1])));
  const mm = Math.max(0, Math.min(59, Number(m[2])));
  return h * 60 + mm;
}

export function isInQuietHours(
  start: string,
  end: string,
  now: Date = new Date()
): boolean {
  const s = toMinutes(start);
  const e = toMinutes(end);
  const cur = now.getHours() * 60 + now.getMinutes();
  if (s === e) return false;
  if (s < e) {
    // 同日區間(例如 22:00-23:00 — 罕見)
    return cur >= s && cur < e;
  }
  // 跨午夜(22:00 → 08:00):cur 在 [s, 24h) ∪ [0, e)
  return cur >= s || cur < e;
}
