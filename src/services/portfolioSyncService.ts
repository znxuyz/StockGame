/**
 * 階段 5E:持倉同步到雲端 + 撈好友持倉(套用對方隱私遮罩)。
 *
 * 設計:
 *  - syncMyPortfolio:本地 holdings 算出每檔的 weight / 報酬,upsert
 *    user_portfolio_summary。debounced 由 caller 控制(App.tsx hook)
 *  - getFriendPortfolio:撈對方所有持倉 row + 對方隱私設定,**這層做遮罩**,
 *    UI 拿到的 investedAmountText 已是 "1*****7" / "---" / "1,234,567"
 *  - upsert by (user_id, stock_code);若本地賣光該檔 → delete 該 row 防 stale
 */

import { supabase, isCloudConfigured } from '@/lib/supabase';
import { db } from '@/db';
import { getFriendPrivacy } from './privacyService';
import { maskAmount } from '@/utils/amountMasker';
import type { FriendPortfolioItem, PortfolioSummaryItem } from '@/types';

interface PortfolioSummaryRow {
  user_id: string;
  stock_code: string;
  stock_name: string;
  portfolio_weight: number;
  invested_amount: number;
  current_value: number;
  unrealized_pnl: number;
  return_percent: number;
  daily_return_percent: number;
  updated_at: string;
}

function rowToItem(row: PortfolioSummaryRow): PortfolioSummaryItem {
  return {
    userId: row.user_id,
    stockCode: row.stock_code,
    stockName: row.stock_name,
    portfolioWeight: row.portfolio_weight,
    investedAmount: row.invested_amount,
    currentValue: row.current_value,
    unrealizedPnl: row.unrealized_pnl,
    returnPercent: row.return_percent,
    dailyReturnPercent: row.daily_return_percent,
    updatedAt: row.updated_at
  };
}

async function getCurrentUserId(): Promise<string | null> {
  if (!isCloudConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

/**
 * 把本地 holdings 同步到雲端 user_portfolio_summary。
 *  - 用市值 = price × shares;沒抓到 price → avgCost × shares 防 0 元誤會
 *  - 報酬率以 -1~∞ 比例存(0.155 = 15.5%),DB 是 numeric(8,4),可容 9999%
 *  - daily_return = (current - previousClose) / previousClose;沒 prev → 0
 *  - 沒持倉(全 sold) → 該 user 的所有 summary row 都 delete 掉
 *
 *  失敗只 console.warn,不擋主流程。
 */
export async function syncMyPortfolio(): Promise<{ ok: boolean }> {
  if (!isCloudConfigured) return { ok: false };
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false };

  const [holdings, prices, stocks] = await Promise.all([
    db.holdings.toArray(),
    db.prices.toArray(),
    db.stocks.toArray()
  ]);

  const priceMap = new Map(prices.map((p) => [p.code, p]));
  const stockMap = new Map(stocks.map((s) => [s.code, s]));

  if (holdings.length === 0) {
    // 全賣光 → 清空雲端 row
    const { error } = await supabase.from('user_portfolio_summary').delete().eq('user_id', userId);
    if (error) console.warn('[portfolioSync] delete-all:', error.message);
    return { ok: !error };
  }

  // 算總市值(分母)
  let totalValue = 0;
  for (const h of holdings) {
    const p = priceMap.get(h.code);
    totalValue += (p?.currentPrice ?? h.avgCost) * h.shares;
  }

  const rows: Omit<PortfolioSummaryRow, 'updated_at'>[] = holdings.map((h) => {
    const p = priceMap.get(h.code);
    const stock = stockMap.get(h.code);
    const currentValue = (p?.currentPrice ?? h.avgCost) * h.shares;
    const unrealized = currentValue - h.totalCost;
    const returnPct = h.totalCost > 0 ? unrealized / h.totalCost : 0;
    const dailyPct =
      p && p.previousClose > 0 ? (p.currentPrice - p.previousClose) / p.previousClose : 0;
    const weight = totalValue > 0 ? (currentValue / totalValue) * 100 : 0;
    return {
      user_id: userId,
      stock_code: h.code,
      stock_name: stock?.name ?? h.code,
      portfolio_weight: Math.round(weight * 100) / 100,
      invested_amount: Math.round(h.totalCost),
      current_value: Math.round(currentValue),
      unrealized_pnl: Math.round(unrealized),
      return_percent: clamp(returnPct, -999.9999, 999.9999),
      daily_return_percent: clamp(dailyPct, -999.9999, 999.9999)
    };
  });

  // upsert(stock 數量通常 < 30,單 query OK)
  const { error: upsertErr } = await supabase
    .from('user_portfolio_summary')
    .upsert(rows, { onConflict: 'user_id,stock_code' });
  if (upsertErr) {
    console.warn('[portfolioSync] upsert:', upsertErr.message);
    return { ok: false };
  }

  // 清掉「雲端有但本地已賣光」的 stale row
  const localCodes = new Set(rows.map((r) => r.stock_code));
  const { data: existing } = await supabase
    .from('user_portfolio_summary')
    .select('stock_code')
    .eq('user_id', userId);
  const staleCodes = (existing ?? [])
    .map((r) => (r as { stock_code: string }).stock_code)
    .filter((c) => !localCodes.has(c));
  if (staleCodes.length > 0) {
    const { error: delErr } = await supabase
      .from('user_portfolio_summary')
      .delete()
      .eq('user_id', userId)
      .in('stock_code', staleCodes);
    if (delErr) console.warn('[portfolioSync] delete stale:', delErr.message);
  }

  return { ok: true };
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(min, n));
}

/**
 * 撈好友持倉(已套用對方隱私遮罩)。
 *  - 自己呼叫 with own userId 也可,會走 'full' 顯示
 *  - 對方 portfolio_amount_visibility='hidden' → 金額全 '---' 但仍給 weight
 *  - show_daily_return / show_total_return = false → 該欄位 null
 */
export async function getFriendPortfolio(userId: string): Promise<FriendPortfolioItem[]> {
  if (!isCloudConfigured) return [];

  const [{ data: rows, error }, privacy] = await Promise.all([
    supabase.from('user_portfolio_summary').select('*').eq('user_id', userId),
    getFriendPrivacy(userId)
  ]);
  if (error || !rows) {
    if (error) console.warn('[portfolioSync] getFriendPortfolio:', error.message);
    return [];
  }
  const visibility = privacy?.portfolioAmountVisibility ?? 'hidden';
  const showDaily = privacy?.showDailyReturn ?? true;
  const showTotal = privacy?.showTotalReturn ?? true;

  return (rows as PortfolioSummaryRow[]).map(rowToItem).map((it) => ({
    stockCode: it.stockCode,
    stockName: it.stockName,
    portfolioWeight: it.portfolioWeight,
    investedAmountText: maskAmount(it.investedAmount, visibility),
    currentValueText: maskAmount(it.currentValue, visibility),
    unrealizedPnlText: maskAmount(it.unrealizedPnl, visibility),
    returnPercent: showTotal ? it.returnPercent : null,
    dailyReturnPercent: showDaily ? it.dailyReturnPercent : null
  }));
}

export const _internal = {
  rowToItem,
  syncMyPortfolio
};
