/**
 * 階段 5G:歷史交易補登工具的 service 層。
 *
 * 用途:玩家舊資料的 transaction.timestamp 都被 Date.now() 污染(因為早期
 * FeedModal/SellModal 沒日期欄)。此工具讓玩家清舊資料 → 重新逐筆按真實日期
 * 補登,一次校正所有指標。
 *
 *  - clearOldData:清交易/持倉/神獸/snapshot,**保留** profile/cultivation/
 *    achievements/creatureUnlocks/settings/cache 等
 *  - commitBackfilledTransactions:逐筆按 date asc **走 BuyModal 同源** 的
 *    `lookupStock` → `buyOrFeed`/`sell`,跟 modal 寫入 100% 同路徑,不自組
 *    minimal stock(避免 market 誤判 / industry 為「未分類」)。
 *    `now` 設成「該交易日的 09:30(買/加碼) / 13:30(賣)」+ 台北時區
 *  - exportBackup:把所有現有資料 dump 成 JSON 給玩家手動下載備份
 */

import { db } from '@/db';
import { settingsRepo } from '@/repositories/settingsRepo';
import { holdingRepo } from '@/repositories/holdingRepo';
import { petRepo } from '@/repositories/petRepo';
import { transactionRepo } from '@/repositories/transactionRepo';
import { lookupStock } from '@/api';
import { buyOrFeed, sell } from './portfolio';
import { backfillSnapshotsIfNeeded, resetBackfillFlag } from './snapshotBackfill';
import { uuid } from '@/utils';
import type { FeeConfig } from '@/utils';
import type { Settings } from '@/types';

export type PendingTxType = 'buy' | 'feed' | 'sell';

/** UI 端的「待補登交易」— 還沒寫進 db,玩家可編輯/刪除 */
export interface PendingTransaction {
  /** 純 UI 用的 id,讓 list 有 stable key */
  uiId: string;
  /** YYYY-MM-DD(台北時區) */
  date: string;
  type: PendingTxType;
  code: string;
  stockName: string;
  shares: number;
  pricePerShare: number;
}

export function newPendingTx(): Pick<PendingTransaction, 'uiId'> {
  return { uiId: uuid() };
}

/**
 * 清舊資料:
 *  - 清:transactions / holdings / pets / snapshots
 *  - 保留:settings / userCultivation / cultivationLog / achievements /
 *         creatureUnlocks / userLoginStreak / userTasks / milestoneRewards /
 *         stocks(快取)/ prices(快取)/ marketIndices(快取)
 *  - 順手 reset snapshot backfill flag,讓重新補登時跑完全新的 snapshot 序列
 *
 * 注意:雲端 user_creature_summary 等不主動清,讓 profileSyncService 之後因
 * 新事件 upsert 自動更新(舊 row 留在那)
 */
export async function clearOldData(): Promise<void> {
  await Promise.all([
    transactionRepo.clear(),
    holdingRepo.clear(),
    petRepo.clear(),
    db.snapshots.clear()
  ]);
  resetBackfillFlag();
}

/** YYYY-MM-DD + 09:30 台北時區 → unix ms;'sell' 用 13:30(收盤) */
function ymdToTimestamp(ymd: string, type: PendingTxType): number {
  // 09:30 台北 = 01:30 UTC;13:30 台北 = 05:30 UTC
  const isoTime = type === 'sell' ? '05:30:00Z' : '01:30:00Z';
  return new Date(`${ymd}T${isoTime}`).getTime();
}

export interface CommitProgress {
  step: 'importing' | 'snapshot' | 'done';
  /** 0-1 of importing 階段 */
  importingProgress?: number;
  /** snapshot 階段:已補登天數 */
  snapshotBackfilled?: number;
}

export interface CommitResult {
  ok: boolean;
  imported: number;
  failed: Array<{ tx: PendingTransaction; error: string }>;
  snapshotBackfilled: number;
  earliest: string | null;
  latest: string | null;
}

