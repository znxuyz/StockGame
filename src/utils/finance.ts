/**
 * 進階財務指標：年化報酬率（IRR / XIRR）、夏普比率、最大回撤。
 *
 * 都是純計算，不依賴 DB。資料不足時回傳 null 讓 UI 顯示「資料不足」。
 */

export interface CashFlow {
  /** 流入正、流出負（從投資人視角）— 買入為負、賣出為正、當前市值為正 */
  amount: number;
  /** 發生時間（unix millis） */
  timestamp: number;
}

/**
 * XIRR：不規則時間區間的年化報酬率。Newton-Raphson 求解。
 * 失敗（無解 / 流量全同向）時回 null。
 */
export function computeXIRR(cashflows: CashFlow[], guess = 0.1): number | null {
  if (cashflows.length < 2) return null;
  const sorted = [...cashflows].sort((a, b) => a.timestamp - b.timestamp);
  const hasPositive = sorted.some((c) => c.amount > 0);
  const hasNegative = sorted.some((c) => c.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  const t0 = sorted[0].timestamp;
  const dt = (ts: number) => (ts - t0) / 86_400_000 / 365;

  const npv = (rate: number) =>
    sorted.reduce((sum, c) => sum + c.amount / Math.pow(1 + rate, dt(c.timestamp)), 0);

  const dnpv = (rate: number) =>
    sorted.reduce(
      (sum, c) => sum - (dt(c.timestamp) * c.amount) / Math.pow(1 + rate, dt(c.timestamp) + 1),
      0
    );

  let rate = guess;
  for (let i = 0; i < 100; i++) {
    const f = npv(rate);
    if (Math.abs(f) < 1e-7) return rate;
    const df = dnpv(rate);
    if (df === 0) return null;
    const next = rate - f / df;
    if (!Number.isFinite(next)) return null;
    if (next <= -1) {
      // 避免跨越 -100% 邊界導致發散
      rate = (rate - 1) / 2;
      continue;
    }
    if (Math.abs(next - rate) < 1e-9) return next;
    rate = next;
  }
  return null;
}

/**
 * 夏普比率（年化）。
 *  - 從每日報酬序列算平均、標準差，乘 sqrt(252) 年化
 *  - rfRate 為年化無風險利率，預設 0（台灣定存約 1.5%，使用者要的話再加）
 */
export function computeSharpe(dailyReturns: number[], rfRate = 0): number | null {
  if (dailyReturns.length < 5) return null;
  const dailyRf = rfRate / 252;
  const excess = dailyReturns.map((r) => r - dailyRf);
  const mean = excess.reduce((s, v) => s + v, 0) / excess.length;
  const variance = excess.reduce((s, v) => s + (v - mean) ** 2, 0) / excess.length;
  const std = Math.sqrt(variance);
  if (std === 0) return null;
  return (mean / std) * Math.sqrt(252);
}

/**
 * 最大回撤（從歷史 totalMarketValue 序列算）。
 * 回傳 0~1（0.25 = 最大回撤 25%）。
 */
export function computeMaxDrawdown(equityCurve: number[]): number | null {
  if (equityCurve.length < 2) return null;
  let peak = equityCurve[0];
  let maxDD = 0;
  for (const v of equityCurve) {
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = (peak - v) / peak;
      if (dd > maxDD) maxDD = dd;
    }
  }
  return maxDD;
}

/**
 * 從 snapshot 序列算每日報酬率：
 *  rate(today) = (totalMarketValue + accRealized - prevTotalCost) / prevTotalCost - 1
 *
 * 簡化版：直接用 (today.totalPnL - prev.totalPnL) / prev.totalCost
 * 不適合有大筆現金注入的日子（會造成假報酬），但 MVP 接受誤差。
 */
export function computeDailyReturns(
  snapshots: Array<{ totalPnL: number; totalCost: number; totalMarketValue: number }>
): number[] {
  const out: number[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const cur = snapshots[i];
    if (prev.totalCost <= 0) continue;
    const r = (cur.totalPnL - prev.totalPnL) / prev.totalCost;
    if (Number.isFinite(r)) out.push(r);
  }
  return out;
}
