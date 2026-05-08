import { useEffect, useState } from 'react';
import { db } from '@/db';
import {
  computeXIRR,
  computeSharpe,
  computeMaxDrawdown,
  computeDailyReturns,
  formatPercent,
  type CashFlow
} from '@/utils';
import { computeSummary } from '@/services';

interface Metrics {
  xirr: number | null;
  sharpe: number | null;
  maxDrawdown: number | null;
  realized: number;
  unrealized: number;
}

/**
 * 進階金融指標：年化報酬 IRR、夏普比率、最大回撤、已實現 vs 未實現。
 *  - 從交易紀錄 + 當前市值 算 IRR
 *  - 從 snapshots 算 Sharpe / MDD
 *  - 資料不足顯示「資料不足」
 */
export default function AdvancedMetrics() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [transactions, snapshots, summary] = await Promise.all([
        db.transactions.orderBy('timestamp').toArray(),
        db.snapshots.orderBy('date').toArray(),
        computeSummary()
      ]);

      // IRR：每筆交易為 cashflow，當前市值為今日的正流入
      const cashflows: CashFlow[] = transactions.map((t) => ({
        // 買/加碼 = 現金流出（負）；賣 = 現金流入（正）；都用 netAmount
        amount: t.type === 'sell' ? t.netAmount : -t.netAmount,
        timestamp: t.timestamp
      }));
      if (summary.totalMarketValue > 0) {
        cashflows.push({ amount: summary.totalMarketValue, timestamp: Date.now() });
      }
      const xirr = computeXIRR(cashflows);

      const dailyRet = computeDailyReturns(snapshots);
      const sharpe = computeSharpe(dailyRet);
      const equity = snapshots.map((s) => s.totalMarketValue);
      const mdd = computeMaxDrawdown(equity);

      if (!cancelled) {
        setMetrics({
          xirr,
          sharpe,
          maxDrawdown: mdd,
          realized: summary.realizedPnL,
          unrealized: summary.unrealizedPnL
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!metrics) {
    return (
      <div className="data-card p-3 text-xs text-gray-400 text-center">
        計算中⋯
      </div>
    );
  }

  const totalPnL = metrics.realized + metrics.unrealized;
  const realizedRatio =
    totalPnL !== 0 ? Math.abs(metrics.realized) / (Math.abs(metrics.realized) + Math.abs(metrics.unrealized)) : 0;

  return (
    <div className="data-card p-3 space-y-2">
      <h4 className="text-sm font-bold">📐 進階指標</h4>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Metric
          title="年化報酬 (IRR)"
          value={metrics.xirr == null ? '—' : formatPercent(metrics.xirr)}
          color={metrics.xirr == null ? 'text-gray-500' : metrics.xirr >= 0 ? 'text-tw-up' : 'text-tw-down'}
          hint="所有買賣 + 當前市值的內部報酬率"
        />
        <Metric
          title="夏普比率"
          value={metrics.sharpe == null ? '—' : metrics.sharpe.toFixed(2)}
          color={metrics.sharpe == null ? 'text-gray-500' : metrics.sharpe >= 1 ? 'text-tw-up' : 'text-tw-down'}
          hint="每單位風險的報酬，> 1 算優秀"
        />
        <Metric
          title="最大回撤"
          value={metrics.maxDrawdown == null ? '—' : formatPercent(-metrics.maxDrawdown, false)}
          color={metrics.maxDrawdown == null ? 'text-gray-500' : 'text-tw-down'}
          hint="歷史最高點到最低點的跌幅"
        />
      </div>

      {/* 已實現 vs 未實現 */}
      <div className="pt-2 border-t border-gray-100">
        <h5 className="text-xs font-bold mb-1 text-gray-700">已實現 vs 未實現損益</h5>
        <div className="bg-gray-100 rounded h-3 overflow-hidden flex">
          <div
            className={metrics.realized >= 0 ? 'bg-tw-up' : 'bg-tw-down'}
            style={{ width: `${realizedRatio * 100}%` }}
            title={`已實現：${metrics.realized.toLocaleString('zh-TW')}`}
          />
          <div
            className={metrics.unrealized >= 0 ? 'bg-tw-up/50' : 'bg-tw-down/50'}
            style={{ width: `${(1 - realizedRatio) * 100}%` }}
            title={`未實現：${metrics.unrealized.toLocaleString('zh-TW')}`}
          />
        </div>
        <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
          <span>已實現 {metrics.realized.toLocaleString('zh-TW')}</span>
          <span>未實現 {metrics.unrealized.toLocaleString('zh-TW')}</span>
        </div>
      </div>
    </div>
  );
}

function Metric({ title, value, color, hint }: { title: string; value: string; color: string; hint: string }) {
  return (
    <div className="bg-sand-50 rounded p-2">
      <div className="text-[10px] text-gray-500">{title}</div>
      <div className={`text-base font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-gray-400 leading-tight">{hint}</div>
    </div>
  );
}
