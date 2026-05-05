/**
 * 統一的價格抓取介面（呼叫者只跟這個檔案打交道）。
 *
 * 流程：
 *  1. 給定一批股票代號 + market
 *  2. 嘗試從 mis 抓（盤中=即時、盤後=最新收盤）
 *  3. 帶 retry，失敗丟 ApiError 讓 UI 顯示
 *  4. 回傳 StockPrice[]，呼叫端寫進 Dexie
 *
 * 之後若要加 yahoo finance 之類的後援，只要再開一個 fetcher 然後在這層做 fallback。
 */

import type { Market, StockPrice } from '@/types';
import { fetchMisQuotes, type MisFetchResult } from './twseMis';
import { withRetry } from './retry';
import { isMarketOpen } from './marketHours';

export interface FetchPricesInput {
  /** 股票代號 + market */
  targets: { code: string; market: Market }[];
}

export interface FetchPricesResult {
  prices: StockPrice[];
  missing: string[];
  metadata: MisFetchResult['metadata'];
  /** 抓取時刻是否在盤中 */
  duringMarket: boolean;
}

/**
 * 依照盤中/盤後抓取價格。
 * - 盤中：即時報價
 * - 盤後：API 自動回最新收盤價
 *
 * 失敗會 throw ApiError；呼叫端要 catch 後顯示給使用者。
 */
export async function fetchPrices(input: FetchPricesInput): Promise<FetchPricesResult> {
  if (input.targets.length === 0) {
    return { prices: [], missing: [], metadata: new Map(), duringMarket: isMarketOpen() };
  }

  const result = await withRetry(() => fetchMisQuotes(input.targets));
  const duringMarket = isMarketOpen();

  // 盤外把 source 標成 close
  if (!duringMarket) {
    for (const p of result.prices) {
      p.source = 'close';
    }
  }

  return { ...result, duringMarket };
}
