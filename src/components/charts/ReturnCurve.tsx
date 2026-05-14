import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { formatPercent } from '@/utils';

/**
 * 累積報酬率折線圖。
 *
 * 來源:snapshots 表(階段 5G 已從第一筆交易日補登歷史 snapshot)。
 * 沒有歷史價來源,backfill 的歷史日 returnRate 只反映已實現損益,
 * 未實現損益要等 daily snapshot 跑滿幾天才會看出真實走勢。
 *
 * 範圍切換 [7天][30天][90天][全部]:
 *  - 從 snapshots 篩出該範圍內的日;預設「全部」反映完整持有歷史
 *  - 超過 60 筆每隔 N 取一筆(避免線太密)
 */
type Range = '7' | '30' | '90' | 'all';

const RANGE_DAYS: Record<Range, number | null> = {
  '7': 7,
  '30': 30,
  '90': 90,
  all: null
};

const RANGE_LABEL: Record<Range, string> = {
  '7': '7 天',
  '30': '30 天',
  '90': '90 天',
  all: '全部'
};

export default function ReturnCurve() {
  const snapshots = useLiveQuery(() => db.snapshots.orderBy('date').toArray(), []);
  const [range, setRange] = useState<Range>('all');

  const filtered = useMemo(() => {
    if (!snapshots) return [];
    const days = RANGE_DAYS[range];
    if (days === null) return snapshots;
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    return snapshots.filter((s) => s.date >= cutoff);
  }, [snapshots, range]);

  if (!snapshots || snapshots.length === 0) {
    return <Empty msg="還沒有歷史快照(每次刷新股價會記一筆)" />;
  }

  // 抽樣:超過 60 筆每隔 N 取一筆
  const stride = Math.max(1, Math.floor(filtered.length / 60));
  const sampled = filtered.filter((_, i) => i % stride === 0);

  const data = sampled.map((s) => ({
    date: s.date.slice(5), // 顯示 MM-DD 即可
    rate: s.returnRate * 100
  }));

  return (
    <div className="data-card p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-bold">📈 累積報酬率</h4>
        <div className="flex gap-1">
          {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors ${
                range === r
                  ? 'bg-mythic-jade-100 text-mythic-jade-700'
                  : 'bg-white/40 text-gray-500'
              }`}
            >
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
      </div>
      {data.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4">
          此範圍內沒有快照(往前選看看)
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => `${v.toFixed(0)}%`}
              domain={['dataMin', 'dataMax']}
            />
            <Tooltip
              formatter={(v: number) => formatPercent(v / 100)}
              labelFormatter={(l) => `日期 ${l}`}
            />
            <Line
              type="monotone"
              dataKey="rate"
              stroke="#e23b3b"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
      <p className="text-xs text-gray-500 text-center mt-1">
        以累積投入成本為基準 · 共 {filtered.length} 筆 / 總 {snapshots.length} 筆
      </p>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="data-card p-3">
      <p className="text-xs text-gray-400 text-center py-6">{msg}</p>
    </div>
  );
}
