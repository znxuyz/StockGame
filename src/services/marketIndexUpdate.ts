/**
 * 加權指數抓取 + 寫進 Dexie。
 *
 *  - ensureTaiexHistory:確保最近 N 天歷史在本地;缺哪幾個月就補
 *  - updateTaiexIntraday:抓最新值,寫入今天那筆(覆蓋)
 *
 * 失敗策略:silentRefresh 整套設計成失敗不彈 toast,所以這邊也跟著不丟
 * unhandled rejection,但**會 console.info 完整 diagnostic trace** —
 * 包含每月 URL / status / bar 數,出問題時 user 把 console 貼回來就能定位。
 *
 * **走 Cloudflare Pages Function proxy**(`/api/twse/v1/*` →
 * openapi.twse.com.tw)— 解決 CORS 根因。階段 4-C 加的 24h circuit-break
 * 在本檔已**拆除**,因為:
 *   - 有 proxy 後失敗率應該很低
 *   - 失敗時用戶看到 console.info 一條,不噴紅字,不需要 flag 防 spam
 *   - 24h block 反而會在「Proxy 部署順序卡住一次失敗」之後鎖死 UI,差體驗
 *
 * 模組載入時順手清舊版的 localStorage flag(v1 / v2 / v3),避免舊裝置
 * 升級後被歷史 flag 鎖住。
 */

import { db } from '@/db';
import { fetchTaiexQuote } from '@/api';
import { isMarketOpen, getTaipeiDateString } from '@/api/marketHours';

const SYMBOL = 'TAIEX' as const;

/** 一次性清掉所有歷史版本的 circuit-break flag(本檔已不再使用) */
try {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('stockgame.marketIndex.disabled.v1');
    localStorage.removeItem('stockgame.marketIndex.disabled.v2');
    localStorage.removeItem('stockgame.marketIndex.disabled.v3');
  }
} catch {
  /* ignore */
}

// ─── Yahoo Finance ^TWII 抓取(歷史日 K)──────────────────
//
// 為什麼用 Yahoo 而不是 TWSE OpenAPI MI_5MINS_HIST:
//   - OpenAPI 的 ?date= 參數實測會被忽略,每次都回最近 10 個交易日,
//     導致 8 個月迴圈拿回的全是同一份「最近 10 天」資料 → baseline
//     在 200+ 天前的玩家完全沒對應 TAIEX 點 → chart noTaiex=true
//   - Yahoo `^TWII` 一次 call 拿整段 range 日 K,乾淨可靠
//   - /api/yahoo CF Function proxy 已存在,沒新增 dependency

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

const YAHOO_BASE = '/api/yahoo';
const TAIEX_TICKER = '%5ETWII'; // ^TWII URL-encoded

/** YYYY-MM-DD → unix sec(台北時區當天 00:00) */
function ymdToUnixSec(ymd: string): number {
  return new Date(`${ymd}T00:00:00+08:00`).getTime() / 1000;
}

/** unix sec → YYYY-MM-DD(台北時區) */
function unixSecToYmd(sec: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(sec * 1000));
}

/**
 * 從 Yahoo Finance 一次抓 ^TWII 整段 range 的日收盤。
 * 失敗回空 Map,不 throw(caller 自己決定要不要 toast)。
 */
async function fetchTaiexHistoryRange(startDate: string, endDate: string): Promise<Map<string, number>> {
  const period1 = ymdToUnixSec(startDate);
  const period2 = ymdToUnixSec(endDate) + 86_400; // +1d 確保 endDate 包含
  const url = `${YAHOO_BASE}/v8/finance/chart/${TAIEX_TICKER}?period1=${period1}&period2=${period2}&interval=1d&events=history`;

  let resp: Response;
  try {
    resp = await fetch(url);
  } catch (e) {
    console.warn(`[marketIndex] fetch ${url} 連線失敗:`, e);
    return new Map();
  }
  // eslint-disable-next-line no-console
  console.info(`[marketIndex] fetch ${url} → status=${resp.status} content-type=${resp.headers.get('content-type')}`);
  if (!resp.ok) {
    console.warn(`[marketIndex] HTTP ${resp.status} ${resp.statusText}`);
    return new Map();
  }
  let data: YahooChartResponse;
  try {
    data = (await resp.json()) as YahooChartResponse;
  } catch (e) {
    console.warn(`[marketIndex] JSON 解析失敗:`, e);
    return new Map();
  }
  if (data.chart.error || !data.chart.result || data.chart.result.length === 0) {
    console.warn(`[marketIndex] yahoo error:`, data.chart.error?.description ?? 'no result');
    return new Map();
  }
  const result = data.chart.result[0];
  const ts = result.timestamp ?? [];
  // 優先 adjclose 沒有再退 close
  const adjClose = result.indicators?.adjclose?.[0]?.adjclose;
  const rawClose = result.indicators?.quote?.[0]?.close;
  const closes = adjClose ?? rawClose ?? [];
  const out = new Map<string, number>();
  for (let i = 0; i < ts.length; i++) {
    const close = closes[i];
    if (close == null || !Number.isFinite(close)) continue;
    out.set(unixSecToYmd(ts[i]), close);
  }
  return out;
}

/**
 * 確保 TAIEX 歷史已經抓在本地。範圍**動態算**(跟 MarketCompareChart baseline 對齊):
 *
 *  1. 找 db.transactions 內 type='buy' 最早一筆 → 從那天起算
 *  2. 沒任何 buy 交易 → fallback 抓 days(預設 90)天
 *  3. 上限 5 年(防呆,避免假資料 baseline 太遠抓爆 API quota)
 *  4. 已 cached 範圍會被本地檢查跳過(只抓缺的日期 — 但目前用整批 fetch,
 *     Yahoo 一次 call 整段,所以策略簡化為:每次 mount 重抓整段覆蓋)
 *  5. **單一 Yahoo API call** 拿整段日 K → bulkPut 寫 db.marketIndices
 */
export async function ensureTaiexHistory(days: number = 90): Promise<{ fetchedMonths: number; error?: string }> {
  try {
    const now = new Date();
    const buys = await db.transactions.where('type').equals('buy').toArray();
    const fromMs = buys.length > 0
      ? Math.min(...buys.map((t) => t.timestamp))
      : now.getTime() - days * 86_400_000;
    const earliestAllowedMs = now.getTime() - 5 * 365 * 86_400_000;
    const startMs = Math.max(fromMs, earliestAllowedMs);

    const startDate = unixSecToYmd(startMs / 1000);
    const endDate = unixSecToYmd(now.getTime() / 1000);

    // eslint-disable-next-line no-console
    console.info(`[marketIndex] ensureTaiexHistory: 抓 ${startDate} ~ ${endDate} (Yahoo ^TWII)`);

    const closeMap = await fetchTaiexHistoryRange(startDate, endDate);
    if (closeMap.size === 0) {
      console.warn(`[marketIndex] ensureTaiexHistory 無資料`);
      return { fetchedMonths: 0, error: 'no data' };
    }

    const fetchedAt = Date.now();
    const bars = [...closeMap.entries()].map(([date, close]) => ({
      symbol: SYMBOL,
      date,
      close,
      fetchedAt,
      source: 'close' as const
    }));
    await db.marketIndices.bulkPut(bars);

    // eslint-disable-next-line no-console
    console.info(
      `[marketIndex] ensureTaiexHistory 完成:寫入 ${bars.length} 筆日 K,範圍 ${bars[0].date} ~ ${bars[bars.length - 1].date}`
    );
    return { fetchedMonths: bars.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[marketIndex] ensureTaiexHistory 失敗:${msg}`);
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
