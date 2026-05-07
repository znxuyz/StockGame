/**
 * 台灣國定假日 / 補假 / 颱風假 對照表。
 *
 * 資料來源:`src/data/holidays.json`,由 GitHub Actions 從
 * ruyut/TaiwanCalendar(行政院人事行政總處公告的繁中版整理)每月抓取 +
 * commit 進 repo(`scripts/fetch-holidays.mjs`)。
 *
 * 為什麼要這個:
 *  - 假日台股不開盤,但 mis API 仍會回最後一交易日的資料 → 沒這表的話 app 會
 *    把 9:05~13:30 的工作日假日誤認成「盤中即時」並跑 30 秒自動 polling,
 *    雜訊 + 浪費 API quota
 *  - UI 上顯示「🏮 假日」比「⚪ 盤外收盤」更明確 — 玩家知道是台股放假不是別的
 *
 * 不在表上的日期 → 視為非假日(預設行為)。新代號 / 新年度 / 颱風臨時公告
 * 沒進 repo 也不會壞 app,只會誤判一天而已。
 */

import data from './holidays.json';

interface HolidaysFile {
  fetchedAt: string | null;
  source: string;
  count: number;
  /** YYYY-MM-DD 字串陣列 */
  holidays: string[];
}

const file = data as HolidaysFile;
const holidaySet = new Set(file.holidays);

/**
 * 給定一個 YYYY-MM-DD 台北時區字串,判斷是否為國定假日。
 */
export function isHolidayDate(taipeiYMD: string): boolean {
  return holidaySet.has(taipeiYMD);
}

/** Debug 用 */
export function getHolidaysMeta(): { fetchedAt: string | null; count: number } {
  return { fetchedAt: file.fetchedAt, count: file.count };
}
