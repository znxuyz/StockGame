/**
 * 排程式價格更新：
 *  - 從 Dexie 拿目前所有 active holdings 的代號
 *  - 打 API 抓最新價（盤中即時、盤外收盤）
 *  - 寫回 prices 表
 *
 * 寵物階級系統(tier / 黑化 / 淨化)在 2026-05 改版已移除,寵物等級
 * 在買入/加碼時就算完,價格更新本身不再觸發任何寵物狀態變動。
 *
 * 失敗策略：
 *  - 抓取失敗：保留前一次 prices 不歸零，將 ApiError 往外丟給 UI 顯示
 *  - 個別檔抓不到（missing）：該檔不更新，其他繼續
 */

import { db } from '@/db';
import { settingsRepo } from '@/repositories/settingsRepo';
import { fetchPrices, ApiError } from '@/api';

export interface PriceUpdateResult {
  /** 更新到的代號 */
  updated: string[];
  /** 沒抓到的代號 */
  missing: string[];
  /** 是否在盤中 */
  duringMarket: boolean;
}

/**
 * 主流程：抓價 → 寫 DB。
 * 不在這裡處理排程器（排程器由 hook 管理，這只負責一次的「手動或定時觸發」）。
 *
 * 失敗會 throw ApiError，呼叫端要 catch 後顯示給使用者。
 */
export async function runPriceUpdate(now: number = Date.now()): Promise<PriceUpdateResult> {
  // 1. 拿所有 active holdings
  const holdings = await db.holdings.toArray();
  if (holdings.length === 0) {
    return {
      updated: [],
      missing: [],
      duringMarket: false
    };
  }

  // 2. 從 stocks 表拿 market 資訊（必須有，因為買入時會塞）
  const codes = holdings.map((h) => h.code);
  const stocks = await db.stocks.bulkGet(codes);
  const targets: { code: string; market: 'TWSE' | 'TPEX' | 'ETF' }[] = [];
  for (let i = 0; i < codes.length; i++) {
    const s = stocks[i];
    if (s) targets.push({ code: s.code, market: s.market });
  }

  // 3. 抓價（失敗會直接 throw ApiError 給 UI）
  const result = await fetchPrices({ targets });

  // 4. 寫進 prices 表
  if (result.prices.length > 0) {
    await db.prices.bulkPut(result.prices);
  }

  // 5. 更新 settings.lastPriceUpdateAt(簡易追蹤;patch 沒既有 settings 自動 noop)
  await settingsRepo.patch({ lastPriceUpdateAt: now });

  return {
    updated: result.prices.map((p) => p.code),
    missing: result.missing,
    duringMarket: result.duringMarket
  };
}

/** 把錯誤包成 UI 易用的格式 */
export function describePriceUpdateError(e: unknown): string {
  if (e instanceof ApiError) {
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}
