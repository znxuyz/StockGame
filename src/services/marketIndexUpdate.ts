/**
 * 加權指數抓取 + 寫進 Dexie。
 *
 *  - ensureTaiexHistory:確保最近 N 天歷史在本地;缺哪幾個月就補
 *  - updateTaiexIntraday:抓最新值,寫入今天那筆(覆蓋)
 *
 * 失敗策略:silentRefresh 整套設計成失敗不彈 toast,只 console.warn,
 * 所以這邊也跟著不丟 unhandled rejection。
 */

import { db } from '@/db';
import { fetchTaiexQuote, fetchTaiexHistoryMonth } from '@/api';
import { isMarketOpen, getTaipeiDateString } from '@/api/marketHours';

const SYMBOL = 'TAIEX' as const;

/** YYYY-MM 字串(台北時區) */
function taipeiYearMonth(date: Date): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit'
  });
  // en-CA: "YYYY-MM-DD" 取前 7 chars 變 YYYY-MM
  return fmt.format(date).slice(0, 7);
}

/** 把 YYYY-MM 轉成 YYYYMMDD(月初) */
function yearMonthToOpenapiDate(ym: string): string {
  return ym.replace('-', '') + '01';
}

/**
 * 確保最近 days 天的 TAIEX 歷史已經抓在本地。
 * 邏輯:
 *  1. 算需要哪幾個月(YYYY-MM)
 *  2. 看 marketIndices 哪幾個月已有(>=15 筆 = 該月已抓過)
 *  3. 缺的月份逐個補(每月一個 API call)
 *
 * days 預設 90,意思是「保證近三個月資料齊全」。再多歷史就是用前面月份的 cache。
 */
export async function ensureTaiexHistory(days: number = 90): Promise<{ fetchedMonths: number; error?: string }> {
  try {
    const now = new Date();
    const months = new Set<string>();
    // 倒推 days 天,把覆蓋到的月份都收進來
    for (let i = 0; i <= days; i++) {
      const d = new Date(now.getTime() - i * 86_400_000);
      months.add(taipeiYearMonth(d));
    }

    let fetched = 0;
    for (const ym of months) {
      const start = `${ym}-01`;
      const end = `${ym}-31`;
      const existing = await db.marketIndices
        .where('[symbol+date]')
        .between([SYMBOL, start], [SYMBOL, end], true, true)
        .count();
      // 該月已有 >= 15 筆視為已抓過(假設交易日不會少於 15 天)
      // 若是當月,允許重抓(因為當月還在累積)
      const isCurrentMonth = ym === taipeiYearMonth(now);
      if (!isCurrentMonth && existing >= 15) continue;

      const bars = await fetchTaiexHistoryMonth(yearMonthToOpenapiDate(ym));
      if (bars.length > 0) {
        await db.marketIndices.bulkPut(bars);
        fetched++;
      }
    }
    return { fetchedMonths: fetched };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[marketIndex] ensureTaiexHistory 失敗:', msg);
    return { fetchedMonths: 0, error: msg };
  }
}

/**
 * 抓 TAIEX 最新值,寫進今天那筆(覆蓋)。
 * 盤外時 source 標 'close',盤中標 'intraday'。
 *
 * 失敗只 console.warn,不丟錯誤 — silentRefresh 不希望雜訊彈 toast。
 */
export async function updateTaiexIntraday(): Promise<void> {
  try {
    const bar = await fetchTaiexQuote();
    if (!isMarketOpen()) bar.source = 'close';
    await db.marketIndices.put(bar);
  } catch (e) {
    console.warn('[marketIndex] updateTaiexIntraday 失敗:', e);
  }
}

/** 取得本地所有 TAIEX 紀錄,依日期升冪 */
export async function getAllTaiex(): Promise<
  Array<{ date: string; close: number; source: 'intraday' | 'close' }>
> {
  const all = await db.marketIndices.where('symbol').equals(SYMBOL).sortBy('date');
  return all.map((b) => ({ date: b.date, close: b.close, source: b.source }));
}

/** 取得最新一筆 TAIEX(若沒有回 null) */
export async function getLatestTaiex(): Promise<
  { date: string; close: number; source: 'intraday' | 'close' } | null
> {
  const all = await db.marketIndices.where('symbol').equals(SYMBOL).reverse().sortBy('date');
  const latest = all[0];
  if (!latest) return null;
  return { date: latest.date, close: latest.close, source: latest.source };
}

/** 今天的台北日期(給 UI 對齊用) */
export function todayDate(): string {
  return getTaipeiDateString();
}
