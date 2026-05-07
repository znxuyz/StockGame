import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { ensureTaiexHistory, getMarketCompare, type MarketCompareResult } from '@/services';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { formatPercent } from '@/utils';

/**
 * 你的累積報酬率 vs 加權指數累積報酬率,90 天範圍。
 *
 *  - 第一次 mount 時跑 ensureTaiexHistory(90) 把缺的月份補齊
 *  - 用 useLiveQuery 訂閱 snapshots / marketIndices,有變動就重算對比
 *  - Alpha 顯示在頂部:正 = 跑贏大盤,負 = 跑輸
 */
export default function MarketCompareChart() {
  const [result, setResult] = useState<MarketCompareResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // 訂閱兩張表,任一有變動就重算
  const snapshots = useLiveQuery(() => db.snapshots.toArray(), []);
  const indices = useLiveQuery(() => db.marketIndices.toArray(), []);

  // 第一次 mount 跑 ensureTaiexHistory(只跑一次)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await ensureTaiexHistory(90);
      if (cancelled) return;
      if (r.error) setHistoryError(r.error);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // snapshots / indices 變動 → 重算對比
  useEffect(() => {
    if (!snapshots || !indices) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const r = await getMarketCompare(90);
      if (cancelled) return;
      setResult(r);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [snapshots, indices]);

  if (loading || !result) {
    return (
      <div className="bg-white rounded-lg p-3 border border-gray-200">
        <p className="text-xs text-gray-400 text-center py-6">大盤對比載入中⋯</p>
      </div>
    );
  }

  if (result.data.length === 0) {
    return (
      <div className="bg-white rounded-lg p-3 border border-gray-200">
        <h4 className="text-sm font-bold mb-2">📊 跟大盤比</h4>
        <p className="text-xs text-gray-500 text-center py-6">
          {historyError
            ? `加權指數歷史抓取失敗:${historyError}`
            : '需要至少一天有 snapshot + 加權指數收盤,稍後再回來看(每次刷新股價會記一筆)'}
        </p>
      </div>
    );
  }

  const chartData = result.data.map((d) => ({
    date: d.date.slice(5), // MM-DD
    you: Number(d.portfolioPct.toFixed(2)),
    taiex: Number(d.taiexPct.toFixed(2))
  }));

  const alphaText = result.alpha != null ? formatPercent(result.alpha / 100, true) : '-';
  const alphaColor =
    result.alpha != null
      ? result.alpha >= 0
        ? 'text-tw-up'
        : 'text-tw-down'
      : 'text-gray-500';

  return (
    <div className="bg-white rounded-lg p-3 border border-gray-200">
      <h4 className="text-sm font-bold mb-2">📊 跟大盤比(90 天)</h4>

      {/* Alpha 摘要 */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs mb-2">
        <div className="bg-rose-50 rounded p-2 border border-rose-100">
          <div className="text-gray-500">你的累積</div>
          <div
            className={`font-bold ${result.portfolioLatestPct != null && result.portfolioLatestPct >= 0 ? 'text-tw-up' : 'text-tw-down'}`}
          >
            {result.portfolioLatestPct != null
              ? formatPercent(result.portfolioLatestPct / 100, true)
              : '-'}
          </div>
        </div>
        <div className="bg-blue-50 rounded p-2 border border-blue-100">
          <div className="text-gray-500">加權指數</div>
          <div
            className={`font-bold ${result.taiexLatestPct != null && result.taiexLatestPct >= 0 ? 'text-tw-up' : 'text-tw-down'}`}
          >
            {result.taiexLatestPct != null
              ? formatPercent(result.taiexLatestPct / 100, true)
              : '-'}
          </div>
        </div>
        <div className="bg-amber-50 rounded p-2 border border-amber-100">
          <div className="text-gray-500">Alpha</div>
          <div className={`font-bold ${alphaColor}`}>{alphaText}</div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => `${v.toFixed(0)}%`}
            domain={['auto', 'auto']}
          />
          <Tooltip
            formatter={(v: number, name: string) => [`${v.toFixed(2)}%`, name]}
            labelFormatter={(l) => `日期 ${l}`}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line
            type="monotone"
            dataKey="you"
            name="你的"
            stroke="#e23b3b"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="taiex"
            name="加權指數"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>

      <p className="text-[11px] text-gray-500 text-center mt-1">
        baseline = 第一次有 snapshot + 大盤收盤的那天 · Alpha 為正代表跑贏大盤
      </p>
    </div>
  );
}
