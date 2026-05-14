/**
 * 投資組合摘要計算（用於頂部資產列、紀錄頁）。
 *
 * 兩種損益（依使用者要求）：
 *  - 累積損益（cumulative）：以平均成本為基準
 *      未實現 = (currentPrice - avgCost) * shares
 *      已實現 = 所有 sell transaction 的 realizedPnL 加總
 *      total = 未實現 + 已實現
 *  - 當日損益（daily）：以前一日收盤為基準
 *      = (currentPrice - previousClose) * shares
 *
 *  累積報酬率 = total / totalCost（totalCost = 0 時為 0）
 */

import { db } from '@/db';
import { holdingRepo } from '@/repositories/holdingRepo';
import { transactionRepo } from '@/repositories/transactionRepo';
import type { Holding, StockPrice } from '@/types';

export interface PortfolioSummary {
  /** 持倉檔數 */
  holdingCount: number;
  /** 總市值 = Σ(price × shares) */
  totalMarketValue: number;
  /** 累積投入成本 = Σ(holding.totalCost) */
  totalCost: number;
  /** 未實現損益 = 總市值 - 累積成本 */
  unrealizedPnL: number;
  /** 累積已實現損益（從 transactions 表加總） */
  realizedPnL: number;
  /** 總損益 = 未實現 + 已實現 */
  totalPnL: number;
  /** 總報酬率 = totalPnL / totalCost */
  returnRate: number;
  /** 當日損益 = Σ((current - prevClose) × shares) */
  todayPnL: number;
  /** 當日報酬率 = todayPnL / (Σ prevClose × shares) */
  todayReturnRate: number;
}

const EMPTY_SUMMARY: PortfolioSummary = {
  holdingCount: 0,
  totalMarketValue: 0,
  totalCost: 0,
  unrealizedPnL: 0,
  realizedPnL: 0,
  totalPnL: 0,
  returnRate: 0,
  todayPnL: 0,
  todayReturnRate: 0
};

export async function computeSummary(): Promise<PortfolioSummary> {
  const [holdings, prices, sellTxns] = await Promise.all([
    holdingRepo.list(),
    db.prices.toArray(),
    transactionRepo.listByType('sell')
  ]);

  if (holdings.length === 0) {
    // 仍要計算已實現損益（賣光後也要顯示歷史總損益）
    const realized = sellTxns.reduce((sum, t) => sum + t.realizedPnL, 0);
    return {
      ...EMPTY_SUMMARY,
      realizedPnL: realized,
      totalPnL: realized
    };
  }

  const priceMap = new Map(prices.map((p) => [p.code, p]));

  let totalMarketValue = 0;
  let totalCost = 0;
  let todayPnL = 0;
  let todayPrevValue = 0;

  for (const h of holdings) {
    const p = priceMap.get(h.code);
    totalCost += h.totalCost;
    if (p) {
      totalMarketValue += p.currentPrice * h.shares;
      todayPnL += (p.currentPrice - p.previousClose) * h.shares;
      todayPrevValue += p.previousClose * h.shares;
    } else {
      // 沒抓到價就用 avgCost 當市值（避免顯示 0 元造成誤會）
      totalMarketValue += h.avgCost * h.shares;
    }
  }

  const unrealizedPnL = totalMarketValue - totalCost;
  const realizedPnL = sellTxns.reduce((sum, t) => sum + t.realizedPnL, 0);
  const totalPnL = unrealizedPnL + realizedPnL;
  const returnRate = totalCost > 0 ? totalPnL / totalCost : 0;
  const todayReturnRate = todayPrevValue > 0 ? todayPnL / todayPrevValue : 0;

  return {
    holdingCount: holdings.length,
    totalMarketValue,
    totalCost,
    unrealizedPnL,
    realizedPnL,
    totalPnL,
    returnRate,
    todayPnL,
    todayReturnRate
  };
}

/** 單一持倉的損益詳情（給彈窗用） */
export interface HoldingDetail {
  holding: Holding;
  /** 對應的最新價（沒有時為 undefined） */
  price?: StockPrice;
  /** 當前市值 */
  marketValue: number;
  /** 未實現損益 */
  unrealizedPnL: number;
  /** 累積報酬率（未實現 / totalCost） */
  returnRate: number;
  /** 當日損益 */
  todayPnL: number;
  /** 當日報酬率 */
  todayReturnRate: number;
}

export async function getHoldingDetail(code: string): Promise<HoldingDetail | null> {
  const holding = await holdingRepo.get(code);
  if (!holding) return null;
  const price = await db.prices.get(code);
  const marketValue = price ? price.currentPrice * holding.shares : holding.avgCost * holding.shares;
  const unrealizedPnL = marketValue - holding.totalCost;
  const returnRate = holding.totalCost > 0 ? unrealizedPnL / holding.totalCost : 0;
  const todayPnL = price ? (price.currentPrice - price.previousClose) * holding.shares : 0;
  const todayPrev = price ? price.previousClose * holding.shares : 0;
  const todayReturnRate = todayPrev > 0 ? todayPnL / todayPrev : 0;
  return { holding, price, marketValue, unrealizedPnL, returnRate, todayPnL, todayReturnRate };
}
