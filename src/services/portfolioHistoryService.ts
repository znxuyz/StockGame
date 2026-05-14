/**
 * 階段 5H — 歷史快照重建。
 *
 * 從第一筆交易日逐日推到今天,套用每日交易 + 當日歷史價,寫真實 `db.snapshots`。
 *
 * 比 `snapshotBackfill.ts` 強的地方:
 *  - 那邊沒歷史價 → 用 `totalMarketValue = totalCost + realized` 當 proxy
 *    → returnRate 永遠 = realized/cost,看不出市場漲跌
 *  - 這邊用 Yahoo 抓真實歷史日 K → totalMarketValue 是「當日真實市值」
 *    → returnRate / unrealizedPnL / TWR / MaxDrawdown 全部反映實際走勢
 *
 * 觸發時機:
 *  - Excel 匯入完成(`excelImportService.executeImport` 最後)
 *  - BuyModal / FeedModal / SellModal 寫入完成(`portfolio.ts` 內 fire-and-forget)
 *  - 設定彈窗的「重建歷史快照」按鈕(後續 PR)
 */

import { db } from '@/db';
import { getTaipeiDateString } from '@/api';
import {
  prefetchRange,
  getPriceMap,
  findPriceOnOrBefore
} from './historicalPriceService';
import type { DailySnapshot, Transaction } from '@/types';

export interface RebuildProgress {
  step: 'prefetch' | 'rebuild' | 'done';
  /** prefetch 階段:已抓完 N / 總 M 檔 */
  prefetchedCodes?: number;
  totalCodes?: number;
  /** rebuild 階段:已重建 N 天 */
  daysRebuilt?: number;
  totalDays?: number;
}

export interface RebuildResult {
  /** 重建了幾天 snapshot */
  daysRebuilt: number;
  /** 預抓失敗的代號(歷史價拿不到,該檔在歷史 MV 裡會缺) */
  failedCodes: string[];
  /** 預抓階段:從 Yahoo 抓到並寫入 cache 的 price rows 總數 */
  priceRowsFetched: number;
  /** 預抓階段:cache 命中的 price rows 總數(沒打 API) */
  priceRowsCached: number;
  earliest: string | null;
  latest: string | null;
  /** 完成時間 ms,給 UI 顯示「上次重建 N 分鐘前」 */
  finishedAt: number;
  /** 整段重建花的毫秒 */
  durationMs: number;
}

const EMPTY: RebuildResult = {
  daysRebuilt: 0,
  failedCodes: [],
  priceRowsFetched: 0,
  priceRowsCached: 0,
  earliest: null,
  latest: null,
  finishedAt: 0,
  durationMs: 0
};

/**
 * 重建從第一筆買入到「昨天」的每日 snapshot(今天那筆讓 `recordDailySnapshot`
 * 在 runPriceUpdate 後寫真值,避免兩邊搶寫)。
 *
 * 演算法:
 *  1. 拉所有 txs sorted by timestamp asc
 *  2. unique codes → prefetchRange(code, firstTxOfThatCode.date, today)
 *     全部平行(`Promise.all`),Yahoo 一次抓任意範圍不需要分月
 *  3. 從 earliestDate 到 yesterday 逐日:
 *     a. 套用當日所有 tx,更新 `sharesByCode` / `costByCode`
 *     b. 對當下持有的每檔,用 `findPriceOnOrBefore` 拿當日(或前一交易日)收盤價
 *     c. totalMarketValue = Σ(shares × price),沒有價 → 用 cost 當保守 proxy
 *     d. 寫 DailySnapshot
 *
 *  - 已存在的 snapshot **覆蓋**(這邊產出的是「真值」,優先於舊的 proxy)
 *  - 全失敗或無交易 → 直接回空結果不 throw
 */
