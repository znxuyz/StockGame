import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { daysBetween } from '@/utils';

/**
 * 持有時間分布：把 holdings 分成短/中/長期。
 *  - 短線：< 1 個月
 *  - 中期：1 ~ 12 個月
 *  - 長期：> 12 個月
 *  - 超長期：> 3 年
 */
export default function HoldTimeDistribution() {
  const holdings = useLiveQuery(() => db.holdings.toArray(), []);

  if (!holdings || holdings.length === 0) {
    return (
      <div className="bg-white rounded-lg p-3 border border-gray-200">
        <h4 className="text-sm font-bold mb-2">⏳ 持有時間分布</h4>
        <p className="text-xs text-gray-400 text-center py-4">沒有持倉</p>
      </div>
    );
  }

  const now = Date.now();
  const buckets = { short: 0, medium: 0, long: 0, ultra: 0 };
  for (const h of holdings) {
    const days = daysBetween(h.firstPurchasedAt, now);
    if (days < 30) buckets.short++;
    else if (days < 365) buckets.medium++;
    else if (days < 1095) buckets.long++;
    else buckets.ultra++;
  }
  const total = holdings.length;
  const items: Array<{ label: string; count: number; color: string }> = [
    { label: '短線 < 1 月', count: buckets.short, color: 'bg-rose-400' },
    { label: '中期 1~12 月', count: buckets.medium, color: 'bg-amber-400' },
    { label: '長期 1~3 年', count: buckets.long, color: 'bg-emerald-400' },
    { label: '超長期 > 3 年', count: buckets.ultra, color: 'bg-sky-400' }
  ];

  return (
    <div className="bg-white rounded-lg p-3 border border-gray-200">
      <h4 className="text-sm font-bold mb-2">⏳ 持有時間分布</h4>
      <div className="space-y-2 text-xs">
        {items.map((it) => {
          const pct = (it.count / total) * 100;
          return (
            <div key={it.label}>
              <div className="flex justify-between mb-0.5">
                <span>{it.label}</span>
                <span className="text-gray-500">
                  {it.count} 檔 ({pct.toFixed(0)}%)
                </span>
              </div>
              <div className="bg-gray-100 rounded h-2 overflow-hidden">
                <div className={`h-full ${it.color}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
