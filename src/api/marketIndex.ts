/**
 * 加權指數(TAIEX)抓取。
 *
 * 兩個資料源:
 *  - 盤中即時:mis API channel `tse_t00.tw`(走既有 /api/mis proxy)
 *  - 歷史日 K:TWSE OpenAPI `/v1/indicesReport/MI_5MINS_HIST?date=YYYYMMDD`
 *    回特定月份每日 5 分 K 中的尾盤值;我們只取每日最末筆當當日收盤
 *
 * openapi.twse.com.tw 對 browser 開放 CORS,所以前端可以直接打,
 * 不需要新建 Cloudflare Function proxy(跟現有 mis 不同:mis 沒 CORS 要 proxy)。
 */

import { ApiError } from './errors';
import { getTaipeiDateString } from './marketHours';
import type { MarketIndexBar } from '@/types';

const MIS_BASE = '/api/mis';
const OPENAPI_BASE = 'https://openapi.twse.com.tw/v1';

/** mis 即時報價的單筆欄位(只列加權指數會用到的) */
interface MisIndexQuote {
  c: string; // 代號(t00)
  z?: string; // 最新指數
  y?: string; // 昨收
  tlong?: string;
  pz?: string; // 試撮
}

interface MisResponse {
  msgArray?: MisIndexQuote[];
}

/** 解析 mis 回傳的字串成數字 */
function parseNum(v: string | undefined): number | null {
  if (!v || v === '-' || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * 抓加權指數即時值(盤中或盤後最新值)。
 * 失敗 throw ApiError;個別欄位缺失但有 fallback 時不算失敗。
 */
export async function fetchTaiexQuote(): Promise<MarketIndexBar> {
  const now = Date.now();
  const url = `${MIS_BASE}/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(
    'tse_t00.tw'
  )}&json=1&delay=0&_=${now}`;

  let resp: Response;
  try {
    resp = await fetch(url, { method: 'GET' });
  } catch (e) {
    throw new ApiError('network', '無法連線到加權指數即時報價', { endpoint: url, cause: e });
  }
  if (!resp.ok) {
    throw new ApiError('http', `${resp.status} ${resp.statusText}`, { endpoint: url });
  }

  let data: MisResponse;
  try {
    data = (await resp.json()) as MisResponse;
  } catch (e) {
    throw new ApiError('parse', '加權指數 API 回應格式異常', { endpoint: url, cause: e });
  }

  const q = data.msgArray?.[0];
  const last = q ? parseNum(q.z) ?? parseNum(q.pz) : null;
  if (last == null) {
    throw new ApiError('parse', '加權指數 API 沒回最新值', { endpoint: url });
  }

  return {
    symbol: 'TAIEX',
    date: getTaipeiDateString(),
    close: last,
    fetchedAt: now,
    source: 'intraday' // 呼叫端可依 isMarketOpen 判斷後改成 'close'
  };
}

/** OpenAPI 回傳的單筆 5 分 K 欄位(列我們會用的) */
interface OpenapiIndexBar {
  Date: string; // "1140506" or similar(民國年 + 月日)
  Time?: string; // "13:30" 或 "0900"
  // 開高低收 通常叫:
  OpeningIndex?: string;
  HighestIndex?: string;
  LowestIndex?: string;
  ClosingIndex?: string;
}

/** 把民國年日期 1140506 → 西元 2025-05-06 */
function rocDateToYMD(roc: string): string | null {
  // 兩種格式:1140506 (7 chars) 或 114/05/06
  const trimmed = roc.replace(/[/-]/g, '').trim();
  if (trimmed.length !== 7) return null;
  const y = Number(trimmed.slice(0, 3)) + 1911;
  const m = trimmed.slice(3, 5);
  const d = trimmed.slice(5, 7);
  if (!Number.isFinite(y)) return null;
  return `${y}-${m}-${d}`;
}

/**
 * 抓特定月份的 TAIEX 歷史 5 分 K 資料,從中萃取出每日收盤。
 * 月份格式 yyyymmdd(任何當月日期都可,通常用月初)。
 *
 * 注意 OpenAPI 在「當前月份」回的是「至今為止的每天」;歷史月份回完整月。
 */
export async function fetchTaiexHistoryMonth(yyyymmdd: string): Promise<MarketIndexBar[]> {
  const url = `${OPENAPI_BASE}/indicesReport/MI_5MINS_HIST?date=${yyyymmdd}`;
  let resp: Response;
  try {
    resp = await fetch(url, { method: 'GET' });
  } catch (e) {
    throw new ApiError('network', '無法連線到 TWSE OpenAPI', { endpoint: url, cause: e });
  }
  if (!resp.ok) {
    throw new ApiError('http', `${resp.status} ${resp.statusText}`, { endpoint: url });
  }

  let data: OpenapiIndexBar[];
  try {
    data = (await resp.json()) as OpenapiIndexBar[];
  } catch (e) {
    throw new ApiError('parse', 'OpenAPI 回應格式異常', { endpoint: url, cause: e });
  }
  if (!Array.isArray(data)) {
    throw new ApiError('parse', 'OpenAPI 回應不是陣列', { endpoint: url });
  }

  // 同一天會有多筆 5 分 K(09:00, 09:05, ..., 13:30)。
  // 取每天最後一筆當當日收盤。
  const lastBarPerDate = new Map<string, OpenapiIndexBar>();
  for (const bar of data) {
    const ymd = rocDateToYMD(bar.Date);
    if (!ymd) continue;
    const existing = lastBarPerDate.get(ymd);
    if (!existing || (bar.Time ?? '') > (existing.Time ?? '')) {
      lastBarPerDate.set(ymd, bar);
    }
  }

  const fetchedAt = Date.now();
  const out: MarketIndexBar[] = [];
  for (const [date, bar] of lastBarPerDate) {
    const close = parseNum(bar.ClosingIndex);
    if (close == null) continue;
    out.push({
      symbol: 'TAIEX',
      date,
      close,
      fetchedAt,
      source: 'close'
    });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}
