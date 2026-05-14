/**
 * 階段 5G:歷史交易補登工具的 service 層。
 *
 * 用途:玩家舊資料的 transaction.timestamp 都被 Date.now() 污染(因為早期
 * FeedModal/SellModal 沒日期欄)。此工具讓玩家清舊資料 → 重新逐筆按真實日期
 * 補登,一次校正所有指標。
 *
 *  - clearOldData:清交易/持倉/神獸/snapshot,**保留** profile/cultivation/
 *    achievements/creatureUnlocks/settings/cache 等
 *  - commitBackfilledTransactions:逐筆按 date asc 透過 buyOrFeed/sell 寫入,
 *    `now` 設成「該交易日的 09:30(買/加碼) / 13:30(賣)」+ 台北時區
 *  - exportBackup:把所有現有資料 dump 成 JSON 給玩家手動下載備份
 */

import { db } from '@/db';
import { buyOrFeed, sell } from './portfolio';
import { backfillSnapshotsIfNeeded, resetBackfillFlag } from './snapshotBackfill';
import { uuid } from '@/utils';
import type { FeeConfig } from '@/utils';
import type { Settings, Stock } from '@/types';

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
    db.transactions.clear(),
    db.holdings.clear(),
    db.pets.clear(),
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
      const stock = await getOrLookupStock(tx.code, tx.stockName);
      if (!stock) {
        failed.push({ tx, error: `找不到股票 ${tx.code}` });
        continue;
      }
      const now = ymdToTimestamp(tx.date, tx.type);
      if (tx.type === 'sell') {
        await sell({
          code: tx.code,
          shares: tx.shares,
          price: tx.pricePerShare,
          feeConfig,
          now
        });
      } else {
        // buyOrFeed 自動判斷:沒 holding → buy(召喚新神獸);有 → feed
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

/**
 * 嘗試從本地 db.stocks 拿;沒就用 tx 內的 code/name 兜一個 minimal stock。
 *  - 真的找不到 stock(例如玩家輸入一個錯誤代號)→ 回 null,該筆 fail
 *  - 找得到 → 用本地的(name 較準)
 *  - 沒在本地但 code 看起來合法 → 兜一個 fake stock 讓 buyOrFeed 進去後再
 *    autocorrect(不接 TWSE API 是為了讓 backfill 純離線可跑)
 */
async function getOrLookupStock(code: string, fallbackName: string): Promise<Stock | null> {
  const local = await db.stocks.get(code);
  if (local) return local;
  // 兜一個最小可用 stock,讓 buyOrFeed 寫進 holdings/pets 不 crash
  // BuyModal 一般會走 lookupStock 補 industry/exchange,這裡 backfill 不接外部 API
  if (!/^[0-9A-Z]{2,6}$/.test(code)) return null;
  const minimal: Stock = {
    code,
    name: fallbackName || code,
    industry: '未分類',
    market: 'TWSE',
    isActive: true
  };
  await db.stocks.put(minimal);
  return minimal;
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
    db.transactions.toArray(),
    db.holdings.toArray(),
    db.pets.toArray(),
    db.snapshots.toArray(),
    db.settings.get('singleton'),
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
