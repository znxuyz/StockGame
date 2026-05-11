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
import Bestiary from './Bestiary';
import CultivationTab from './CultivationTab';
import TasksTab from './TasksTab';
import AchievementsList from './AchievementsList';
import ErrorBoundary from './ErrorBoundary';

interface RecordsModalProps {
  open: boolean;
  onClose: () => void;
  /** 點修為紀錄行(有 relatedPetId)→ caller 可選實作跳 PetInfoModal */
  onPetClick?: (petId: string) => void;
}

type Tab = 'tasks' | 'overview' | 'compare' | 'achievements' | 'bestiary' | 'transactions' | 'cultivation';

const TAB_LABEL: Record<Tab, string> = {
  tasks: '任務',
  overview: '圖表',
  compare: '對比',
  achievements: '成就',
  bestiary: '圖鑑',
  transactions: '交易',
  cultivation: '修為'
};

/**
 * 紀錄頁主入口（modal sheet 變體，最大 95vh、可滾動）。
 * 用 tab 分區:任務 / 圖表 / 對比 / 成就 / 圖鑑 / 交易明細 / 修為。
 * 任務放第 1 個讓玩家最快看到(階段 3.6)。
 */
/** tab → task trigger 對應(階段 3.7),沒對應的 tab 不 emit */
const TAB_TASK_TRIGGER: Partial<Record<Tab, TaskTriggerEvent>> = {
  overview: 'view_chart',
  bestiary: 'view_codex',
  transactions: 'view_records'
};

export default function RecordsModal({ open, onClose, onPetClick }: RecordsModalProps) {
  const [tab, setTab] = useState<Tab>('tasks');

  // 階段 3.7:tab 切換 → emit task trigger(view_chart / view_codex / view_records)
  useEffect(() => {
    if (!open) return;
    const trigger = TAB_TASK_TRIGGER[tab];
    if (trigger) emitTaskTrigger(trigger, 1);
  }, [open, tab]);

  /** Tab 列(headerExtra)— 渲染進 popup-header 內,完全貼齊標題下方無空白 */
  const tabBar = (
    <div
      className="grid grid-cols-7 border-b"
      style={{ borderColor: 'rgba(212, 175, 55, 0.25)' }}
    >
      {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => setTab(t)}
          className={`py-2.5 text-sm font-bold border-b-2 transition-colors ${
            tab === t
              ? 'text-mythic-jade-500 border-mythic-jade-400'
              : 'text-gray-500 border-transparent hover:bg-white/20'
          }`}
        >
          {TAB_LABEL[t]}
        </button>
      ))}
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title="紀錄" headerExtra={tabBar}>
      <div className="space-y-3">
        {tab === 'tasks' && <TasksTab />}
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
        {tab === 'bestiary' && (
          <ErrorBoundary label="Bestiary">
            <Bestiary />
          </ErrorBoundary>
        )}
        {tab === 'transactions' && <TransactionsList />}
        {tab === 'cultivation' && <CultivationTab onPetClick={onPetClick} />}
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
