import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell } from 'recharts';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { formatInt, formatSigned } from '@/utils';

/**
 * 月度損益柱狀圖。
 *
 * 來源:snapshots 表,每月取「該月最後一筆」+「該月最早一筆」
 *      pnl[m] = lastSnapshotOfMonth[m].totalPnL - earliestSnapshotOfMonth[m].totalPnL
 *
 * 改版理由:
 *  - 原本用「上月末 → 本月末 totalPnL 差」算,**第一個月被永遠跳掉**
 *    (loop 從 i=1 開始)→ 玩家只玩了 5 月時 chart 完全空白
 *  - 改用「該月內 totalPnL 變動」(end - start),每個月獨立、不依賴上月
 *  - 該月只有 1 筆 snapshot → pnl=0(沒法算),仍渲染條柱顯示「持平」
 *  - 當月最後一筆是「即時」snapshot → 標示「進行中」(虛線邊框 + 淡色)
 */
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

  const data: { month: string; pnl: number; ongoing: boolean }[] = [];
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
        <BarChart data={recent} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatInt(Math.round(v))} />
          <Tooltip
            formatter={(v: number, _n, item) => {
              const ongoing = (item.payload as { ongoing?: boolean })?.ongoing;
              return [formatSigned(v) + (ongoing ? '(進行中)' : ''), '損益'];
            }}
            labelFormatter={(l) => `月份 ${l}`}
          />
          <Bar dataKey="pnl">
            {recent.map((d, i) => (
              <Cell
                key={i}
                fill={d.pnl >= 0 ? '#e23b3b' : '#1f9e4a'}
                // 進行中的月用斜線 pattern + 邊框,讓玩家知道還沒結算
                fillOpacity={d.ongoing ? 0.55 : 1}
                stroke={d.ongoing ? (d.pnl >= 0 ? '#e23b3b' : '#1f9e4a') : undefined}
                strokeWidth={d.ongoing ? 2 : 0}
                strokeDasharray={d.ongoing ? '4 2' : undefined}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-gray-400 text-center mt-1">
        當月柱條虛線邊框 = 進行中(尚未結算)
      </p>
    </div>
  );
}
