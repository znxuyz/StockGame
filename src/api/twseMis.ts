/**
 * mis.twse.com.tw 的「即時/最新成交價」JSON API。
 *
 * 端點：/stock/api/getStockInfo.jsp?ex_ch=tse_2330.tw|otc_5269.tw|...
 *
 * 為什麼用這個（而不用 openapi.twse.com.tw 的 STOCK_DAY_ALL）：
 *  - mis 同時支援上市（tse_）/上櫃（otc_）一次抓
 *  - 盤中能拿到 5 秒延遲的即時價
 *  - 盤後/假日會自動回最新一筆收盤價，剛好符合需求
 *  - openapi.twse 的 STOCK_DAY_ALL 是當日結算才有，盤中拿不到
 *
 * 注意：
 *  - mis 沒有 CORS 標頭，dev 用 vite proxy（vite.config.ts 已設）
 *  - production 部署需要 serverless proxy（Cloudflare Pages Functions / Vercel 都行）
 *    Function 範例放在 functions/api/mis/[[path]].ts
 *  - 一次最多查 ~50 檔，超過要分批
 */

import type { Market, StockPrice } from '@/types';
import { ApiError } from './errors';

const MIS_BASE = '/api/mis';
const BATCH_SIZE = 50;

/** mis API 回傳的單筆欄位（只列我們會用的） */
interface MisQuote {
  c: string; // 股票代號
  n: string; // 中文簡稱
  nf?: string; // 中文全稱
  z?: string; // 最新成交價（盤中=即時、盤後=收盤）
  y?: string; // 昨收
  o?: string; // 開盤
  h?: string; // 最高
  l?: string; // 最低
  v?: string; // 累積成交量
  ex?: string; // 'tse' | 'otc'
  tlong?: string; // 時間 unix millis 字串
  /** 試撮價，盤後可能在這 */
  pz?: string;
}

interface MisResponse {
  msgArray?: MisQuote[];
  rtcode?: string;
  rtmessage?: string;
  /** 5 秒會更新一次的時間戳記 */
  queryTime?: { sysDate?: string; sysTime?: string };
}

/** 把 code 加上市場 prefix，成為 ex_ch 參數需要的格式 */
function toMisChannel(code: string, market: Market): string {
  // ETF 在台股是上市，prefix 用 tse_
  const prefix = market === 'TPEX' ? 'otc' : 'tse';
  return `${prefix}_${code}.tw`;
}

/** 解析 mis 回傳的字串成數字（mis 用 "-" 表示無資料） */
function parseNum(v: string | undefined): number | null {
  if (!v || v === '-' || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 把單筆 mis 結果轉成內部 StockPrice 格式 */
function toStockPrice(q: MisQuote, fallbackNow: number): StockPrice | null {
  // 最新價優先 z（成交價），次選 pz（試撮）
  const last = parseNum(q.z) ?? parseNum(q.pz);
  const prev = parseNum(q.y);
  if (last == null || prev == null) {
    // 完全沒拿到就放棄這筆，呼叫端會看到該檔沒被更新
    return null;
  }
  const change = last - prev;
  const pct = prev !== 0 ? change / prev : 0;
  const tlong = q.tlong ? Number(q.tlong) : NaN;
  const updatedAt = Number.isFinite(tlong) ? tlong : fallbackNow;
  // 用 z 當 source 的判斷依據：盤中會更新、盤後則是收盤價（mis 不直接區分，這裡看時間判斷）
  // 為求嚴謹：呼叫端會根據 isMarketOpen() 標記 source
  return {
    code: q.c,
    currentPrice: last,
    previousClose: prev,
    change,
    changePercent: pct,
    updatedAt,
    source: 'intraday' // 預設 intraday，呼叫端會在盤外時覆寫成 close
  };
}

export interface MisFetchResult {
  prices: StockPrice[];
  /** 沒抓到的代號（API 沒回） */
  missing: string[];
  /** 用於 metadata lookup：每個 code 對應的中文名與市場（不存在則沒有 entry） */
  metadata: Map<string, { name: string; market: Market }>;
}

/** 一次查多筆，自動分批；出錯丟 ApiError */
export async function fetchMisQuotes(
  codes: { code: string; market: Market }[]
): Promise<MisFetchResult> {
  const prices: StockPrice[] = [];
  const metadata = new Map<string, { name: string; market: Market }>();
  const missing = new Set(codes.map((c) => c.code));
  const now = Date.now();

  // 分批：50 檔一批
  for (let i = 0; i < codes.length; i += BATCH_SIZE) {
    const batch = codes.slice(i, i + BATCH_SIZE);
    const exCh = batch.map((c) => toMisChannel(c.code, c.market)).join('|');
    const url = `${MIS_BASE}/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(exCh)}&json=1&delay=0&_=${now}`;

    let resp: Response;
    try {
      resp = await fetch(url, { method: 'GET' });
    } catch (e) {
      throw new ApiError('network', '無法連線到台灣證交所即時報價', {
        endpoint: url,
        cause: e
      });
    }

    if (!resp.ok) {
      throw new ApiError('http', `${resp.status} ${resp.statusText}`, { endpoint: url });
    }

    let data: MisResponse;
    try {
      data = (await resp.json()) as MisResponse;
    } catch (e) {
      throw new ApiError('parse', '證交所 API 回應格式異常', { endpoint: url, cause: e });
    }

    if (!data.msgArray) {
      // 空回應通常代表代號全部都查不到
      continue;
    }

    for (const q of data.msgArray) {
      missing.delete(q.c);
      const price = toStockPrice(q, now);
      if (price) prices.push(price);
      if (q.n) {
        const market: Market = q.ex === 'otc' ? 'TPEX' : q.c.startsWith('00') ? 'ETF' : 'TWSE';
        metadata.set(q.c, { name: q.n, market });
      }
    }
  }

  return { prices, missing: [...missing], metadata };
}
