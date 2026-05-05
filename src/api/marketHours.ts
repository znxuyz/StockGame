/**
 * 台股交易時段判斷。
 *
 * 規則：
 *  - 一般盤：週一至週五 09:00-13:30（台北時區）
 *  - 9:00 開盤後 5 分鐘內（9:00-9:05）資料尚未穩定，第一次抓設在 9:05
 *  - 13:30 收盤後直接用最新收盤價
 *  - 週末 / 國定假日 / 颱風假 用最新收盤價
 *
 * 國定假日：
 *  - MVP 階段不主動維護假日清單，假日時 API 會回最後一個交易日的資料
 *    (這是 mis.twse.com.tw 的實際行為，剛好符合「假日用最新收盤價」)
 *  - 若 API 行為改變，未來再加 holidays.ts
 */

const TPE_TIMEZONE = 'Asia/Taipei';

/** 9:05（第一次抓）對應的分鐘數，從當日 00:00 起算 */
const FIRST_FETCH_MINUTES = 9 * 60 + 5;

/** 13:30（最後一次抓）對應的分鐘數 */
const MARKET_CLOSE_MINUTES = 13 * 60 + 30;

/** 取得台北時區的「年/月/日/星期/時/分」 */
function getTaipeiNow(now: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  weekday: number; // 0 = 週日, 1 = 週一, ..., 6 = 週六
  hour: number;
  minute: number;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TPE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

  // weekday short: Sun=0, Mon=1, ..., Sat=6
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };

  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    weekday: weekdayMap[get('weekday')] ?? 0,
    hour: parseInt(get('hour'), 10),
    minute: parseInt(get('minute'), 10)
  };
}

/** 是否為週一到週五 */
export function isWeekday(now: Date = new Date()): boolean {
  const { weekday } = getTaipeiNow(now);
  return weekday >= 1 && weekday <= 5;
}

/**
 * 是否處於「盤中可抓即時價」時段。
 * 9:05 - 13:30，週一到週五。
 */
export function isMarketOpen(now: Date = new Date()): boolean {
  if (!isWeekday(now)) return false;
  const { hour, minute } = getTaipeiNow(now);
  const minutesOfDay = hour * 60 + minute;
  return minutesOfDay >= FIRST_FETCH_MINUTES && minutesOfDay <= MARKET_CLOSE_MINUTES;
}

/**
 * 取得下次「應該抓價」的時間點（unix millis）。
 * 用於排程：若現在不在盤中，回傳下個盤中時段的 9:05；若在盤中，回傳當前時間 + 5 分鐘。
 */
export function getNextFetchTime(now: Date = new Date(), intervalMinutes = 5): number {
  if (isMarketOpen(now)) {
    return now.getTime() + intervalMinutes * 60_000;
  }

  // 不在盤中：找下一個 9:05
  // 簡化做法：往前推 1 分鐘一次，直到找到盤中時間
  // 這個函式呼叫頻率極低（價格更新間隔），不影響效能
  const candidate = new Date(now.getTime());
  while (true) {
    candidate.setMinutes(candidate.getMinutes() + 1);
    if (isMarketOpen(candidate)) {
      return candidate.getTime();
    }
    // 安全閥：避免極端狀況跑無限迴圈（最多搜 8 天）
    if (candidate.getTime() - now.getTime() > 8 * 24 * 60 * 60_000) {
      return now.getTime() + intervalMinutes * 60_000;
    }
  }
}

/** 取得今日台北時區字串（YYYY-MM-DD），用於每日快照主鍵 */
export function getTaipeiDateString(now: Date = new Date()): string {
  const { year, month, day } = getTaipeiNow(now);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
