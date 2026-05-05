/**
 * 台股手續費 + 證交稅計算（台新證券預設 + 設定可調折扣）。
 *
 * 規則（依使用者：台新無折扣不當沖）：
 *  - 手續費：成交金額 × 0.001425 × 折扣（discount 介於 0~1，預設 1.0）
 *    最低 NT$20（不論折扣）
 *    無條件捨去到整數（台股實務）
 *  - 證交稅（賣方才有）：
 *    一般股票（TWSE / TPEX）：成交金額 × 0.003
 *    ETF：成交金額 × 0.001
 *    無條件捨去到整數
 *
 *  買入實付 = grossAmount + fee
 *  賣出實收 = grossAmount - fee - tax
 *
 * 不處理當沖（依使用者要求）。
 */

import type { Market } from '@/types';

export interface FeeConfig {
  /** 折扣（1.0 = 無折扣，0.28 = 28 折），存於 settings */
  discount: number;
  /** 最低手續費（NT$） */
  minFee: number;
}

/** 一般手續費率（基準，未折扣） */
const FEE_RATE = 0.001425;

/** 一般股票證交稅率 */
const TAX_RATE_STOCK = 0.003;

/** ETF 證交稅率 */
const TAX_RATE_ETF = 0.001;

/** 計算手續費（成交金額 × 0.1425% × 折扣，最低 minFee） */
export function calcFee(grossAmount: number, config: FeeConfig): number {
  const raw = Math.floor(grossAmount * FEE_RATE * config.discount);
  return Math.max(raw, config.minFee);
}

/** 計算證交稅（買方為 0；賣方才收） */
export function calcTax(grossAmount: number, market: Market, isSell: boolean): number {
  if (!isSell) return 0;
  const rate = market === 'ETF' ? TAX_RATE_ETF : TAX_RATE_STOCK;
  return Math.floor(grossAmount * rate);
}

/** 計算買入實付金額（成交金額 + 手續費） */
export function calcBuyNet(grossAmount: number, config: FeeConfig): number {
  return grossAmount + calcFee(grossAmount, config);
}

/** 計算賣出實收金額（成交金額 - 手續費 - 證交稅） */
export function calcSellNet(grossAmount: number, market: Market, config: FeeConfig): number {
  return grossAmount - calcFee(grossAmount, config) - calcTax(grossAmount, market, true);
}
