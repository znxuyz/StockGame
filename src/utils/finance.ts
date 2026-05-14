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

/** Sharpe 樣本門檻 — UI 顯示「資料不足(N/30 天)」用 */
export const SHARPE_MIN_SAMPLES = 30;

/** Sharpe 異常警語門檻 — |sharpe| 超過 → 多半是現金注入扭曲,UI 顯示 ⚠️ */
export const SHARPE_UNRELIABLE_THRESHOLD = 5;

/**
 * 夏普比率（年化）。
 *  - 從每日報酬序列算平均、標準差，乘 sqrt(252) 年化
 *  - rfRate 為年化無風險利率，預設 0（台灣定存約 1.5%，使用者要的話再加）
 *  - **改版**:最少樣本提高到 30 天(原本 5 天太少,單日異常會洗結果)
 */
export function computeSharpe(dailyReturns: number[], rfRate = 0): number | null {
  if (dailyReturns.length < SHARPE_MIN_SAMPLES) return null;
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
 * 從 snapshot 序列算每日報酬率。
 *
 *  - 基本式:(today.totalPnL - prev.totalPnL) / prev.totalCost
 *  - **改版**:排除現金注入日(totalCost 變動 > 1%)以避免買入 / 賣出當日
 *    被誤算成假報酬
 *      買入日:totalCost 上升 → 即使 totalMarketValue 也跟著漲,
 *        totalPnL 可能不動(unrealized 不變)→ 看起來「停滯」拉低 mean
 *      賣出日:totalCost 下降 → realizedPnL 跳升 → totalPnL 跳升 →
 *        看起來「暴漲」推高 mean,std 也跟著跳
 *      → 兩種扭曲都讓夏普比率失真;直接 skip 該日才乾淨
 */
export function computeDailyReturns(
  snapshots: Array<{ totalPnL: number; totalCost: number; totalMarketValue: number }>
): number[] {
  const out: number[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const cur = snapshots[i];
    if (prev.totalCost <= 0) continue;
    // 現金注入日偵測:totalCost 變動 > 1% 視為買賣日,跳過
    const costChange = Math.abs(cur.totalCost - prev.totalCost);
    if (costChange / prev.totalCost > 0.01) continue;
    const r = (cur.totalPnL - prev.totalPnL) / prev.totalCost;
    if (Number.isFinite(r)) out.push(r);
  }
  return out;
}

/**
 * 偵測歷史 snapshot 是否有「真實的市值資料」可供 TWR 使用。
 *
 * 背景:`snapshotBackfill` 在沒歷史收盤價時,會用
 *   `totalMarketValue = totalCost + realizedPnL`
 * 當保守 proxy。這種 proxy snapshot 算出來的 TWR 等於累積已實現報酬率,
 * 完全失去 TWR 的意義(無法看「持倉本身的漲跌」)。
 *
 * 任一歷史 snapshot 的 totalMarketValue 跟 proxy 公式差超過 1 元 → 認定有真實價,
 * TWR 可算;否則 caller 應走 fallback(顯示絕對報酬 +「歷史價載入中」)。
 */
export function snapshotsHaveRealPrices(
  snapshots: Array<{ date: string; totalMarketValue: number; totalCost: number; realizedPnL: number }>,
  todayDate: string
): boolean {
  const historical = snapshots.filter((s) => s.date !== todayDate);
  if (historical.length === 0) return false;
  return historical.some(
    (s) => Math.abs(s.totalMarketValue - (s.totalCost + s.realizedPnL)) >= 1
  );
}

/**
 * TWR(時間加權報酬率)— 排除加碼/賣出時機影響的純粹績效。
 *
 * 演算法:把每次有現金流的日子當切點,各段算 R_i 連乘 -1
 *   R_i = (期末市值 - 期初市值 - 期間流入) / 期初市值
 *
 *   - 期初/期末市值:用 snapshot.totalMarketValue
 *   - 期間流入:該段結束日的 net cashflow(買/加碼為正,賣為負)
 *
 * 段:從第一筆交易日 D_0 開始 → [D_0, D_1] / [D_1, D_2] / ... / [D_{n-1}, today]
 * - 第一段 MV_start = snapshot[D_0]:已含 D_0 cashflow 注入,所以 cashflow_during
 *   只算邊界(D_{i+1}),D_0 那筆當作「投入起點」不計報酬
 * - 最後一段 MV_end = 今天的 totalMarketValue(summary.totalMarketValue);
 *   `nowMarketValue` caller 傳進來
 *
 * 任何一段資料缺 / MV_start <= 0 → 整段 skip(其他段繼續)。
 * 全部段都 skip → 回 null。
 *
 * Caller 應先用 `snapshotsHaveRealPrices` 確認有真實價,否則結果無意義。
 */
export interface TwrCashflow {
  /** YYYY-MM-DD 該日 net cashflow:買/加碼正、賣負 */
  date: string;
  /** 從投資人錢包流入「持倉市值」的金額(賣出為負) */
  netInflow: number;
}

export function computeTWR(
  snapshotsByDate: Map<string, { totalMarketValue: number }>,
  cashflowsByDate: TwrCashflow[],
  nowMarketValue: number,
  todayDate: string
): number | null {
  const sorted = [...cashflowsByDate].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return null;

  // 段邊界:cashflow 日 + 今天
  const boundaries = sorted.map((c) => c.date);
  if (boundaries[boundaries.length - 1] !== todayDate) {
    boundaries.push(todayDate);
  }

  let cumulative = 1;
  let segmentsApplied = 0;

  for (let i = 0; i + 1 < boundaries.length; i++) {
    const startDate = boundaries[i];
    const endDate = boundaries[i + 1];
    const startSnap = snapshotsByDate.get(startDate);
    if (!startSnap || startSnap.totalMarketValue <= 0) continue;

    // MV_end 邏輯:
    //   - 邊界是今天 → 用 nowMarketValue
    //   - 否則用 snapshot[endDate].totalMarketValue
    let endMV: number;
    if (endDate === todayDate) {
      endMV = nowMarketValue;
    } else {
      const endSnap = snapshotsByDate.get(endDate);
      if (!endSnap) continue;
      endMV = endSnap.totalMarketValue;
    }

    // 期間流入 = 邊界終點日的 cashflow(段尾)
    const flowAtEnd = sorted.find((c) => c.date === endDate)?.netInflow ?? 0;

    const r = (endMV - startSnap.totalMarketValue - flowAtEnd) / startSnap.totalMarketValue;
    if (!Number.isFinite(r)) continue;

    cumulative *= 1 + r;
    segmentsApplied++;
  }

  if (segmentsApplied === 0) return null;
  return cumulative - 1;
}
