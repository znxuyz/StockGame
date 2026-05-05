import { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { formatInt } from '@/utils';

const INDUSTRY_LABEL: Record<string, string> = {
  semiconductor: '半導體',
  electronics: '電子下游',
  finance: '金融',
  food: '食品',
  textile: '紡織',
  plastic: '塑膠',
  steel: '鋼鐵',
  shipping: '航運',
  tourism: '觀光',
  biotech: '生技',
  construction: '營建',
  telecom: '電信',
  traditional: '傳產',
  etf: 'ETF',
  other: '其他'
};

const MARKET_LABEL: Record<string, string> = {
  TWSE: '上市',
  TPEX: '上櫃',
  ETF: 'ETF'
};

const COLORS = [
  '#e23b3b',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#a855f7',
  '#ec4899',
  '#f43f5e',
  '#64748b'
];

/** 資產配置圓餅圖：可切換按產業 / 按市場 */
export default function AllocationPie() {
  const [mode, setMode] = useState<'industry' | 'market'>('industry');

  const holdings = useLiveQuery(() => db.holdings.toArray(), []);
  const stocks = useLiveQuery(() => db.stocks.toArray(), []);
  const prices = useLiveQuery(() => db.prices.toArray(), []);

  if (!holdings || holdings.length === 0) {
    return (
      <div className="bg-white rounded-lg p-3 border border-gray-200">
        <p className="text-xs text-gray-400 text-center py-6">沒有持倉，無法畫資產配置</p>
      </div>
    );
  }

  const stockMap = new Map((stocks ?? []).map((s) => [s.code, s]));
  const priceMap = new Map((prices ?? []).map((p) => [p.code, p]));

  const buckets = new Map<string, number>();
  let total = 0;
  for (const h of holdings) {
    const stock = stockMap.get(h.code);
    if (!stock) continue;
    const key = mode === 'industry' ? stock.industry : stock.market;
    const price = priceMap.get(h.code);
    const value = price ? price.currentPrice * h.shares : h.avgCost * h.shares;
    buckets.set(key, (buckets.get(key) ?? 0) + value);
    total += value;
  }

  const data = [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => ({
      name: mode === 'industry' ? INDUSTRY_LABEL[key] ?? key : MARKET_LABEL[key] ?? key,
      value
    }));

  return (
    <div className="bg-white rounded-lg p-3 border border-gray-200">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-bold">🧩 資產配置</h4>
        <div className="text-xs">
          <button
            type="button"
            onClick={() => setMode('industry')}
            className={`px-2 py-0.5 rounded-l ${mode === 'industry' ? 'bg-sand-300 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            產業
          </button>
          <button
            type="button"
            onClick={() => setMode('market')}
            className={`px-2 py-0.5 rounded-r ${mode === 'market' ? 'bg-sand-300 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            市場
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" outerRadius={70} innerRadius={35}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v: number) => `NT$ ${formatInt(v)}（${((v / total) * 100).toFixed(1)}%）`}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
