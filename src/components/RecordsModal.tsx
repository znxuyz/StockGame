import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Modal from './Modal';
import { db } from '@/db';
import { ACHIEVEMENTS } from '@/data/achievements';
import { formatInt, formatPrice, formatSigned, formatPercent } from '@/utils';
import ReturnCurve from './charts/ReturnCurve';
import AllocationPie from './charts/AllocationPie';
import MonthlyPnL from './charts/MonthlyPnL';
import TopHoldings from './charts/TopHoldings';
import HoldTimeDistribution from './charts/HoldTimeDistribution';
import AdvancedMetrics from './charts/AdvancedMetrics';
import MarketCompareChart from './charts/MarketCompareChart';
import Bestiary from './Bestiary';

interface RecordsModalProps {
  open: boolean;
  onClose: () => void;
}

type Tab = 'overview' | 'compare' | 'achievements' | 'bestiary' | 'transactions';

const TAB_LABEL: Record<Tab, string> = {
  overview: '圖表',
  compare: '對比',
  achievements: '成就',
  bestiary: '圖鑑',
  transactions: '交易'
};

/**
 * 紀錄頁主入口（modal sheet 變體，最大 95vh、可滾動）。
 * 用 tab 分區：圖表 / 成就 / 圖鑑 / 交易明細。
 */
export default function RecordsModal({ open, onClose }: RecordsModalProps) {
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <Modal open={open} onClose={onClose} title="紀錄">
      <div className="flex flex-col">
        {/* Tabs */}
        <div className="grid grid-cols-5 border-b border-gray-200 sticky top-0 bg-white z-10">
          {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`py-2 text-sm font-bold border-b-2 transition-colors ${
                tab === t
                  ? 'text-sand-300 border-sand-300'
                  : 'text-gray-500 border-transparent hover:bg-gray-50'
              }`}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>

        <div className="p-3 space-y-3">
          {tab === 'overview' && (
            <>
              <ReturnCurve />
              <AdvancedMetrics />
              <AllocationPie />
              <MonthlyPnL />
              <TopHoldings />
              <HoldTimeDistribution />
            </>
          )}
          {tab === 'compare' && <MarketCompareChart />}
          {tab === 'achievements' && <AchievementsList />}
          {tab === 'bestiary' && <Bestiary />}
          {tab === 'transactions' && <TransactionsList />}
        </div>
      </div>
    </Modal>
  );
}

function AchievementsList() {
  const progress = useLiveQuery(() => db.achievements.toArray(), []);
  const map = new Map((progress ?? []).map((a) => [a.id, a]));
  const unlockedCount = (progress ?? []).filter((a) => a.unlockedAt).length;

  // 依分類分組
  const grouped = new Map<string, typeof ACHIEVEMENTS>();
  for (const def of ACHIEVEMENTS) {
    if (!grouped.has(def.category)) grouped.set(def.category, []);
    grouped.get(def.category)!.push(def);
  }
  const CATEGORY_LABEL: Record<string, string> = {
    collection: '🐾 收集',
    profit: '💰 獲利',
    loss: '📉 虧損',
    evolution: '⚡ 進化',
    'long-term': '⏳ 長期',
    operation: '🎯 操作',
    social: '👥 社交'
  };

  return (
    <div className="space-y-3">
      <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-center">
        🏆 已解鎖 {unlockedCount} / {ACHIEVEMENTS.length}
      </div>
      {[...grouped.entries()].map(([cat, list]) => (
        <section key={cat}>
          <h4 className="text-sm font-bold text-gray-700 mb-1">{CATEGORY_LABEL[cat] ?? cat}</h4>
          <div className="space-y-1">
            {list.map((def) => {
              const p = map.get(def.id);
              const unlocked = !!p?.unlockedAt;
              const cur = p?.current ?? 0;
              const pct = Math.min(100, (cur / def.target) * 100);
              return (
                <div
                  key={def.id}
                  className={`px-3 py-2 rounded text-xs ${
                    unlocked
                      ? 'bg-amber-50 border border-amber-200'
                      : 'bg-white border border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={unlocked ? 'font-bold text-amber-800' : 'text-gray-700'}>
                      {unlocked ? '🏅' : '🔒'} {def.name}
                    </span>
                    <span className="text-gray-500">
                      {cur}/{def.target}
                    </span>
                  </div>
                  <div className="text-gray-500 mt-0.5">{def.description}</div>
                  <div className="bg-gray-100 rounded h-1 overflow-hidden mt-1">
                    <div
                      className={`h-full ${unlocked ? 'bg-amber-400' : 'bg-sand-300'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function TransactionsList() {
  const txns = useLiveQuery(
    () => db.transactions.orderBy('timestamp').reverse().limit(200).toArray(),
    []
  );
  const stocks = useLiveQuery(() => db.stocks.toArray(), []);
  const stockMap = new Map((stocks ?? []).map((s) => [s.code, s]));

  if (!txns || txns.length === 0) {
    return <p className="text-sm text-gray-500 text-center py-6">還沒有任何交易</p>;
  }

  return (
    <div className="space-y-1">
      {txns.map((t) => {
        const stock = stockMap.get(t.code);
        const typeLabel =
          t.type === 'buy' ? '🥚 買入' : t.type === 'feed' ? '🍖 加碼' : '📦 賣出';
        const typeColor =
          t.type === 'buy'
            ? 'text-emerald-600'
            : t.type === 'feed'
              ? 'text-amber-600'
              : 'text-rose-600';
        return (
          <div key={t.id} className="px-3 py-2 bg-white border border-gray-200 rounded text-xs">
            <div className="flex justify-between">
              <span className={`font-bold ${typeColor}`}>{typeLabel}</span>
              <span className="text-gray-400">
                {new Date(t.timestamp).toLocaleString('zh-TW', { hour12: false })}
              </span>
            </div>
            <div className="mt-0.5">
              <b>{stock?.name ?? t.code}</b>
              <span className="text-gray-500 ml-1">{t.code}</span>
            </div>
            <div className="text-gray-600 mt-0.5">
              {t.shares} 股 @ {formatPrice(t.price)} · 金額 NT$ {formatInt(t.grossAmount)}
            </div>
            <div className="text-gray-500 mt-0.5">
              手續費 {formatInt(t.fee)}
              {t.tax > 0 && ` · 證交稅 ${formatInt(t.tax)}`} · 實
              {t.type === 'sell' ? '收' : '付'} {formatInt(t.netAmount)}
            </div>
            {t.type === 'sell' && (
              <div
                className={`mt-0.5 font-bold ${
                  t.realizedPnL >= 0 ? 'text-tw-up' : 'text-tw-down'
                }`}
              >
                已實現 {formatSigned(t.realizedPnL)} (
                {formatPercent(t.realizedPnL / (t.grossAmount || 1))})
              </div>
            )}
          </div>
        );
      })}
      {txns.length === 200 && (
        <p className="text-center text-xs text-gray-400 pt-2">只顯示最近 200 筆</p>
      )}
    </div>
  );
}
