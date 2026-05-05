/**
 * 每日資產快照（用於累積報酬率折線圖、月度損益柱狀圖等）。
 *
 * 寫入時機：
 *  - 每次跑完 runPriceUpdate() 後（同日多次寫會直接覆蓋當日紀錄）
 *  - 用 YYYY-MM-DD（台北時區）當主鍵，所以同日只會有一筆
 *  - 月度匯整與年化由 records 頁面 query 的時候即時算
 */

import { db } from '@/db';
import { computeSummary } from './summary';
import { getTaipeiDateString } from '@/api';
import type { DailySnapshot } from '@/types';

export async function recordDailySnapshot(now: Date = new Date()): Promise<DailySnapshot> {
  const summary = await computeSummary();
  const date = getTaipeiDateString(now);
  const snapshot: DailySnapshot = {
    date,
    totalMarketValue: summary.totalMarketValue,
    totalCost: summary.totalCost,
    unrealizedPnL: summary.unrealizedPnL,
    realizedPnL: summary.realizedPnL,
    totalPnL: summary.totalPnL,
    returnRate: summary.returnRate,
    recordedAt: now.getTime()
  };
  await db.snapshots.put(snapshot);

  // 同步更新 settings.lastSnapshotDate
  const settings = await db.settings.get('singleton');
  if (settings && settings.lastSnapshotDate !== date) {
    await db.settings.put({ ...settings, lastSnapshotDate: date });
  }
  return snapshot;
}
