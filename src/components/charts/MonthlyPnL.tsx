import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { formatInt, formatSigned } from '@/utils';

/**
 * 月度損益折線圖。
 *
 * 來源:snapshots 表,每月取「該月最後一筆」+「該月最早一筆」
 *      pnl[m] = lastSnapshotOfMonth[m].totalPnL - earliestSnapshotOfMonth[m].totalPnL
 *
 * 視覺(跟「累積報酬率」一致):
 *   - 單色實線(無 dot),smooth monotone
 *   - y=0 基準線:淺灰虛線,一眼看出該月是賺是賠
 *   - hover 才出 activeDot + tooltip(月份 / 損益,進行中標註)
 *
 * 一個月內只有 1 筆 snapshot → pnl=0(沒法算),仍渲染點顯示「持平」。
 */
interface MonthlyPoint {
  month: string;
  pnl: number;
  ongoing: boolean;
}

export default function MonthlyPnL() {
  const snapshots = useLiveQuery(() => db.snapshots.orderBy('date').toArray(), []);

  if (!snapshots || snapshots.length === 0) {
    return (
      <div className="data-card p-3">
        <h4 className="text-sm font-bold mb-2">📊 月度損益</h4>
        <p className="text-xs text-gray-400 text-center py-4">還沒有歷史快照</p>
      </div>
    );
  }

  // 每月取「最早 + 最晚」snapshot;snapshots 已 orderBy date 升序,
  // 第一次見到該月就記為 first,持續覆蓋 last
  const firstByMonth = new Map<string, (typeof snapshots)[number]>();
  const lastByMonth = new Map<string, (typeof snapshots)[number]>();
  for (const s of snapshots) {
    const m = s.date.slice(0, 7);
    if (!firstByMonth.has(m)) firstByMonth.set(m, s);
    lastByMonth.set(m, s);
  }
  const months = [...lastByMonth.keys()].sort();
  const todayMonth = new Date().toISOString().slice(0, 7);

  const data: MonthlyPoint[] = [];
  for (const m of months) {
    const first = firstByMonth.get(m)!;
    const last = lastByMonth.get(m)!;
    // 該月內 totalPnL 變動;只有 1 筆時 pnl=0(代表那天的 PnL 還沒成型)
    const pnl = last.totalPnL - first.totalPnL;
    data.push({
      month: m.slice(2),
      pnl,
      ongoing: m === todayMonth
    });
  }
  // 只顯示最近 12 個月
  const recent = data.slice(-12);

  return (
    <div className="data-card p-3">
      <h4 className="text-sm font-bold mb-2">📊 月度損益</h4>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={recent} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatInt(Math.round(v))} />
          {/* 零基準線:虛灰,一眼看出當月該點落在賺或賠側 */}
          <ReferenceLine y={0} stroke="#999" strokeDasharray="2 4" strokeWidth={1} />
          <Tooltip
            formatter={(v: number, _n, item) => {
              const ongoing = (item.payload as MonthlyPoint)?.ongoing;
              return [formatSigned(v) + (ongoing ? '(進行中)' : ''), '損益'];
            }}
            labelFormatter={(l) => `月份 ${l}`}
          />
          <Line
            type="monotone"
            dataKey="pnl"
            stroke="#e23b3b"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-[11px] text-gray-500 text-center mt-1">
        每月損益變動 · 最近 12 個月
      </p>
    </div>
  );
}