export async function rebuildDailySnapshots(
  onProgress?: (p: RebuildProgress) => void
): Promise<RebuildResult> {
  const startedAt = Date.now();
  const transactions = await db.transactions.orderBy('timestamp').toArray();
  if (transactions.length === 0) return { ...EMPTY, finishedAt: Date.now() };

  // ── 1. 算每檔股票需要 prefetch 的起始日(該檔第一筆交易日)──
  const firstTxDateByCode = new Map<string, string>();
  for (const tx of transactions) {
    const d = getTaipeiDateString(new Date(tx.timestamp));
    if (!firstTxDateByCode.has(tx.code)) firstTxDateByCode.set(tx.code, d);
  }

  const todayStr = getTaipeiDateString(new Date());
  const codes = Array.from(firstTxDateByCode.keys());

  // ── 2. 平行 prefetch 所有代號 ──
  onProgress?.({ step: 'prefetch', prefetchedCodes: 0, totalCodes: codes.length });
  let prefetchedCount = 0;
  const prefetchResults = await Promise.all(
    codes.map(async (code) => {
      const startDate = firstTxDateByCode.get(code)!;
      const r = await prefetchRange(code, startDate, todayStr);
      prefetchedCount++;
      onProgress?.({
        step: 'prefetch',
        prefetchedCodes: prefetchedCount,
        totalCodes: codes.length
      });
      return { code, ...r };
    })
  );
  const failedCodes = prefetchResults.filter((r) => r.failed).map((r) => r.code);
  const priceRowsFetched = prefetchResults.reduce((s, r) => s + r.fetched, 0);
  const priceRowsCached = prefetchResults.reduce((s, r) => s + r.cached, 0);

  // ── 3. 拉每檔的全 cache 進 in-memory map(daily loop 不再打 db)──
  const priceMaps = new Map<string, Map<string, number>>();
  await Promise.all(
    codes.map(async (code) => {
      const m = await getPriceMap(code);
      priceMaps.set(code, m);
    })
  );

  // ── 4. 逐日 rebuild ──
  const earliestStr = getTaipeiDateString(new Date(transactions[0].timestamp));
  const earliestMs = new Date(`${earliestStr}T00:00:00+08:00`).getTime();
  const todayMs = new Date(`${todayStr}T00:00:00+08:00`).getTime();
  const totalDays = Math.floor((todayMs - earliestMs) / 86_400_000);

  onProgress?.({ step: 'rebuild', daysRebuilt: 0, totalDays });

  const sharesByCode = new Map<string, number>();
  const costByCode = new Map<string, number>();
  let totalCostAccum = 0;
  let realizedAccum = 0;

  let txIdx = 0;
  let daysRebuilt = 0;
  const newSnapshots: DailySnapshot[] = [];

  for (let dayMs = earliestMs; dayMs < todayMs; dayMs += 86_400_000) {
    const dateStr = getTaipeiDateString(new Date(dayMs));

    // 套用 ≤ dateStr 的所有 tx
    while (txIdx < transactions.length) {
      const tx = transactions[txIdx];
      const txDateStr = getTaipeiDateString(new Date(tx.timestamp));
      if (txDateStr > dateStr) break;
      applyTransaction(
        tx,
        sharesByCode,
        costByCode,
        (c) => {
          totalCostAccum += c;
        },
        (r) => {
          realizedAccum += r;
        }
      );
      txIdx++;
    }

    // 算當日總市值:Σ(持股 × 當日收盤),拿不到價 → 用該檔成本當保守 proxy
    let totalMarketValue = 0;
    for (const [code, shares] of sharesByCode.entries()) {
      if (shares <= 0) continue;
      const priceMap = priceMaps.get(code);
      const close = priceMap ? findPriceOnOrBefore(priceMap, dateStr) : null;
      if (close != null) {
        totalMarketValue += close * shares;
      } else {
        // 沒歷史價 → 用該檔已投入成本當保守 proxy(回退到 v5G 的行為)
        totalMarketValue += costByCode.get(code) ?? 0;
      }
    }

    const unrealized = totalMarketValue - totalCostAccum;
    const totalPnL = realizedAccum + unrealized;
    const returnRate = totalCostAccum > 0 ? totalPnL / totalCostAccum : 0;

    newSnapshots.push({
      date: dateStr,
      totalMarketValue: Math.round(totalMarketValue),
      totalCost: Math.round(totalCostAccum),
      unrealizedPnL: Math.round(unrealized),
      realizedPnL: Math.round(realizedAccum),
      totalPnL: Math.round(totalPnL),
      returnRate,
      recordedAt: dayMs
    });
    daysRebuilt++;

    if (daysRebuilt % 30 === 0) {
      onProgress?.({ step: 'rebuild', daysRebuilt, totalDays });
    }
  }

  // 一次 bulkPut(覆蓋舊 proxy snapshot)
  if (newSnapshots.length > 0) {
    await db.snapshots.bulkPut(newSnapshots);
  }

  onProgress?.({ step: 'done', daysRebuilt, totalDays });

  const finishedAt = Date.now();
  return {
    daysRebuilt,
    failedCodes,
    priceRowsFetched,
    priceRowsCached,
    earliest: earliestStr,
    latest: todayStr,
    finishedAt,
    durationMs: finishedAt - startedAt
  };
}

