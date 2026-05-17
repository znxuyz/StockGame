/**
 * 加權指數抓取 + 寫進 Dexie。
 *
 *  - ensureTaiexHistory:確保最近 N 天歷史在本地;缺哪幾個月就補
 *  - updateTaiexIntraday:抓最新值,寫入今天那筆(覆蓋)
 *
 * 失敗策略:silentRefresh 整套設計成失敗不彈 toast,只 console.warn,
 * 所以這邊也跟著不丟 unhandled rejection。
 *
 * **CORS circuit-break**:openapi.twse.com.tw 對部分 origin 沒開 CORS,
 * 直接 fetch 會擋。階段 6 改走 Cloudflare Pages Function proxy
 * (`/api/twse/v1/*` → openapi.twse.com.tw)解決根因,**仍保留 circuit-break**
 * 應付 proxy 暫時故障 / upstream 502 等狀況。一旦失敗就寫 localStorage flag,
 * **24 小時內不再嘗試**。解除:console 跑
 * `localStorage.removeItem('stockgame.marketIndex.disabled.v2')` 或等 24h 自然過期。
 *
 * **key version bump v1→v2**:proxy 上線後舊用戶 localStorage v1 flag 可能還在,
 * 改 key 讓所有 client 視為新狀態重新嘗試。
 */

import { db } from '@/db';
import { fetchTaiexQuote, fetchTaiexHistoryMonth } from '@/api';
import { isMarketOpen, getTaipeiDateString } from '@/api/marketHours';

const SYMBOL = 'TAIEX' as const;

const DISABLED_KEY = 'stockgame.marketIndex.disabled.v2';

/** 一次性清舊 v1 flag(proxy 上線後,給舊 client 一個乾淨起點) */
try {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('stockgame.marketIndex.disabled.v1');
  }
} catch {
  /* ignore */
}
const DISABLED_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function isDisabled(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    const raw = localStorage.getItem(DISABLED_KEY);
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until) || Date.now() > until) {
      localStorage.removeItem(DISABLED_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function markDisabled(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(DISABLED_KEY, String(Date.now() + DISABLED_TTL_MS));
  } catch {
    /* ignore */
  }
}

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
  // 已在 circuit-break window 內 → 直接跳過,不噴 CORS 紅字
  if (isDisabled()) {
    return { fetchedMonths: 0, error: 'circuit-break: marketIndex disabled (24h)' };
  }
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
    markDisabled();
    // demote 到 info(不紅字)— 已知 TWSE OpenAPI CORS 對部分 origin 拒絕,
    // 標記 24h 不再嘗試,玩家看 MarketCompareChart 只少了 TAIEX 對比線
    // eslint-disable-next-line no-console
    console.info(
      `[marketIndex] ensureTaiexHistory 失敗 — 24h 內不再嘗試(${msg})`
    );
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
