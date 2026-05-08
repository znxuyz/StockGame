import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell } from 'recharts';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { formatInt, formatSigned } from '@/utils';

/**
 * 月度損益柱狀圖。
 * 來源：snapshots 表，每月取最後一筆 totalPnL 為當月結算，
 *       本月 PnL = thisMonth.totalPnL - lastMonth.totalPnL
 */
export default function MonthlyPnL() {
  const snapshots = useLiveQuery(() => db.snapshots.orderBy('date').toArray(), []);

  if (!snapshots || snapshots.length < 2) {
    return (
      <div className="data-card p-3">
        <h4 className="text-sm font-bold mb-2">📊 月度損益</h4>
        <p className="text-xs text-gray-400 text-center py-4">至少需要兩個月的快照</p>
      </div>
    );
  }

  // 取每月最後一筆
  const lastByMonth = new Map<string, (typeof snapshots)[number]>();
  for (const s of snapshots) {
    lastByMonth.set(s.date.slice(0, 7), s);
  }
  const months = [...lastByMonth.entries()].sort();

  const data: { month: string; pnl: number }[] = [];
  for (let i = 1; i < months.length; i++) {
    const [month, snap] = months[i];
    const prev = months[i - 1][1];
    data.push({ month: month.slice(2), pnl: snap.totalPnL - prev.totalPnL });
  }
  // 只顯示最近 12 個月
  const recent = data.slice(-12);

  return (
    <div className="data-card p-3">
      <h4 className="text-sm font-bold mb-2">📊 月度損益</h4>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={recent} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatInt(Math.round(v))} />
          <Tooltip formatter={(v: number) => formatSigned(v)} labelFormatter={(l) => `月份 ${l}`} />
          <Bar dataKey="pnl">
            {recent.map((d, i) => (
              <Cell key={i} fill={d.pnl >= 0 ? '#e23b3b' : '#1f9e4a'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
