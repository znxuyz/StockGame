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
 * 視覺:
 *   - 折線本身:中性灰(stroke #999),把月份順序串起來看趨勢
 *   - 點顏色:盈利紅 / 虧損綠(台股慣例)
 *   - 當月(進行中)點:空心 — 白底 + 對應顏色粗邊,跟結算月的實心點視覺
 *     對比明顯,等同舊柱狀圖「虛線邊框」的進行中標記
 *   - y=0 基準線:淺灰虛線,一眼看出該月是賺是賠
 *
 * 一個月內只有 1 筆 snapshot → pnl=0(沒法算),仍渲染點顯示「持平」。
 */

/** 台股慣例:紅 = 盈利,綠 = 虧損 */
const COLOR_PROFIT = '#e23b3b';
const COLOR_LOSS = '#1f9e4a';

interface MonthlyPoint {
  month: string;
  pnl: number;
  ongoing: boolean;
}

/** 自訂點:盈虧染色 + 進行中用空心 */
function PnLDot(props: {
  cx?: number;
  cy?: number;
  payload?: MonthlyPoint;
  index?: number;
}) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return <g />;
  const color = payload.pnl >= 0 ? COLOR_PROFIT : COLOR_LOSS;
  if (payload.ongoing) {
    // 空心:白底 + 較粗的彩色邊,r=6 略大讓玩家一眼注意到是當月
    return (
      <circle
        cx={cx}
        cy={cy}
        r={6}
        fill="#ffffff"
        stroke={color}
        strokeWidth={2.5}
      />
    );
  }
  return <circle cx={cx} cy={cy} r={4.5} fill={color} stroke="#ffffff" strokeWidth={1} />;
}

/** hover 高亮版的點(同邏輯但稍大) */
function PnLActiveDot(props: {
  cx?: number;
  cy?: number;
  payload?: MonthlyPoint;
}) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return <g />;
  const color = payload.pnl >= 0 ? COLOR_PROFIT : COLOR_LOSS;
  if (payload.ongoing) {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={7.5}
        fill="#ffffff"
        stroke={color}
        strokeWidth={3}
      />
    );
  }
  return <circle cx={cx} cy={cy} r={6} fill={color} stroke="#ffffff" strokeWidth={1.5} />;
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
            stroke="#999"
            strokeWidth={1.5}
            dot={<PnLDot />}
            activeDot={<PnLActiveDot />}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-gray-400 text-center mt-1">
        點 = 該月損益(紅賺綠賠);空心點 = 當月進行中(尚未結算)
      </p>
    </div>
  );
}
