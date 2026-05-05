import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { formatPercent } from '@/utils';

/**
 * 累積報酬率折線圖。
 * 資料來源：snapshots 表，每日一筆。
 * 30 天以內顯示日線，30 天以上每週取樣（避免太密）。
 */
export default function ReturnCurve() {
  const snapshots = useLiveQuery(() => db.snapshots.orderBy('date').toArray(), []);

  if (!snapshots || snapshots.length === 0) {
    return <Empty msg="還沒有歷史快照（每次刷新股價會記一筆）" />;
  }

  // 抽樣：超過 60 筆每隔 N 取一筆
  const stride = Math.max(1, Math.floor(snapshots.length / 60));
  const sampled = snapshots.filter((_, i) => i % stride === 0);

  const data = sampled.map((s) => ({
    date: s.date.slice(5), // 顯示 MM-DD 即可
    rate: s.returnRate * 100
  }));

  return (
    <div className="bg-white rounded-lg p-3 border border-gray-200">
      <h4 className="text-sm font-bold mb-2">📈 累積報酬率</h4>
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
      <p className="text-xs text-gray-500 text-center mt-1">
        以累積投入成本為基準
      </p>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="bg-white rounded-lg p-3 border border-gray-200">
      <p className="text-xs text-gray-400 text-center py-6">{msg}</p>
    </div>
  );
}
