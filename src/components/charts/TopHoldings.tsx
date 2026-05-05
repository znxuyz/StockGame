import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { formatSigned, formatPercent } from '@/utils';

interface RankRow {
  code: string;
  name: string;
  pnl: number;
  returnRate: number;
}

/** TOP 5 賺錢 / 賠錢 個股 */
export default function TopHoldings() {
  const holdings = useLiveQuery(() => db.holdings.toArray(), []);
  const stocks = useLiveQuery(() => db.stocks.toArray(), []);
  const prices = useLiveQuery(() => db.prices.toArray(), []);

  if (!holdings || holdings.length === 0) {
    return (
      <div className="bg-white rounded-lg p-3 border border-gray-200">
        <h4 className="text-sm font-bold mb-2">🏅 個股排行</h4>
        <p className="text-xs text-gray-400 text-center py-4">沒有持倉</p>
      </div>
    );
  }

  const stockMap = new Map((stocks ?? []).map((s) => [s.code, s]));
  const priceMap = new Map((prices ?? []).map((p) => [p.code, p]));

  const rows: RankRow[] = holdings.map((h) => {
    const price = priceMap.get(h.code);
    const marketValue = price ? price.currentPrice * h.shares : h.avgCost * h.shares;
    const pnl = marketValue - h.totalCost;
    const returnRate = h.totalCost > 0 ? pnl / h.totalCost : 0;
    return {
      code: h.code,
      name: stockMap.get(h.code)?.name ?? h.code,
      pnl,
      returnRate
    };
  });

  const winners = [...rows].sort((a, b) => b.pnl - a.pnl).slice(0, 5);
  const losers = [...rows].sort((a, b) => a.pnl - b.pnl).slice(0, 5);
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.pnl)));

  return (
    <div className="bg-white rounded-lg p-3 border border-gray-200">
      <h4 className="text-sm font-bold mb-2">🏅 個股排行（TOP 5）</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <RankList title="💰 賺最多" rows={winners} maxAbs={maxAbs} positive />
        <RankList title="📉 賠最多" rows={losers} maxAbs={maxAbs} positive={false} />
      </div>
    </div>
  );
}

function RankList({
  title,
  rows,
  maxAbs,
  positive
}: {
  title: string;
  rows: RankRow[];
  maxAbs: number;
  positive: boolean;
}) {
  return (
    <div>
      <h5 className="font-bold text-gray-700 mb-1">{title}</h5>
      <div className="space-y-1">
        {rows.map((r) => {
          const colorClass = r.pnl >= 0 ? 'bg-tw-up/70' : 'bg-tw-down/70';
          const widthPct = Math.min(100, (Math.abs(r.pnl) / maxAbs) * 100);
          const showThis = positive ? r.pnl >= 0 : r.pnl < 0;
          if (!showThis) return null;
          return (
            <div key={r.code}>
              <div className="flex justify-between mb-0.5">
                <span className="font-medium text-gray-800 truncate max-w-[120px]">
                  {r.code} {r.name}
                </span>
                <span className={r.pnl >= 0 ? 'text-tw-up' : 'text-tw-down'}>
                  {formatSigned(r.pnl)} ({formatPercent(r.returnRate)})
                </span>
              </div>
              <div className="bg-gray-100 rounded h-2 overflow-hidden">
                <div className={`h-full ${colorClass}`} style={{ width: `${widthPct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
