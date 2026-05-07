/**
 * 股票資訊查詢：玩家在「買入」彈窗輸入新代號時用。
 *
 * 因為玩家從零開始，DB 裡沒有起手包，所以每次新代號都會打 API：
 *  1. 試 tse_（上市）
 *  2. 試 otc_（上櫃）
 *  3. 兩個都查不到就回 not-found
 *
 * 取得的 name 會寫進 Dexie stocks 表，未來同代號就 cache 命中。
 */

import type { Stock } from '@/types';
import { db } from '@/db';
import { fetchMisQuotes } from './twseMis';
import { ApiError } from './errors';
import { withRetry } from './retry';
import { lookupIndustry } from '@/data/industries';

/**
 * 依照代號查股票資訊。
 *
 * 1. 先查 Dexie（命中直接回）
 * 2. 沒命中時打 mis API（同時試 tse + otc）
 * 3. 寫入 Dexie 給下次用
 *
 * 失敗丟 ApiError；找不到丟 not-found。
 */
export async function lookupStock(code: string): Promise<Stock> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) {
    throw new ApiError('not-found', '請輸入股票代號');
  }

  // 1. Dexie cache
  const cached = await db.stocks.get(trimmed);
  if (cached) return cached;

  // 2. 同時試上市/上櫃
  const result = await withRetry(() =>
    fetchMisQuotes([
      { code: trimmed, market: 'TWSE' },
      { code: trimmed, market: 'TPEX' }
    ])
  );

  const meta = result.metadata.get(trimmed);
  if (!meta) {
    throw new ApiError('not-found', `查無此代號：${trimmed}`);
  }

  const stock: Stock = {
    code: trimmed,
    name: meta.name,
    market: meta.market,
    // ETF 直接 'etf';其他用 src/data/industries.json 查 TWSE/TPEx 表
    // (該 JSON 由 .github/workflows/update-industries.yml 每月自動更新)
    industry: meta.market === 'ETF' ? 'etf' : lookupIndustry(trimmed),
    isActive: true
  };

  // 3. 寫入 cache（同時把抓到的價格也存進 prices 表）
  await db.stocks.put(stock);
  const price = result.prices.find((p) => p.code === trimmed);
  if (price) {
    await db.prices.put(price);
  }

  return stock;
}
