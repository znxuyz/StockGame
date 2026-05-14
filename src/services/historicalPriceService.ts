/**
 * 階段 5H — 歷史日收盤價快取。
 *
 * 給「累積報酬率 / 月度損益」歷史曲線回推用(`portfolioHistoryService.rebuildDailySnapshots`)。
 *
 * ──────────── 為什麼用 Yahoo Finance 當主要來源 ────────────
 *
 * 工單原本指定 TWSE STOCK_DAY 主、yfinance 備。改成 Yahoo 主的原因:
 *
 *  1. **覆蓋面**:Yahoo 一個 endpoint 同時涵蓋 TWSE / TPEx / ETF
 *     (`.TW` / `.TWO` 後綴),不必為 TPEx 另寫 fetcher
 *  2. **批次效率**:Yahoo 一次 request 拉任意日期範圍(period1..period2),
 *     5 檔股票 × 8 個月 → 5 個平行 call;TWSE STOCK_DAY 一次只回一個月,
 *     5 × 8 = 40 個 call,加上 ~1.5s rate-limit throttle 要 ~60s
 *  3. **資料品質**:Yahoo 回 `adjclose`(調整後收盤,已 forward-adjust 除權息),
 *     算「持有期間的真實漲跌」直接可用;TWSE 回原始收盤,要自己處理除權息
 *  4. **格式**:Yahoo 純 JSON + ISO 日期;TWSE 是 民國年(`113/05/14`)要轉換
 *
 * 壞掉時的 fallback:這檔目前沒實作 TWSE STOCK_DAY 兜底 — 如果 Yahoo 全壞
 * (Yahoo 已 down ~10 年沒發生過),caller 端 `prefetchRange` 會把該檔 push
 * 進 `failedCodes`,UI 顯示「N 檔歷史價載入失敗」即可。
 *
 * ──────────── Public API ────────────
 *
 *  - `getHistoricalPrice(code, date)`:單筆查詢(cache → fetch)
 *  - `prefetchRange(code, startDate, endDate)`:批次預抓某檔某段時間
 *  - `getPriceMap(code)`:某檔已快取的所有 (date → close) Map
 *  - `getPriceWithFallback(code, date)`:查不到該日(假日 / 缺資料)→ 往前抓
 *    最近一個有資料的日(rebuildDailySnapshots 在用)
 */

import { db } from '@/db';
import type { HistoricalPrice, Market } from '@/types';

const YAHOO_BASE = '/api/yahoo';

/**
 * 把代號 + market 轉成 Yahoo ticker:
 *  - TWSE / ETF → `.TW`
 *  - TPEX       → `.TWO`
 *
 * 注意 Yahoo 對台股 ticker 的代碼前面**不**補 0;直接用代號(0050.TW / 2330.TW / 3711.TW)。
 */
function toYahooTicker(code: string, market: Market): string {
  const suffix = market === 'TPEX' ? '.TWO' : '.TW';
  return `${code}${suffix}`;
}

/** YYYY-MM-DD → unix sec(台北時區當天 00:00 對應的 UTC sec) */
function ymdToUnixSec(ymd: string): number {
  return new Date(`${ymd}T00:00:00+08:00`).getTime() / 1000;
}

/** unix sec → YYYY-MM-DD(台北時區) */
function unixSecToYmd(sec: number): string {
  const d = new Date(sec * 1000);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return fmt.format(d);
}

interface YahooChartResponse {
  chart: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        adjclose?: Array<{ adjclose?: Array<number | null> }>;
        quote?: Array<{ close?: Array<number | null> }>;
      };
    }>;
    error?: { code: string; description: string } | null;
  };
}

/**
 * 對某 ticker 抓 [startDate, endDate] 範圍的日 K(台北時區)。
 * Yahoo 自帶 forward / backward 一點 buffer 不影響結果。
 *
 * 回 Map<date, close>;抓不到回 empty Map(caller 自行處理)。
 */
async function fetchYahooDaily(
  ticker: string,
  startDate: string,
  endDate: string
): Promise<Map<string, number>> {
  const period1 = ymdToUnixSec(startDate);
  // period2 + 1 天確保 endDate 當天也包含
  const period2 = ymdToUnixSec(endDate) + 86_400;
  const url = `${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${period1}&period2=${period2}&interval=1d&events=history`;

  let resp: Response;
  try {
    resp = await fetch(url);
  } catch (e) {
    console.warn(`[historicalPrice] fetch failed for ${ticker}:`, e);
    return new Map();
  }
  if (!resp.ok) {
    console.warn(`[historicalPrice] HTTP ${resp.status} for ${ticker}`);
    return new Map();
  }
  let data: YahooChartResponse;
  try {
    data = (await resp.json()) as YahooChartResponse;
  } catch (e) {
    console.warn(`[historicalPrice] parse failed for ${ticker}:`, e);
    return new Map();
  }

  if (data.chart.error || !data.chart.result || data.chart.result.length === 0) {
    console.warn(
      `[historicalPrice] yahoo error for ${ticker}:`,
      data.chart.error?.description ?? 'no result'
    );
    return new Map();
  }

  const result = data.chart.result[0];
  const ts = result.timestamp ?? [];
  // 優先 adjclose(已調整除權息);沒有再退原始 close
  const adjClose = result.indicators?.adjclose?.[0]?.adjclose;
  const rawClose = result.indicators?.quote?.[0]?.close;
  const closes = adjClose ?? rawClose ?? [];

  const out = new Map<string, number>();
  for (let i = 0; i < ts.length; i++) {
    const close = closes[i];
    if (close == null || !Number.isFinite(close)) continue;
    const ymd = unixSecToYmd(ts[i]);
    out.set(ymd, close);
  }
  return out;
}