/**
 * 把 PendingTransactions 按日期升序逐筆透過 portfolio.buyOrFeed / sell 寫入。
 * 寫完後跑 snapshotBackfill。
 *
 *  - 失敗的(找不到 stock / 賣超過持有等)會收集到 failed[],不擋住其他成功筆
 *  - settings 用來算手續費(brokerageFeeDiscount + brokerageMinFee)
 *  - onProgress 給 UI 顯示進度條
 */
export async function commitBackfilledTransactions(
  txs: PendingTransaction[],
  settings: Settings,
  onProgress?: (p: CommitProgress) => void
): Promise<CommitResult> {
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
  const feeConfig: FeeConfig = {
    discount: settings.brokerageFeeDiscount,
    minFee: settings.brokerageMinFee
  };

  let imported = 0;
  const failed: CommitResult['failed'] = [];

  for (let i = 0; i < sorted.length; i++) {
    const tx = sorted[i];
    onProgress?.({
      step: 'importing',
      importingProgress: sorted.length === 0 ? 0 : i / sorted.length
    });
    try {
      // 走跟 BuyModal 一模一樣的 lookupStock(已 cached 由 validate 階段灌進去,
      // 命中 cache 立即回,不會多打 API);取得完整 Stock(含正確 market/industry)
      const stock = await lookupStock(tx.code);
      const now = ymdToTimestamp(tx.date, tx.type);
      if (tx.type === 'sell') {
        // 跟 SellModal 同源 — sell() 內部 db.stocks.get(code) 拿 market 算稅
        await sell({
          code: tx.code,
          shares: tx.shares,
          price: tx.pricePerShare,
          feeConfig,
          now
        });
      } else {
        // 跟 BuyModal/FeedModal 同源 — buyOrFeed 自動判斷:
        // 沒 holding → buy(召喚新神獸);有 → feed(加碼平均成本)
        await buyOrFeed({
          stock,
          shares: tx.shares,
          price: tx.pricePerShare,
          feeConfig,
          now
        });
      }
      imported++;
    } catch (e) {
      failed.push({ tx, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // ─ snapshot 補登 ─
  onProgress?.({ step: 'snapshot' });
  const r = await backfillSnapshotsIfNeeded();
  onProgress?.({
    step: 'done',
    snapshotBackfilled: r.backfilled
  });

  return {
    ok: failed.length === 0,
    imported,
    failed,
    snapshotBackfilled: r.backfilled,
    earliest: r.earliest,
    latest: r.latest
  };
}

// ─── 備份匯出 ───────────────────────────────────────────

export interface BackupBlob {
  version: 1;
  exportedAt: string;
  transactions: unknown[];
  holdings: unknown[];
  pets: unknown[];
  snapshots: unknown[];
  settings: unknown;
  userCultivation: unknown;
  cultivationLog: unknown[];
  achievements: unknown[];
  creatureUnlocks: unknown[];
}

export async function exportBackup(): Promise<{ filename: string; jsonString: string }> {
  const [
    transactions,
    holdings,
    pets,
    snapshots,
    settings,
    userCultivation,
    cultivationLog,
    achievements,
    creatureUnlocks
  ] = await Promise.all([
    transactionRepo.list(),
    holdingRepo.list(),
    petRepo.list(),
    db.snapshots.toArray(),
    settingsRepo.get(),
    db.userCultivation.get('main'),
    db.cultivationLog.toArray(),
    db.achievements.toArray(),
    db.creatureUnlocks.toArray().catch(() => []) // 5B v13 表,沒 migrate 完防呆
  ]);

  const blob: BackupBlob = {
    version: 1,
    exportedAt: new Date().toISOString(),
    transactions,
    holdings,
    pets,
    snapshots,
    settings: settings ?? null,
    userCultivation: userCultivation ?? null,
    cultivationLog,
    achievements,
    creatureUnlocks
  };
  const today = new Date().toISOString().slice(0, 10);
  return {
    filename: `stockgame-backup-${today}.json`,
    jsonString: JSON.stringify(blob, null, 2)
  };
}

/** 觸發瀏覽器下載 */
export function downloadBackupFile(filename: string, jsonString: string): void {
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
