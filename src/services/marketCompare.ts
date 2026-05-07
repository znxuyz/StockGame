/**
 * 把 portfolio 累積報酬率 跟 加權指數 對齊到同一個 baseline,輸出 chart-ready 資料。
 *
 * 邏輯:
 *  1. 從 daily snapshots 拿你的「總市值 / 累積投入」歷史(snapshots 服務每天記錄一筆)
 *  2. 從 marketIndices 拿同期 TAIEX 收盤
 *  3. baseline = 第一個有 snapshot 的那天
 *  4. 從 baseline 起算每天的 % 變化:
 *     - 你的 = (totalMarketValue - totalCost) / totalCost(累積報酬率)
 *     - 大盤 = (TAIEX_today - TAIEX_baseline) / TAIEX_baseline
 *  5. Alpha = 你的最新 - 大盤最新
 *
 * 注意:
 *  - 沒 snapshot 或沒 TAIEX 資料就回空陣列 + alpha = null
 *  - snapshot 缺日(沒進 app 那幾天沒紀錄)會在 chart 上斷線,UI 用 LineChart 連線會自動跳
 *  - 只比 90 天內(再前面的趨勢用戶看不到也不太關心)
 */

import { db } from '@/db';

export interface MarketCompareDataPoint {
  /** YYYY-MM-DD */
  date: string;
  /** 你的累積報酬率(%,帶正負號) */
  portfolioPct: number;
  /** 大盤累積報酬率(%,帶正負號) */
  taiexPct: number;
}

export interface MarketCompareResult {
  data: MarketCompareDataPoint[];
  /** 最新 alpha = portfolio - taiex(% 點數) */
  alpha: number | null;
  /** baseline 那天 */
  baselineDate: string | null;
  /** 你最新累積報酬率 */
  portfolioLatestPct: number | null;
  /** 大盤最新累積報酬率 */
  taiexLatestPct: number | null;
}

/**
 * @param days 比較範圍(預設 90 天,從今天往前算)
 */
export async function getMarketCompare(days: number = 90): Promise<MarketCompareResult> {
  const cutoff = daysAgoYMD(days);

  // 拿同範圍內的 snapshots(以 date 升冪)
  const snapshots = await db.snapshots.where('date').aboveOrEqual(cutoff).sortBy('date');
  const taiex = await db.marketIndices
    .where('[symbol+date]')
    .between(['TAIEX', cutoff], ['TAIEX', '9999-99-99'], true, true)
    .sortBy('date');

  if (snapshots.length === 0 || taiex.length === 0) {
    return {
      data: [],
      alpha: null,
      baselineDate: null,
      portfolioLatestPct: null,
      taiexLatestPct: null
    };
  }

  // baseline = 同時有 snapshot 與 TAIEX 的最早那天
  const taiexByDate = new Map(taiex.map((t) => [t.date, t.close]));
  const snapshotByDate = new Map(snapshots.map((s) => [s.date, s]));

  let baselineDate: string | null = null;
  let baselineSnap = null;
  let baselineTaiex = 0;
  for (const s of snapshots) {
    const t = taiexByDate.get(s.date);
    if (t == null) continue;
    if (s.totalCost <= 0) continue; // 沒投入金額沒法算報酬率
    baselineDate = s.date;
    baselineSnap = s;
    baselineTaiex = t;
    break;
  }

  if (!baselineDate || !baselineSnap || baselineTaiex === 0) {
    return {
      data: [],
      alpha: null,
      baselineDate: null,
      portfolioLatestPct: null,
      taiexLatestPct: null
    };
  }

  // 算 baseline 那天的 portfolio 累積報酬率(基準點)— 之後每天減這個
  // 但更直觀:我們每天獨立算「那天的累積報酬率」(snapshot 自己有 cost / value),
  // 然後跟 baseline 那天比也行。
  // 簡化:每天算「(value - cost) / cost」,baseline 那天可能不是 0,就減去 baseline pct。
  const basePortfolioPct = (baselineSnap.totalMarketValue - baselineSnap.totalCost) / baselineSnap.totalCost;

  // 收集所有有資料的日期(snapshot ∪ taiex 都有)
  const dates = Array.from(new Set([...snapshots.map((s) => s.date), ...taiex.map((t) => t.date)]))
    .filter((d) => d >= baselineDate!)
    .sort();

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
    if (t != null) {
      lastTaiexPct = ((t - baselineTaiex) / baselineTaiex) * 100;
    }
    out.push({
      date,
      portfolioPct: lastPortfolioPct,
      taiexPct: lastTaiexPct
    });
  }

  const last = out[out.length - 1];
  return {
    data: out,
    alpha: last ? last.portfolioPct - last.taiexPct : null,
    baselineDate,
    portfolioLatestPct: last?.portfolioPct ?? null,
    taiexLatestPct: last?.taiexPct ?? null
  };
}

/** 今天往前 N 天的 YYYY-MM-DD(台北時區) */
function daysAgoYMD(days: number): string {
  const past = new Date(Date.now() - days * 86_400_000);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return fmt.format(past); // YYYY-MM-DD
}