/**
 * Coalesce-and-trail 排程器:
 *  - 同時間最多 1 個 rebuild 在跑
 *  - 跑的時候有人 schedule → 標記「跑完再來一輪」
 *  - 適用於 Excel 匯入 27 筆 + portfolio.ts 結尾 fire-and-forget 的爆量場景
 *    (天真版會起 27 個並行 rebuild 打 Yahoo,且 db.snapshots 重複 bulkPut)
 *
 * 同步呼叫,不 await(fire-and-forget)。
 */
let rebuildPending = false;
let rebuildNeedsAnother = false;
type RebuildCallback = (r: RebuildResult | null) => void;
const onCompleteCallbacks: RebuildCallback[] = [];

/**
 * @param onComplete 可選回呼;coalesce 之後**最後一輪**完成時觸發。
 *   如果這次呼叫被 coalesce 進已執行中的批次,你的 callback 仍會在那輪結束
 *   時被叫(這正是 bootstrap 需要的行為)。失敗時參數為 null。
 */
export function scheduleRebuildHistory(onComplete?: RebuildCallback): void {
  if (onComplete) onCompleteCallbacks.push(onComplete);
  if (rebuildPending) {
    rebuildNeedsAnother = true;
    return;
  }
  rebuildPending = true;
  (async () => {
    let lastResult: RebuildResult | null = null;
    do {
      rebuildNeedsAnother = false;
      try {
        lastResult = await rebuildDailySnapshots();
      } catch (e) {
        console.warn('[portfolioHistory] scheduled rebuild failed:', e);
        lastResult = null;
      }
    } while (rebuildNeedsAnother);
    rebuildPending = false;
    // 一次 flush 所有累積的 callback,清空陣列
    const cbs = onCompleteCallbacks.splice(0);
    for (const cb of cbs) {
      try {
        cb(lastResult);
      } catch (e) {
        console.warn('[portfolioHistory] onComplete cb threw:', e);
      }
    }
  })();
}

/** 套用一筆交易到 in-memory 持倉狀態(完整搬運自 snapshotBackfill 的邏輯) */
function applyTransaction(
  tx: Transaction,
  sharesByCode: Map<string, number>,
  costByCode: Map<string, number>,
  addCost: (delta: number) => void,
  addRealized: (delta: number) => void
): void {
  if (tx.type === 'buy' || tx.type === 'feed') {
    sharesByCode.set(tx.code, (sharesByCode.get(tx.code) ?? 0) + tx.shares);
    costByCode.set(tx.code, (costByCode.get(tx.code) ?? 0) + tx.netAmount);
    addCost(tx.netAmount);
  } else if (tx.type === 'sell') {
    const curShares = sharesByCode.get(tx.code) ?? 0;
    const curCost = costByCode.get(tx.code) ?? 0;
    if (curShares > 0) {
      const costOfSold = (curCost * tx.shares) / curShares;
      const newShares = curShares - tx.shares;
      const newCost = curCost - costOfSold;
      if (newShares <= 0) {
        sharesByCode.delete(tx.code);
        costByCode.delete(tx.code);
      } else {
        sharesByCode.set(tx.code, newShares);
        costByCode.set(tx.code, newCost);
      }
      addCost(-costOfSold);
    }
    addRealized(tx.realizedPnL);
  }
}