/** 某代號已 cached 的所有 (date → close) Map(code 二級索引 query) */
export async function getPriceMap(code: string): Promise<Map<string, number>> {
  const rows = await db.historicalPrices.where('code').equals(code).toArray();
  return new Map(rows.map((r) => [r.date, r.close]));
}

/**
 * 預抓某檔股票某段時間的歷史價,寫進 cache。
 *
 *  - `db.stocks.get(code)` 拿 market(決定 .TW vs .TWO 後綴)
 *  - 已 cache 範圍會自動跳過(只抓缺的日期)
 *  - 失敗時不 throw,push code 到 failedCodes(caller 用來顯示「載入失敗」)
 */
export async function prefetchRange(
  code: string,
  startDate: string,
  endDate: string
): Promise<{ fetched: number; cached: number; failed: boolean }> {
  const stock = await db.stocks.get(code);
  if (!stock) {
    console.warn(`[historicalPrice] ${code} not in db.stocks; skipping prefetch`);
    return { fetched: 0, cached: 0, failed: true };
  }

  // 已 cache 的日期(避免重抓)
  const existing = await getPriceMap(code);
  const cachedCount = Array.from(existing.keys()).filter(
    (d) => d >= startDate && d <= endDate
  ).length;

  // 完全 cache 命中 → 不打 API
  // 粗估:期間天數約 (end - start) * 5/7 個交易日,有 90% 命中就跳過
  const totalDays = Math.floor(
    (Date.parse(endDate) - Date.parse(startDate)) / 86_400_000
  ) + 1;
  const expectedTradingDays = Math.floor(totalDays * 5 / 7);
  if (cachedCount >= expectedTradingDays * 0.9) {
    return { fetched: 0, cached: cachedCount, failed: false };
  }

  const ticker = toYahooTicker(code, stock.market);
  const dailyMap = await fetchYahooDaily(ticker, startDate, endDate);
  if (dailyMap.size === 0) {
    return { fetched: 0, cached: cachedCount, failed: true };
  }

  const now = Date.now();
  const rows: HistoricalPrice[] = Array.from(dailyMap.entries()).map(([date, close]) => ({
    code,
    date,
    close,
    source: 'yahoo' as const,
    fetchedAt: now
  }));
  await db.historicalPrices.bulkPut(rows);
  return { fetched: rows.length, cached: cachedCount, failed: false };
}

/**
 * 拿單一日期收盤價:cache → fetch(只抓那一個月,順手填 cache)。
 *
 * 拿不到回 null。`portfolioHistoryService` 用 `getPriceWithFallback` 多一層保護。
 */
export async function getHistoricalPrice(code: string, date: string): Promise<number | null> {
  const cached = await db.historicalPrices.get([code, date]);
  if (cached) return cached.close;

  // 抓那一個月(date 所在月份頭尾)— 一次拿 ~20 個交易日,後續查同月免再打
  const monthStart = date.slice(0, 7) + '-01';
  const monthEnd = (() => {
    const [y, m] = date.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return `${date.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;
  })();
  const r = await prefetchRange(code, monthStart, monthEnd);
  if (r.failed) return null;
  const refetched = await db.historicalPrices.get([code, date]);
  return refetched?.close ?? null;
}

/**
 * 拿某檔某日的價,**找不到就往前找最近的交易日**(週末 / 國定假日 / 缺資料用)。
 *
 *  - 從 cache 中拿所有 ≤ date 的 entries
 *  - 取最大日期那筆
 *  - 全空 → 回 null(需 caller 先 prefetchRange 過)
 *
 * `rebuildDailySnapshots` 在 daily loop 用這個 — 假日就拿前一交易日收盤。
 */
export function findPriceOnOrBefore(
  priceMap: Map<string, number>,
  date: string
): number | null {
  if (priceMap.has(date)) return priceMap.get(date)!;
  // 從 date 倒推最多 10 天找(連假最長 ~9 天:過年)
  const d = new Date(date + 'T00:00:00+08:00');
  for (let i = 1; i <= 10; i++) {
    const past = new Date(d);
    past.setUTCDate(past.getUTCDate() - i);
    const pastYmd = past.toISOString().slice(0, 10);
    if (priceMap.has(pastYmd)) return priceMap.get(pastYmd)!;
  }
  return null;
}
