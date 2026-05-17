import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  ReferenceLine
} from 'recharts';
import { ensureTaiexHistory, getMarketCompare, type MarketCompareResult } from '@/services';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { formatPercent } from '@/utils';

/**
 * 你的累積報酬率 vs 加權指數累積報酬率。
 *
 *  - **baseline = 第一筆 buy 交易日**(階段 6.X):自那天起算每天 %
 *  - 標題動態顯示「跟大盤比(自 YYYY-MM-DD 起,N 天)」
 *  - 第一次 mount 跑 ensureTaiexHistory 把缺的月份補齊
 *  - useLiveQuery 訂閱 transactions / snapshots / marketIndices,任一變動就重算
 *  - Alpha 顯示在頂部:正 = 跑贏大盤,負 = 跑輸;TAIEX 無資料時 Alpha = '-'
 */
export default function MarketCompareChart() {
  const [result, setResult] = useState<MarketCompareResult | null>(null);

  // 訂閱三張表(加 transactions — baseline 改靠它),任一有變動就重算
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const snapshots = useLiveQuery(() => db.snapshots.toArray(), []);
  const indices = useLiveQuery(() => db.marketIndices.toArray(), []);

  // 第一次 mount 跑 ensureTaiexHistory(只跑一次)
  // 失敗 / circuit-break 時不阻擋 chart 渲染 — service 會回 noTaiex:true
  useEffect(() => {
    void ensureTaiexHistory(90);
  }, []);

  // transactions / snapshots / indices 變動 → 重算對比
  // **不 setLoading(true)**:首次 result === null 顯示載入畫面;之後 deps 變動
  // 默默重算 + setResult,讓圖表直接平滑 update,**不再閃回 loading 畫面**
  // (上一版每次都閃,切 tab / Dexie 寫入都觸發,體驗很糟)
  useEffect(() => {
    if (!transactions || !snapshots || !indices) return;
    let cancelled = false;
    (async () => {
      const r = await getMarketCompare();
      if (cancelled) return;
      setResult(r);
    })();
    return () => {
      cancelled = true;
    };
  }, [transactions, snapshots, indices]);

  if (!result) {
    return (
      <div className="data-card p-3">
        <p className="text-xs text-gray-400 text-center py-6">大盤對比載入中⋯</p>
      </div>
    );
  }

  // 空狀態 1:還沒任何 buy 交易
  if (result.noBuy) {
    return (
      <div className="data-card p-3">
        <h4 className="text-sm font-bold mb-2">📊 跟大盤比</h4>
        <p className="text-xs text-gray-500 text-center py-6">
          尚無交易紀錄,完成首筆買入後可查看大盤對比
        </p>
      </div>
    );
  }

  // 空狀態 2:有 buy 但 baseline 之後還沒有任何 snapshot / TAIEX → data 空
  if (result.data.length === 0) {
    return (
      <div className="data-card p-3">
        <h4 className="text-sm font-bold mb-2">
          📊 跟大盤比{result.baselineDate ? `(自 ${result.baselineDate} 起)` : ''}
        </h4>
        <p className="text-xs text-gray-500 text-center py-6">
          {result.noTaiex
            ? '加權指數歷史暫時取不到,稍後再回來看(系統會自動補抓)'
            : '剛建立首筆交易,稍後刷新一次股價就會記第一筆 snapshot'}
        </p>
      </div>
    );
  }

  const chartData = result.data.map((d) => ({
    date: d.date.slice(5), // MM-DD
    you: Number(d.portfolioPct.toFixed(2)),
    // 沒 TAIEX 時把該欄位設成 null,recharts Line 自動斷線不畫
    taiex: result.noTaiex ? null : Number(d.taiexPct.toFixed(2))
  }));

  const alphaText = result.alpha != null ? formatPercent(result.alpha / 100, true) : '-';
  const alphaColor =
    result.alpha != null
      ? result.alpha >= 0
        ? 'text-tw-up'
        : 'text-tw-down'
      : 'text-gray-500';

  // 「N 天」label — 跨度(含頭尾)
  const spanDays = result.baselineDate
    ? Math.max(
        1,
        Math.round(
          (new Date(result.data[result.data.length - 1].date).getTime() -
            new Date(result.baselineDate).getTime()) /
            86_400_000
        ) + 1
      )
    : null;

  return (
    <div className="data-card p-3">
      <h4 className="text-sm font-bold mb-2">
        📊 跟大盤比{result.baselineDate ? `(自 ${result.baselineDate} 起 · ${spanDays} 天)` : ''}
      </h4>

      {/* Alpha 摘要 — 三色玻璃 pill */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs mb-2">
        <div className="stat-pill stat-pill-rose p-2">
          <div className="text-gray-600">你的累積</div>
          <div
            className={`font-bold ${result.portfolioLatestPct != null && result.portfolioLatestPct >= 0 ? 'text-tw-up' : 'text-tw-down'}`}
          >
            {result.portfolioLatestPct != null
              ? formatPercent(result.portfolioLatestPct / 100, true)
              : '-'}
          </div>
        </div>
        <div className="stat-pill stat-pill-blue p-2">
          <div className="text-gray-600">加權指數</div>
          <div
            className={`font-bold ${result.taiexLatestPct != null && result.taiexLatestPct >= 0 ? 'text-tw-up' : 'text-tw-down'}`}
          >
            {result.taiexLatestPct != null
              ? formatPercent(result.taiexLatestPct / 100, true)
              : '-'}
          </div>
        </div>
        <div className="stat-pill stat-pill-amber p-2">
          <div className="text-gray-600">Alpha</div>
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
          {/* baseline 0% 線:讓玩家一眼看出該日是跑贏 / 跑輸 baseline */}
          <ReferenceLine y={0} stroke="#999" strokeDasharray="2 4" strokeWidth={1} />
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
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>

      <p className="text-[11px] text-gray-500 text-center mt-1">
        {result.noTaiex
          ? '加權指數歷史暫無資料,只顯示你的累積線'
          : 'baseline = 第一筆 buy 那天 · Alpha 為正代表跑贏大盤'}
      </p>
    </div>
  );
}
