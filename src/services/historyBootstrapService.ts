/**
 * 階段 5H.bootstrap — App 啟動時自動偵測「歷史 snapshot 是否就緒」,沒就自動補。
 *
 * 為什麼:`rebuildDailySnapshots` 之前只在「新動作」觸發 — Excel 匯入完 / buyOrFeed
 * 完 / sell 完。既有使用者(完全沒做新動作)雖然有交易紀錄,但 `db.snapshots`
 * 從沒被建立過 → 累積報酬率圖只有最後一根針、月度損益只有當月一根、TWR 永遠
 * 卡「歷史價載入中」。
 *
 * 把觸發從「動作驅動」補上「狀態驅動」:不管使用者做不做新動作,只要狀態不對
 * 就自動補。
 *
 * 沿用既有的 `scheduleRebuildHistory()` coalesce-and-trail 排程器 — 不造輪子。
 */

import { db } from '@/db';
import { transactionRepo } from '@/repositories/transactionRepo';
import { getTaipeiDateString } from '@/api';
import { scheduleRebuildHistory } from './portfolioHistoryService';
import type { RebuildResult } from './portfolioHistoryService';

interface SnapshotRange {
  oldest: string | null;
  latest: string | null;
  count: number;
}

async function getSnapshotRange(): Promise<SnapshotRange> {
  const count = await db.snapshots.count();
  if (count === 0) return { oldest: null, latest: null, count: 0 };
  // db.snapshots 主鍵就是 date,orderBy('date') 拿一頭一尾就好,不用 toArray
  const oldest = await db.snapshots.orderBy('date').first();
  const latest = await db.snapshots.orderBy('date').last();
  return {
    oldest: oldest?.date ?? null,
    latest: latest?.date ?? null,
    count
  };
}

/** YYYY-MM-DD 加 1 天 */
function ymdMinusOne(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() - 1);
  return getTaipeiDateString(d);
}

type Decision =
  | { kind: 'skip'; reason: string }
  | { kind: 'noop'; reason: string }
  | { kind: 'rebuild'; reason: string };

/**
 * 決策邏輯(原工單規格):
 *  - 沒交易 → noop
 *  - snapshots 是空的 → 全量 rebuild
 *  - oldestSnapshot > firstTxDate → 全量 rebuild(有比快照更早的交易要往前補)
 *  - latestSnapshot < 昨天 → 增量 rebuild(只補缺的最近區段;但 rebuild 一次跑
 *    整段不可分割,所以仍呼叫同一個 scheduleRebuildHistory,內部已 cache hit
 *    跳過大部分歷史價,不會慢)
 *  - 否則 → skip
 */
function decide(
  firstTxDate: string | null,
  range: SnapshotRange,
  yesterday: string
): Decision {
  if (!firstTxDate) {
    return { kind: 'noop', reason: 'no transactions' };
  }
  if (range.count === 0) {
    return { kind: 'rebuild', reason: 'snapshots=empty' };
  }
  if (range.oldest && range.oldest > firstTxDate) {
    return {
      kind: 'rebuild',
      reason: `oldestSnapshot=${range.oldest} > firstTx=${firstTxDate}`
    };
  }
  if (range.latest && range.latest < yesterday) {
    return {
      kind: 'rebuild',
      reason: `latestSnapshot=${range.latest} < yesterday=${yesterday}`
    };
  }
  return { kind: 'skip', reason: 'snapshots up-to-date' };
}

/**
 * 啟動時呼叫一次。fire-and-forget — 失敗只 console.warn 不擋 UI / 不擋遊戲載入。
 *
 * **要叫兩次**:
 *  1. App 初始化完(local-only / 還沒登入的玩家)
 *  2. 雲端 pullNow 完(登入的玩家;此時 transactions 才從雲端拉下來)
 *
 * 重複呼叫安全 — scheduleRebuildHistory 內部 coalesce,且 decision='skip' 時
 * 直接 return 不浪費 API 額度。
 *
 * 不會 await rebuild;由 useLiveQuery 訂閱 `db.snapshots` 自動讓圖表 / AdvancedMetrics
 * 在 bulkPut 完時 re-render(無需 emit event)。
 */
export async function checkAndRebuildIfNeeded(): Promise<void> {
  const startedAt = Date.now();

  // 1. 拉首筆交易日 + snapshot 範圍
  // 順手記 rawCount(不加任何 filter)— 排查「畫面有資料但 bootstrap 讀不到」用
  const rawTxCount = await transactionRepo.count();
  const firstTx = await transactionRepo.getEarliest();
  const firstTxDate = firstTx ? getTaipeiDateString(new Date(firstTx.timestamp)) : null;
  const range = await getSnapshotRange();
  const yesterday = ymdMinusOne(getTaipeiDateString(new Date()));

  // 2. 決策
  const decision = decide(firstTxDate, range, yesterday);
  // eslint-disable-next-line no-console
  console.log('[historyBootstrap] inspect:', {
    txTableName: 'db.transactions',
    rawTxCount,
    firstTx: firstTxDate ?? '(none)',
    snapshotOldest: range.oldest ?? '(empty)',
    snapshotLatest: range.latest ?? '(empty)',
    snapshotCount: range.count,
    yesterday,
    decision: decision.kind,
    reason: decision.reason
  });

  if (decision.kind !== 'rebuild') return;

  // 3. 排程 rebuild,callback 在最後一輪完成時 log 最終 stat
  scheduleRebuildHistory((result: RebuildResult | null) => {
    const wallMs = Date.now() - startedAt;
    if (!result) {
      console.warn('[historyBootstrap] rebuild failed (see earlier warning)');
      return;
    }
    const total = result.priceRowsFetched + result.priceRowsCached;
    const hitRate = total === 0 ? '—' : ((result.priceRowsCached / total) * 100).toFixed(1) + '%';
    // eslint-disable-next-line no-console
    console.log('[historyBootstrap] done:', {
      durationMs: result.durationMs,
      wallMs,
      daysRebuilt: result.daysRebuilt,
      priceRowsFetched: result.priceRowsFetched,
      priceRowsCached: result.priceRowsCached,
      cacheHitRate: hitRate,
      failedCodes: result.failedCodes.length === 0 ? '(none)' : result.failedCodes,
      range: `${result.earliest} → ${result.latest}`
    });
  });
}
