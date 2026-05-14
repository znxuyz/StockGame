/**
 * 股票代號驗證 — Excel 匯入 / 任何「驗證代號是否有效」場景共用。
 *
 * 設計原則:
 *  - StockGame 是純線上 app,沒網路本來就不能玩,**不做離線 fallback**
 *  - 跟 BuyModal 用**同一個** `lookupStock`(TWSE/TPEx MIS 即時 API),
 *    避免兩邊維護不同覆蓋率的本地清單
 *  - `db.stocks` 只是 `lookupStock` 內部的「加速 cache」,**不**作為
 *    「是否存在」的判斷依據(會在 lookupStock 內部 hit / miss)
 *
 * 驗證流程只有 2 層:
 *  1. 格式檢查:trim/uppercase/補 0 → 限定 2-8 位英數字
 *  2. 直接呼叫 `lookupStock`,即時 API 說 not-found 才算 invalid
 */
import type { Market, Stock } from '@/types';
import { lookupStock, isApiError } from '@/api';

/** 縮減後的 master entry — 給 UI / 驗證命中回傳用 */
export interface StockMasterEntry {
  code: string;
  name: string;
  /** 'TWSE' 上市 / 'TPEX' 上櫃 / 'ETF' */
  market: Market;
  type: 'stock' | 'etf';
}

/**
 * 標準化代號:trim + uppercase + 補 0(1-3 位數字 → 4 位)
 *  - "50"     → "0050"
 *  - "2330"   → "2330"
 *  - "00631L" → "00631L"(已 6 位 / 含字母 → 不改)
 *  - "  2330 " → "2330"
 */
export function normalizeStockCode(input: string | number): string {
  let code = String(input ?? '').trim().toUpperCase();
  if (/^[0-9]{1,3}$/.test(code)) code = code.padStart(4, '0');
  return code;
}

export interface ValidateStockResult {
  /** 是否合法(可匯入) */
  valid: boolean;
  /** 標準化後的代號 */
  normalizedCode: string;
  /** 命中時的官方資料 */
  hit?: StockMasterEntry;
  /** 錯誤訊息;valid=true 時 undefined */
  error?: string;
}

/**
 * 驗證股票代號是否有效。**跟 BuyModal 100% 同源**:都走 `lookupStock` 即時 API。
 *
 *  1. 格式檢查:trim/uppercase/補 0 → 限定 2-8 位英數字
 *  2. `lookupStock`:
 *     - 內部已含 `db.stocks` 加速 cache,命中直接回
 *     - 否則打 TWSE/TPEx MIS 即時 API,成功時順手寫 cache
 *  3. `ApiError` 分流:
 *     - `code='not-found'` → 「查無此股票」(代號錯 / 已下市)
 *     - 其他(網路 / HTTP / parse)→ 「網路問題,稍後重試」
 */
export async function validateStockCode(input: string | number): Promise<ValidateStockResult> {
  const normalizedCode = normalizeStockCode(input);

  if (!/^[0-9A-Z]{2,8}$/.test(normalizedCode)) {
    return {
      valid: false,
      normalizedCode,
      error: `股票代號「${normalizedCode}」格式不對(應為 4-6 位數字或英數字)`
    };
  }

  try {
    const stock = await lookupStock(normalizedCode);
    return { valid: true, normalizedCode, hit: stockToEntry(stock) };
  } catch (e) {
    if (isApiError(e) && e.code === 'not-found') {
      return {
        valid: false,
        normalizedCode,
        error: `股票代號「${normalizedCode}」查無此股票(已下市 / 代號錯誤)`
      };
    }
    if (isApiError(e)) {
      return {
        valid: false,
        normalizedCode,
        error: `查詢「${normalizedCode}」失敗(${e.code}),網路問題?請稍後重試`
      };
    }
    return {
      valid: false,
      normalizedCode,
      error: `查詢「${normalizedCode}」失敗:${e instanceof Error ? e.message : String(e)}`
    };
  }
}

function stockToEntry(s: Stock): StockMasterEntry {
  return {
    code: s.code,
    name: s.name,
    market: s.market,
    type: s.market === 'ETF' ? 'etf' : 'stock'
  };
}
