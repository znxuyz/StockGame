import { useEffect, useMemo, useState } from 'react';
import { getFriendPortfolio, getFriendPrivacy } from '@/services';
import { formatReturnPercent } from '@/utils';
import type { FriendPortfolioItem, PortfolioVisibility } from '@/types';

interface FriendPortfolioViewProps {
  friendUserId: string;
}

/**
 * 階段 5E:好友持倉組合視圖。
 *
 *  - 從 user_portfolio_summary 撈 + 對方隱私 → service 層已套用遮罩
 *  - 視覺:
 *      hidden  → 顯示比例 + 「---」金額 + 「此玩家未公開金額資訊」提示
 *      partial → "1*****7" 格式金額
 *      full    → 完整金額
 *  - 簡單 SVG 圓餅圖呈現 portfolio_weight 占比(避免引額外 lib)
 *  - 報酬率欄位若對方關閉 → 顯示「—」
 */
export default function FriendPortfolioView({ friendUserId }: FriendPortfolioViewProps) {
  const [items, setItems] = useState<FriendPortfolioItem[]>([]);
  const [visibility, setVisibility] = useState<PortfolioVisibility>('hidden');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([getFriendPortfolio(friendUserId), getFriendPrivacy(friendUserId)]).then(
      ([list, privacy]) => {
        setItems(list);
        setVisibility(privacy?.portfolioAmountVisibility ?? 'hidden');
        setLoading(false);
      }
    );
  }, [friendUserId]);

  // 排序:weight desc
  const sorted = useMemo(
    () => [...items].sort((a, b) => b.portfolioWeight - a.portfolioWeight),
    [items]
  );

  if (loading) {
    return <p className="text-xs text-gray-400 italic text-center py-6">載入持倉⋯</p>;
  }
  if (sorted.length === 0) {
    return (
      <div className="text-center py-8 space-y-2">
        <div className="text-4xl">📭</div>
        <p className="text-sm text-gray-700">此玩家目前沒有持倉</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visibility === 'hidden' && (
        <p className="text-[11px] text-gray-600 bg-amber-50 border border-amber-200 rounded p-2">
          此玩家未公開金額資訊,但你可以看到持倉比例。
        </p>
      )}

      {/* 圓餅圖(SVG 純手刻,避免 recharts 整包載入) */}
      <PortfolioPie items={sorted} />

      <div className="space-y-1.5">
        {sorted.map((it) => (
          <PortfolioRow key={it.stockCode} item={it} visibility={visibility} />
        ))}
      </div>
    </div>
  );
}

// ─── 圓餅圖(SVG)─────────────────────────────────────────

const PIE_COLORS = [
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#84cc16'
];

function PortfolioPie({ items }: { items: FriendPortfolioItem[] }) {
  const total = items.reduce((s, it) => s + it.portfolioWeight, 0);
  if (total <= 0) return null;
  const r = 60;
  const cx = 80;
  const cy = 80;
  let cumulative = 0;
  const paths: Array<{ d: string; color: string; key: string }> = [];
  items.forEach((it, i) => {
    if (it.portfolioWeight <= 0) return;
    const ratio = it.portfolioWeight / total;
    const startAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    cumulative += ratio;
    const endAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = ratio > 0.5 ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    paths.push({ d, color: PIE_COLORS[i % PIE_COLORS.length], key: it.stockCode });
  });
  return (
    <div className="flex justify-center">
      <svg width="160" height="160" viewBox="0 0 160 160" aria-label="持倉組合圓餅圖">
        {paths.map((p) => (
          <path
            key={p.key}
            d={p.d}
            fill={p.color}
            stroke="#fff"
            strokeWidth="2"
            opacity={0.9}
          />
        ))}
        <circle cx={cx} cy={cy} r={r * 0.45} fill="#fff" opacity={0.85} />
        <text x={cx} y={cy} textAnchor="middle" dy="0.35em" fontSize="11" fill="#8b6914">
          持倉組合
        </text>
      </svg>
    </div>
  );
}

// ─── 單檔列 ───────────────────────────────────────────────

function PortfolioRow({
  item,
  visibility
}: {
  item: FriendPortfolioItem;
  visibility: PortfolioVisibility;
}) {
  const showAmount = visibility !== 'hidden';
  return (
    <div className="item-card px-3 py-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="text-sm font-bold text-gray-800 truncate">
          {item.stockCode} {item.stockName}
        </div>
        <div className="text-xs text-amber-700 font-bold shrink-0 tabular-nums">
          {item.portfolioWeight.toFixed(1)}%
        </div>
      </div>
      {showAmount && (
        <div className="text-[11px] text-gray-600 grid grid-cols-3 gap-1">
          <div>
            <span className="text-gray-500">投入</span>
            <div className="font-bold text-gray-700 tabular-nums">
              {item.investedAmountText}
            </div>
          </div>
          <div>
            <span className="text-gray-500">市值</span>
            <div className="font-bold text-gray-700 tabular-nums">
              {item.currentValueText}
            </div>
          </div>
          <div>
            <span className="text-gray-500">未實現</span>
            <div className="font-bold text-gray-700 tabular-nums">
              {item.unrealizedPnlText}
            </div>
          </div>
        </div>
      )}
      <div className="text-[11px] text-gray-500 flex items-center gap-3 mt-1">
        <span>
          總報酬:
          <span
            className={
              item.returnPercent === null
                ? 'text-gray-400'
                : item.returnPercent >= 0
                  ? 'text-red-600 font-bold ml-1'
                  : 'text-emerald-600 font-bold ml-1'
            }
          >
            {formatReturnPercent(item.returnPercent)}
          </span>
        </span>
        <span>
          今日:
          <span
            className={
              item.dailyReturnPercent === null
                ? 'text-gray-400 ml-1'
                : item.dailyReturnPercent >= 0
                  ? 'text-red-600 font-bold ml-1'
                  : 'text-emerald-600 font-bold ml-1'
            }
          >
            {formatReturnPercent(item.dailyReturnPercent)}
          </span>
        </span>
      </div>
    </div>
  );
}
