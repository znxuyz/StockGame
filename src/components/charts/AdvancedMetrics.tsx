import { useEffect, useRef, useState } from 'react';
import { db } from '@/db';
import { getTaipeiDateString } from '@/api';
import {
  computeSharpe,
  computeMaxDrawdown,
  computeDailyReturns,
  computeTWR,
  snapshotsHaveRealPrices,
  formatPercent,
  SHARPE_MIN_SAMPLES,
  SHARPE_UNRELIABLE_THRESHOLD,
  type TwrCashflow
} from '@/utils';
import { computeSummary } from '@/services';
import MetricTooltip from './MetricTooltip';

interface Metrics {
  /** 絕對報酬率 = 未實現損益 / 總投入成本(可能 null:沒成本) */
  absoluteReturn: number | null;
  /** TWR(時間加權)— 沒歷史價時為 null,UI 走 fallback */
  twr: number | null;
  /** 是否走 fallback(歷史價未就緒)— UI 顯示「歷史價載入中」 */
  twrFallback: boolean;
  /** 夏普 */
  sharpe: number | null;
  sharpeSampleCount: number;
  /** 最大回撤(0-1) */
  maxDrawdown: number | null;
  /** 已實現 / 未實現 */
  realized: number;
  unrealized: number;
}

/**
 * 進階金融指標 — 階段「TWR 重構」:
 *
 *  上排兩格(報酬):
 *   - 絕對報酬率:未實現損益 / 總投入成本(真實感受,不會被持有時間影響)
 *   - TWR 時間加權報酬率:排除加碼時機的純粹績效;歷史價未到位時用絕對報酬 fallback
 *  下排兩格(風險):
 *   - 夏普比率:< 30 樣本顯示「資料不足」;|sharpe| > 5 顯示 ⚠️
 *   - 最大回撤:用 (1 + returnRate) 為 equity,避免加碼日 peak 假跳
 *
 * 拿掉 IRR / XIRR、拿掉短期年化警告(TWR 不會被短期失真)。
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

      // ── 絕對報酬率 ──
      // 未實現損益 / 總投入成本(= summary.unrealizedPnL / totalCost)
      const absoluteReturn =
        summary.totalCost > 0 ? summary.unrealizedPnL / summary.totalCost : null;

      // ── TWR ──
      // 先檢查歷史 snapshot 有沒有真實 totalMarketValue(snapshotBackfill 在沒
      // 歷史收盤價時用 totalCost+realized 當 proxy,算 TWR 等於 0,沒意義)
      const todayDate = getTaipeiDateString(new Date());
      const hasRealPrices = snapshotsHaveRealPrices(snapshots, todayDate);

      let twr: number | null = null;
      let twrFallback = false;
      if (hasRealPrices) {
        // 把交易日 cashflow 合併到 (date → netInflow) — 同日多筆 sum
        // 流入規則:買/加碼 = +netAmount(錢從錢包進持倉);賣 = -gross(持倉市值減少)
        // (賣的「持倉市值減少」用 gross 而非 netAmount,因為 fee/tax 是錢包扣
        //  的,持倉市值看的是「股票本身的市值流出」)
        const flowMap = new Map<string, number>();
        for (const tx of transactions) {
          const d = getTaipeiDateString(new Date(tx.timestamp));
          const flow = tx.type === 'sell' ? -tx.grossAmount : tx.netAmount;
          flowMap.set(d, (flowMap.get(d) ?? 0) + flow);
        }
        const cashflows: TwrCashflow[] = Array.from(flowMap.entries()).map(
          ([date, netInflow]) => ({ date, netInflow })
        );
        const snapMap = new Map(
          snapshots.map((s) => [s.date, { totalMarketValue: s.totalMarketValue }])
        );
        twr = computeTWR(snapMap, cashflows, summary.totalMarketValue, todayDate);
      } else {
        // Fallback:用絕對報酬率充當,UI 顯示「歷史價載入中」
        twr = absoluteReturn;
        twrFallback = true;
      }

      // ── 夏普 ──
      const dailyRet = computeDailyReturns(snapshots);
      const sharpe = computeSharpe(dailyRet);

      // ── 最大回撤(用 returnRate-based equity 排除現金注入扭曲)──
      const equity = snapshots
        .map((s) => 1 + s.returnRate)
        .filter((v) => Number.isFinite(v) && v > 0);
      const mdd = computeMaxDrawdown(equity);

      if (!cancelled) {
        setMetrics({
          absoluteReturn,
          twr,
          twrFallback,
          sharpe,
          sharpeSampleCount: dailyRet.length,
          maxDrawdown: mdd,
          realized: summary.realizedPnL,
          unrealized: summary.unrealizedPnL
        });
        // eslint-disable-next-line no-console
        console.log('[AdvancedMetrics]', {
          totalCost: summary.totalCost,
          totalMarketValue: summary.totalMarketValue,
          unrealizedPnL: summary.unrealizedPnL,
          absoluteReturnPct:
            absoluteReturn !== null ? (absoluteReturn * 100).toFixed(2) + '%' : '—',
          twrPct: twr !== null ? (twr * 100).toFixed(2) + '%' : '—',
          twrSource: twrFallback ? 'fallback (absolute)' : 'real TWR',
          hasRealHistoricalPrices: hasRealPrices,
          snapshotCount: snapshots.length,
          transactionCount: transactions.length,
          sharpe:
            sharpe !== null
              ? sharpe.toFixed(2)
              : `—(${dailyRet.length}/${SHARPE_MIN_SAMPLES} 天)`,
          mdd: mdd !== null ? (mdd * 100).toFixed(2) + '%' : '—'
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

  // ── 絕對報酬率 顯示 ──
  const absValue =
    metrics.absoluteReturn === null ? '—' : formatPercent(metrics.absoluteReturn);
  const absColor =
    metrics.absoluteReturn === null
      ? 'text-gray-500'
      : metrics.absoluteReturn >= 0
        ? 'text-tw-up'
        : 'text-tw-down';

  // ── TWR 顯示 ──
  const twrValue = metrics.twr === null ? '—' : formatPercent(metrics.twr);
  const twrColor =
    metrics.twr === null
      ? 'text-gray-500'
      : metrics.twr >= 0
        ? 'text-tw-up'
        : 'text-tw-down';
  const twrNote = metrics.twrFallback ? '歷史價載入中(暫顯絕對報酬)' : undefined;

  // ── 夏普 顯示 ──
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

      {/* 上排:報酬(絕對 / TWR) */}
      <div className="grid grid-cols-2 gap-2 text-center">
        <Metric
          title="絕對報酬率"
          value={absValue}
          color={absColor}
          tooltip={`目前帳上總共賺/賠多少百分比。
公式:(目前市值 - 總投入成本) / 總投入成本

這是「真實感受」的報酬率,不會被持有時間影響。`}
        />
        <Metric
          title="TWR 時間加權"
          value={twrValue}
          color={twrColor}
          note={twrNote}
          tooltip={`排除加碼時機影響的純粹績效。

TWR 不在乎你「何時加碼」,只看你持有的標的本身漲跌多少。
常用於比較選股能力,基金公司公告報酬率都用這個。`}
        />
      </div>

      {/* 下排:風險(夏普 / 最大回撤) */}
      <div className="grid grid-cols-2 gap-2 text-center">
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
