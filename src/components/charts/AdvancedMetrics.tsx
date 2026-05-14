import { useEffect, useRef, useState } from 'react';
import { db } from '@/db';
import {
  computeXIRR,
  computeSharpe,
  computeMaxDrawdown,
  computeDailyReturns,
  formatPercent,
  SHARPE_MIN_SAMPLES,
  SHARPE_UNRELIABLE_THRESHOLD,
  type CashFlow
} from '@/utils';
import { computeSummary } from '@/services';
import MetricTooltip from './MetricTooltip';

interface Metrics {
  /** 玩了幾天(從第一筆交易算起) */
  daysSinceFirst: number;
  /** XIRR 結果(可能 unreliable / null) */
  xirr: number | null;
  /** 不年化的累積報酬,< 30 天時顯示用 */
  rawReturn: number | null;
  /** 夏普 */
  sharpe: number | null;
  sharpeSampleCount: number;
  /** 最大回撤(0-1) */
  maxDrawdown: number | null;
  /** 已實現 / 未實現 */
  realized: number;
  unrealized: number;
}

const SHORT_TERM_DAYS = 30;
const MID_TERM_DAYS = 90;

/**
 * 進階金融指標 — 改版:加短期保護 + 現金注入隔離 + tooltip
 *
 *  - 累積報酬 / IRR 切換:< 30 天顯示累積、30-90 天 IRR + ⚠️、> 90 天 IRR
 *  - 夏普:< 30 樣本顯示「資料不足」;|sharpe| > 5 顯示 ⚠️
 *  - 最大回撤:用 (1+returnRate) 為 equity 而非 totalMarketValue,
 *    避免加碼日當天 peak 跳升被算成虛假回撤
 *  - 每個指標旁有 ℹ️,點開展開說明
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

      // 玩了幾天(從第一筆交易算起;沒交易 → 0 天)
      const firstTs = transactions[0]?.timestamp ?? Date.now();
      const daysSinceFirst = Math.max(
        0,
        Math.floor((Date.now() - firstTs) / 86_400_000)
      );

      // ── IRR / 累積報酬 ──
      const cashflows: CashFlow[] = transactions.map((t) => ({
        amount: t.type === 'sell' ? t.netAmount : -t.netAmount,
        timestamp: t.timestamp
      }));
      if (summary.totalMarketValue > 0) {
        cashflows.push({ amount: summary.totalMarketValue, timestamp: Date.now() });
      }
      const xirr = daysSinceFirst >= SHORT_TERM_DAYS ? computeXIRR(cashflows) : null;

      // 累積報酬 = (賺到的 + 還未實現的) / 累積投入,跟 returnRate 同義
      const rawReturn = summary.totalCost > 0 ? summary.totalPnL / summary.totalCost : null;

      // ── 夏普 ──
      const dailyRet = computeDailyReturns(snapshots);
      const sharpe = computeSharpe(dailyRet);

      // ── 最大回撤(改用 returnRate-based equity,排除現金注入扭曲)──
      // 用 (1 + returnRate) 為標準化 equity:加碼當天 returnRate 可能微跌
      //(分母變大),不會像直接用 totalMarketValue 那樣 peak 暴漲再回吐
      const equity = snapshots
        .map((s) => 1 + s.returnRate)
        .filter((v) => Number.isFinite(v) && v > 0);
      const mdd = computeMaxDrawdown(equity);

      if (!cancelled) {
        setMetrics({
          daysSinceFirst,
          xirr,
          rawReturn,
          sharpe,
          sharpeSampleCount: dailyRet.length,
          maxDrawdown: mdd,
          realized: summary.realizedPnL,
          unrealized: summary.unrealizedPnL
        });
        // 階段 5G:診斷 log。打開紀錄彈窗 → DevTools 看分支 + 起點日對不對
        // 若 earliestDate 不對(例如顯示 2026-05-08 但你 2025-10 就開始買)
        //   → 該是 FeedModal/SellModal 沒勾「補登日期」造成 transaction
        //     timestamp 變成今天 → 走交易紀錄 tab 編輯 / 重新輸入
        // 若 daysSinceFirst < 30 但 UI 仍顯示「年化報酬 IRR」→ Service Worker
        //   還在 serve 舊版,按 PwaUpdatePrompt「強制」更新
        // eslint-disable-next-line no-console
        console.log('[AdvancedMetrics]', {
          earliestTxDate:
            transactions[0]?.timestamp
              ? new Date(transactions[0].timestamp).toISOString().slice(0, 10)
              : '(無交易)',
          latestTxDate:
            transactions.length > 0
              ? new Date(transactions[transactions.length - 1].timestamp)
                  .toISOString()
                  .slice(0, 10)
              : '(無交易)',
          transactionCount: transactions.length,
          daysSinceFirst,
          branch:
            daysSinceFirst < 30 ? 'short' : daysSinceFirst < 90 ? 'medium' : 'long',
          rawReturnPct:
            rawReturn !== null ? (rawReturn * 100).toFixed(2) + '%' : '—',
          xirrPct: xirr !== null ? (xirr * 100).toFixed(2) + '%' : '—(短期不算)',
          sharpe:
            sharpe !== null
              ? sharpe.toFixed(2)
              : `—(${dailyRet.length}/${SHARPE_MIN_SAMPLES} 天)`,
          mdd: mdd !== null ? (mdd * 100).toFixed(2) + '%' : '—',
          snapshotCount: snapshots.length,
          snapshotDateRange:
            snapshots.length > 0
              ? `${snapshots[0].date} → ${snapshots[snapshots.length - 1].date}`
              : '(無快照)'
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!metrics) {
    return (
      <div className="data-card p-3 text-xs text-gray-400 text-center">計算中⋯</div>
    );
  }

  const totalPnL = metrics.realized + metrics.unrealized;
  const realizedRatio =
    totalPnL !== 0
      ? Math.abs(metrics.realized) /
        (Math.abs(metrics.realized) + Math.abs(metrics.unrealized))
      : 0;

  // ── IRR / 累積報酬 顯示分支 ──
  const isShortTerm = metrics.daysSinceFirst < SHORT_TERM_DAYS;
  const isMidTerm =
    metrics.daysSinceFirst >= SHORT_TERM_DAYS &&
    metrics.daysSinceFirst < MID_TERM_DAYS;

  let returnTitle: string;
  let returnValue: string;
  let returnColor: string;
  let returnNote: string | undefined;
  if (isShortTerm) {
    returnTitle = '累積報酬';
    returnValue =
      metrics.rawReturn === null ? '—' : formatPercent(metrics.rawReturn);
    returnColor =
      metrics.rawReturn === null
        ? 'text-gray-500'
        : metrics.rawReturn >= 0
          ? 'text-tw-up'
          : 'text-tw-down';
    returnNote = `玩了 ${metrics.daysSinceFirst} 天,需 30 天才能算年化`;
  } else {
    returnTitle = '年化報酬 (IRR)';
    returnValue = metrics.xirr === null ? '—' : formatPercent(metrics.xirr);
    returnColor =
      metrics.xirr === null
        ? 'text-gray-500'
        : metrics.xirr >= 0
          ? 'text-tw-up'
          : 'text-tw-down';
    if (isMidTerm) returnNote = '⚠️ 短期數據,年化僅供參考';
  }

  // ── 夏普 顯示分支 ──
  const sharpeUnreliable =
    metrics.sharpe !== null &&
    Math.abs(metrics.sharpe) > SHARPE_UNRELIABLE_THRESHOLD;
  let sharpeValue: string;
  let sharpeColor: string;
  let sharpeNote: string | undefined;
  if (metrics.sharpe === null) {
    sharpeValue = '—';
    sharpeColor = 'text-gray-500';
    sharpeNote = `資料不足(${metrics.sharpeSampleCount}/${SHARPE_MIN_SAMPLES} 天)`;
  } else {
    sharpeValue = metrics.sharpe.toFixed(2);
    sharpeColor =
      metrics.sharpe >= 1
        ? 'text-tw-up'
        : metrics.sharpe < 0
          ? 'text-tw-down'
          : 'text-gray-700';
    if (sharpeUnreliable) sharpeNote = '⚠️ 數值異常,可能因加碼/賣出造成';
  }

  return (
    <div className="data-card p-3 space-y-2">
      <h4 className="text-sm font-bold">📐 進階指標</h4>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Metric
          title={returnTitle}
          value={returnValue}
          color={returnColor}
          note={returnNote}
          tooltip={`${returnTitle}說明:
• > 0%:賺
• +5%~+15%:穩健
• +15%~+50%:不錯
• > +100%:可能是短期年化放大
短期數據(< 90 天)僅供參考`}
        />
        <Metric
          title="夏普比率"
          value={sharpeValue}
          color={sharpeColor}
          note={sharpeNote}
          tooltip={`報酬與風險的比值:
• > 1:優秀
• 0~1:還行
• < 0:虧損 / 高波動
需要至少 30 天資料才有意義
已自動排除加碼/賣出當日,避免扭曲`}
        />
        <Metric
          title="最大回撤"
          value={
            metrics.maxDrawdown == null
              ? '—'
              : formatPercent(-metrics.maxDrawdown, false)
          }
          color={metrics.maxDrawdown == null ? 'text-gray-500' : 'text-tw-down'}
          note={undefined}
          tooltip={`歷史最高點到最低點的跌幅:
• 0~20%:可接受
• 20~40%:波動大
• > 40%:高風險
已用報酬率序列計算,排除加碼日 peak 虛跳`}
        />
      </div>

      {/* 已實現 vs 未實現 */}
      <div className="pt-2 border-t border-gray-100">
        <h5 className="text-xs font-bold mb-1 text-gray-700">已實現 vs 未實現損益</h5>
        <div className="bg-gray-100 rounded h-3 overflow-hidden flex">
          <div
            className={metrics.realized >= 0 ? 'bg-tw-up' : 'bg-tw-down'}
            style={{ width: `${realizedRatio * 100}%` }}
            title={`已實現:${metrics.realized.toLocaleString('zh-TW')}`}
          />
          <div
            className={metrics.unrealized >= 0 ? 'bg-tw-up/50' : 'bg-tw-down/50'}
            style={{ width: `${(1 - realizedRatio) * 100}%` }}
            title={`未實現:${metrics.unrealized.toLocaleString('zh-TW')}`}
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

function Metric({
  title,
  value,
  color,
  note,
  tooltip
}: {
  title: string;
  value: string;
  color: string;
  /** 主要數值下方的小註解(例:「玩了 12 天」「⚠️ 異常」) */
  note?: string;
  /** 點 ℹ️ 展開的長說明(走 Portal,不會被父容器 overflow 切掉) */
  tooltip: string;
}) {
  const [open, setOpen] = useState(false);
  const iconRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="bg-sand-50 rounded p-2">
      <div className="flex items-center justify-center gap-1 text-[10px] text-gray-500">
        <span>{title}</span>
        <button
          ref={iconRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-3.5 h-3.5 rounded-full bg-gray-300 text-white text-[9px] font-bold leading-none flex items-center justify-center active:scale-95"
          aria-label={`${title} 說明`}
        >
          ℹ
        </button>
      </div>
      <div className={`text-base font-bold ${color}`}>{value}</div>
      {note && <div className="text-[10px] text-gray-400 leading-tight mt-0.5">{note}</div>}
      <MetricTooltip
        anchorRef={iconRef}
        open={open}
        content={tooltip}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
