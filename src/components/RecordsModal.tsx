import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Modal from './Modal';
import { db } from '@/db';
import { emitTaskTrigger } from '@/services';
import type { TaskTriggerEvent } from '@/types';
import { formatInt, formatPrice, formatSigned, formatPercent } from '@/utils';
import ReturnCurve from './charts/ReturnCurve';
import AllocationPie from './charts/AllocationPie';
import MonthlyPnL from './charts/MonthlyPnL';
import TopHoldings from './charts/TopHoldings';
import HoldTimeDistribution from './charts/HoldTimeDistribution';
import AdvancedMetrics from './charts/AdvancedMetrics';
import MarketCompareChart from './charts/MarketCompareChart';

interface RecordsModalProps {
  open: boolean;
  onClose: () => void;
}

type Tab = 'overview' | 'compare' | 'transactions';

interface TabMeta {
  label: string;
  icon: string;
}

const TABS: Record<Tab, TabMeta> = {
  overview: { label: '圖表', icon: '/assets/btn/tab/chart.png' },
  compare: { label: '對比', icon: '/assets/btn/tab/compare.png' },
  transactions: { label: '交易紀錄', icon: '/assets/btn/tab/transactions.png' }
};

const TAB_ORDER: Tab[] = ['overview', 'compare', 'transactions'];

/**
 * 紀錄彈窗(階段 R.3 精簡)。
 *
 * 原本 7 個 tab 移除遊戲類 4 個(任務 / 成就 / 圖鑑 / 修為,已搬到 GameModal),
 * 剩 3 個工具類 tab:圖表 / 對比 / 交易紀錄。預設 tab 'overview'(圖表)。
 *
 * onPetClick prop 拿掉了 — 修為 tab 已遷到 GameModal,點 pet 邏輯也跟過去。
 */
const TAB_TASK_TRIGGER: Partial<Record<Tab, TaskTriggerEvent>> = {
  overview: 'view_chart',
  transactions: 'view_records'
};

export default function RecordsModal({ open, onClose }: RecordsModalProps) {
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    if (!open) return;
    const trigger = TAB_TASK_TRIGGER[tab];
    if (trigger) emitTaskTrigger(trigger, 1);
  }, [open, tab]);

  /** Tab 列(headerExtra)— 渲染進 popup-header 內 */
  const tabBar = (
    <div
      className="grid grid-cols-3 border-b"
      style={{ borderColor: 'rgba(212, 175, 55, 0.25)' }}
    >
      {TAB_ORDER.map((t) => {
        const meta = TABS[t];
        const active = tab === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex flex-col items-center justify-center gap-0.5 py-1.5 text-xs font-bold border-b-2 transition-colors ${
              active
                ? 'text-mythic-jade-500 border-mythic-jade-400'
                : 'text-gray-500 border-transparent hover:bg-white/20'
            }`}
          >
            <img
              src={meta.icon}
              alt=""
              aria-hidden
              draggable={false}
              className={`w-6 h-6 object-contain transition-opacity ${
                active ? 'opacity-100' : 'opacity-60'
              }`}
            />
            <span>{meta.label}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title="紀錄" headerExtra={tabBar}>
      <div className="space-y-3">
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
        {tab === 'transactions' && <TransactionsList />}
      </div>
    </Modal>
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
          <div key={t.id} className="item-card px-3 py-2 text-xs">
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
