/**
 * 階段 5G:把 `db.snapshots` 缺漏的歷史日補回來。
 *
 * 問題:`recordDailySnapshot` 只寫「執行當下」那天的 snapshot。玩家 2025/10/13
 * 就開始買股票,但 2026/05/08 才打開 PWA → snapshots 只有 5 天資料,
 * ReturnCurve / MonthlyPnL / 夏普 / 回撤 都被限縮在這 5 天內。
 *
 * 修法:從「第一筆交易日」到「昨天」逐日重建 snapshot。
 *
 *  - totalCost / realizedPnL:用 transactions 累計算,**精確值**
 *  - totalMarketValue:**用 totalCost + realized 當保守 proxy**(我們沒歷史
 *    收盤價來源,不亂猜;歷史 returnRate = realized/cost,沒未實現)
 *  - 今天那筆 snapshot 不寫(讓 `recordDailySnapshot` 在 runPriceUpdate 後寫真值)
 *  - 已有的 snapshot 不覆寫(玩家 PWA 上線後記到的真實值優先)
 *  - localStorage 'snapshotsBackfilled_v1' = '1' 標記只跑一次
 *
 * 真實歷史走勢仍需玩家手動補登交易日期 → 跑 backfill 之前先設好 transaction 日期
 * (FeedModal / SellModal 已加日期欄)
 */

import { db } from '@/db';
import { transactionRepo } from '@/repositories/transactionRepo';
import { getTaipeiDateString } from '@/api';
import type { DailySnapshot, Transaction } from '@/types';

const FLAG_KEY = 'snapshotsBackfilled_v1';
/** 玩家想再跑一次(改了交易日期之後)時手動刪這 key */
export function resetBackfillFlag(): void {
  try {
    localStorage.removeItem(FLAG_KEY);
  } catch {
    // 私密模式 → 忽略
  }
}

export interface BackfillResult {
  skipped: boolean;
  backfilled: number;
  earliest: string | null;
  latest: string | null;
}

export async function backfillSnapshotsIfNeeded(): Promise<BackfillResult> {
  if (typeof localStorage !== 'undefined' && localStorage.getItem(FLAG_KEY) === '1') {
    return { skipped: true, backfilled: 0, earliest: null, latest: null };
  }

  const transactions = await transactionRepo.list();
  if (transactions.length === 0) {
    try {
      localStorage.setItem(FLAG_KEY, '1');
    } catch {
      // 略
    }
    return { skipped: true, backfilled: 0, earliest: null, latest: null };
  }

  const todayStr = getTaipeiDateString(new Date());
  const earliestStr = getTaipeiDateString(new Date(transactions[0].timestamp));

  // 逐日往前推:用累計交易算 totalCost / realized 直到當日結束
  // shares/cost per code,用來算累計 totalCost 精確值
  const sharesByCode = new Map<string, number>();
  const costByCode = new Map<string, number>();
  let totalCostAccum = 0;
  let realizedAccum = 0;

  let txIdx = 0;
  let backfilledCount = 0;
  const earliestMs = new Date(transactions[0].timestamp).setUTCHours(0, 0, 0, 0);
  const todayMs = new Date().setUTCHours(0, 0, 0, 0);

  for (let dayMs = earliestMs; dayMs <= todayMs; dayMs += 86_400_000) {
    const dateStr = getTaipeiDateString(new Date(dayMs));

    // Apply 今天之前發生的所有 transactions(包含今天)
    while (txIdx < transactions.length) {
      const tx = transactions[txIdx];
      const txDateStr = getTaipeiDateString(new Date(tx.timestamp));
      if (txDateStr > dateStr) break;
      applyTransaction(tx, sharesByCode, costByCode, (c) => {
        totalCostAccum += c;
      }, (r) => {
        realizedAccum += r;
      });
      txIdx++;
    }

    // 「今天」這筆不寫,讓 recordDailySnapshot 寫真值
    if (dateStr === todayStr) break;

    // 已有真實 snapshot → 跳過
    const existing = await db.snapshots.get(dateStr);
    if (existing) continue;

    // 沒歷史價來源 → 保守用 totalCost 當 totalMarketValue(returnRate 只反映 realized)
    const totalMarketValue = Math.max(0, totalCostAccum);
    const unrealized = 0;
    const totalPnL = realizedAccum + unrealized;
    const returnRate = totalCostAccum > 0 ? totalPnL / totalCostAccum : 0;

    const snapshot: DailySnapshot = {
      date: dateStr,
      totalMarketValue: Math.round(totalMarketValue),
      totalCost: Math.round(totalCostAccum),
      unrealizedPnL: 0,
      realizedPnL: Math.round(realizedAccum),
      totalPnL: Math.round(totalPnL),
      returnRate,
      recordedAt: dayMs
    };
    await db.snapshots.put(snapshot);
    backfilledCount++;
  }

  try {
    localStorage.setItem(FLAG_KEY, '1');
  } catch {
    // 略
  }
  return {
    skipped: false,
    backfilled: backfilledCount,
    earliest: earliestStr,
    latest: todayStr
  };
}

/** 推進「持倉狀態」一筆交易;不改變引用,純更新 map + 透過 callback 累加 scalar */
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
