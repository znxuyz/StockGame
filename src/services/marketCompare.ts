/**
 * 把 portfolio 累積報酬率 跟 加權指數 對齊到同一個 baseline,輸出 chart-ready 資料。
 *
 * **baseline = 第一筆 buy 交易的日期**(階段 6.X):
 *  - 從那天的 portfolio 累積報酬率(若有 snapshot)+ TAIEX 收盤算「Day 0 = 0%」
 *  - TAIEX 那天若是假日 / 沒收盤 → 用最近的前一個交易日收盤值當基準
 *  - x 軸:從第一筆 buy 那天 → 今天(不再限 90 天)
 *
 * 邏輯:
 *  1. 找 db.transactions 內 type='buy' 最早一筆,timestamp → 台北時區 YYYY-MM-DD
 *  2. TAIEX baseline:db.marketIndices 找 baselineDate 當天或之前最近的 close
 *  3. snapshots / marketIndices 取 baselineDate 起 → 今天的子集
 *  4. 每天獨立算「該天累積報酬率」(snap.totalMarketValue / snap.totalCost - 1),
 *     減去 baseline 那天的 pct → baseline 點 = 0%。snapshot 缺日就 carry-forward
 *  5. TAIEX 同理:(t.close - baselineTaiex) / baselineTaiex
 *  6. Alpha = 最新 portfolio - 最新 TAIEX
 *
 * 空狀態:
 *  - 沒任何 buy 交易 → `noBuy: true`(UI 顯示「完成首筆買入後可查看大盤對比」)
 *  - 有 buy 但 TAIEX 完全沒資料(CORS / 未抓)→ 仍輸出 portfolio 線,
 *    `taiexLatestPct: null` + `alpha: null`(UI 折線只畫一條)
 */

import { db } from '@/db';

export interface MarketCompareDataPoint {
  /** YYYY-MM-DD */
  date: string;
  /** 你的累積報酬率(%,帶正負號) */
  portfolioPct: number;
  /** 大盤累積報酬率(%,帶正負號;TAIEX 缺資料時 0) */
  taiexPct: number;
}

export interface MarketCompareResult {
  data: MarketCompareDataPoint[];
  /** 最新 alpha = portfolio - taiex(% 點數);TAIEX 缺資料時 null */
  alpha: number | null;
  /** baseline 那天(第一筆 buy 交易日,YYYY-MM-DD) */
  baselineDate: string | null;
  /** 你最新累積報酬率 */
  portfolioLatestPct: number | null;
  /** 大盤最新累積報酬率;TAIEX 缺資料時 null */
  taiexLatestPct: number | null;
  /** 玩家還沒任何 buy 交易 → UI 顯示空狀態 */
  noBuy: boolean;
  /** 有 buy 但 TAIEX 完全沒拿到(CORS / 未抓 / circuit-break)→ UI 只畫 portfolio 線 */
  noTaiex: boolean;
}

const EMPTY_RESULT: MarketCompareResult = {
  data: [],
  alpha: null,
  baselineDate: null,
  portfolioLatestPct: null,
  taiexLatestPct: null,
  noBuy: false,
  noTaiex: false
};

/** unix ms → 台北時區 YYYY-MM-DD */
function toTaipeiYMD(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(ms));
}

/**
 * 找 `date` 當天或之前最近的 TAIEX close。
 * 第一筆 buy 落在假日 / 開戶當天沒收盤時,fallback 抓前一個交易日。
 *
 * 用 Dexie reverse iteration on [symbol+date] index 取最大者 ≤ date。
 * 整張 TAIEX 表完全空時 → null。
 */
async function findClosestTaiexAtOrBefore(date: string): Promise<{ date: string; close: number } | null> {
  const row = await db.marketIndices
    .where('[symbol+date]')
    .between(['TAIEX', '0000-00-00'], ['TAIEX', date], true, true)
    .reverse()
    .first();
  if (!row) return null;
  return { date: row.date, close: row.close };
}

export async function getMarketCompare(): Promise<MarketCompareResult> {
  // 1. baseline = 第一筆 buy 交易的台北日期
  // type='buy' 用 where 索引拉,timestamp 取最小
  const buys = await db.transactions.where('type').equals('buy').toArray();
  if (buys.length === 0) {
    return { ...EMPTY_RESULT, noBuy: true };
  }
  const firstBuyTs = Math.min(...buys.map((t) => t.timestamp));
  const baselineDate = toTaipeiYMD(firstBuyTs);

  // 2. TAIEX baseline(當天或前最近交易日)
  const baselineTaiex = await findClosestTaiexAtOrBefore(baselineDate);

  // 3. snapshots / TAIEX 從 baselineDate 起
  const snapshots = await db.snapshots.where('date').aboveOrEqual(baselineDate).sortBy('date');
  const taiex = await db.marketIndices
    .where('[symbol+date]')
    .between(['TAIEX', baselineDate], ['TAIEX', '9999-99-99'], true, true)
    .sortBy('date');

  const snapshotByDate = new Map(snapshots.map((s) => [s.date, s]));
  const taiexByDate = new Map(taiex.map((t) => [t.date, t.close]));

  // 4. baseline 那天的 portfolio pct(若有 snapshot)— 之後每天減這個讓 baseline = 0
  // 沒 snapshot 就 0(approximation:第一筆 buy 當天 PnL 接近 0,可接受)
  const baselineSnap = snapshotByDate.get(baselineDate);
  const basePortfolioPct =
    baselineSnap && baselineSnap.totalCost > 0
      ? (baselineSnap.totalMarketValue - baselineSnap.totalCost) / baselineSnap.totalCost
      : 0;

  // 5. union 日期(snapshot ∪ TAIEX),從 baselineDate 起,排序
  const dateSet = new Set<string>([baselineDate]); // 確保 baseline 那天一定有點
  for (const s of snapshots) dateSet.add(s.date);
  for (const t of taiex) dateSet.add(t.date);
  const dates = [...dateSet].filter((d) => d >= baselineDate).sort();

  const out: MarketCompareDataPoint[] = [];
  let lastPortfolioPct = 0;
  let lastTaiexPct = 0;
  for (const date of dates) {
    const snap = snapshotByDate.get(date);
    const t = taiexByDate.get(date);
    if (snap && snap.totalCost > 0) {
      const pct = (snap.totalMarketValue - snap.totalCost) / snap.totalCost;
      lastPortfolioPct = (pct - basePortfolioPct) * 100;
    }
    if (t != null && baselineTaiex != null && baselineTaiex.close > 0) {
      lastTaiexPct = ((t - baselineTaiex.close) / baselineTaiex.close) * 100;
    }
    out.push({
      date,
      portfolioPct: lastPortfolioPct,
      taiexPct: lastTaiexPct
    });
  }

  const last = out[out.length - 1];
  const noTaiex = baselineTaiex == null;
  return {
    data: out,
    alpha: last && !noTaiex ? last.portfolioPct - last.taiexPct : null,
    baselineDate,
    portfolioLatestPct: last?.portfolioPct ?? null,
    taiexLatestPct: last && !noTaiex ? last.taiexPct : null,
    noBuy: false,
    noTaiex
  };
}
