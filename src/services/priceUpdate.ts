/**
 * 排程式價格更新：
 *  - 從 Dexie 拿目前所有 active holdings 的代號
 *  - 打 API 抓最新價（盤中即時、盤外收盤）
 *  - 寫回 prices 表
 *  - 觸發每隻寵物的 evolution 評估
 *
 * 失敗策略：
 *  - 抓取失敗：保留前一次 prices 不歸零，將 ApiError 往外丟給 UI 顯示
 *  - 個別檔抓不到（missing）：該檔不更新，其他繼續
 */

import { db } from '@/db';
import type { Holding, Pet, StockPrice } from '@/types';
import { fetchPrices, ApiError } from '@/api';
import { evolvePet } from './evolution';
import { daysBetween } from '@/utils';

export interface PriceUpdateResult {
  /** 更新到的代號 */
  updated: string[];
  /** 沒抓到的代號 */
  missing: string[];
  /** 觸發進化的寵物 id 列表 */
  evolved: string[];
  /** 觸發黑化的寵物 id 列表 */
  corrupted: string[];
  /** 觸發淨化的寵物 id 列表 */
  purified: string[];
  /** 是否在盤中 */
  duringMarket: boolean;
}

/** 計算單一持倉的累積報酬率（含費用，價格用 currentPrice） */
function computeReturnRate(holding: Holding, price: StockPrice | undefined): number {
  if (!price || holding.totalCost === 0 || holding.shares === 0) return 0;
  const marketValue = holding.shares * price.currentPrice;
  return (marketValue - holding.totalCost) / holding.totalCost;
}

/**
 * 主流程：抓價 → 寫 DB → 評估進化。
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
      evolved: [],
      corrupted: [],
      purified: [],
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

  // 5. 評估每隻寵物的進化
  const priceMap = new Map(result.prices.map((p) => [p.code, p]));
  const evolved: string[] = [];
  const corrupted: string[] = [];
  const purified: string[] = [];

  for (const holding of holdings) {
    const price = priceMap.get(holding.code);
    if (!price) continue;
    const returnRate = computeReturnRate(holding, price);
    const daysHeld = daysBetween(holding.firstPurchasedAt, now);

    const pet = await db.pets.get(holding.petId);
    if (!pet) continue;

    const evo = evolvePet(pet, { returnRate, daysHeld });
    const tierChanged = evo.tier !== pet.tier;
    const maxChanged = evo.maxNormalTier !== pet.maxNormalTier;
    if (tierChanged || maxChanged) {
      const updatedPet: Pet = {
        ...pet,
        tier: evo.tier,
        maxNormalTier: evo.maxNormalTier,
        evolutionCount: pet.evolutionCount + (tierChanged ? 1 : 0),
        firstCorruptedAt: evo.corrupted && !pet.firstCorruptedAt ? now : pet.firstCorruptedAt,
        purificationCount: evo.purified ? pet.purificationCount + 1 : pet.purificationCount
      };
      await db.pets.put(updatedPet);
      if (evo.promoted) evolved.push(pet.id);
      if (evo.corrupted) corrupted.push(pet.id);
      if (evo.purified) purified.push(pet.id);
    }
  }

  // 6. 更新 settings.lastPriceUpdateAt（簡易追蹤）
  const settings = await db.settings.get('singleton');
  if (settings) {
    settings.lastPriceUpdateAt = now;
    await db.settings.put(settings);
  }

  return {
    updated: result.prices.map((p) => p.code),
    missing: result.missing,
    evolved,
    corrupted,
    purified,
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
