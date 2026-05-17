/**
 * 階段 3D 批 3a — `transactionRepo`:cloud-first 列表類 + tx-aware。
 *
 * 沿用 holdingRepo 同套 tx-detection 設計(`portfolio.ts` 在 `db.transaction(
 * 'rw', ...)` 內呼叫 `transactionRepo.put`,Dexie tx body 不允許 await 非
 * Dexie promise)。
 *
 * Transaction.id 本機 string uuid = 雲端 uuid,**1-to-1 mapping,不需 cloudId**。
 *
 * ──────────── 雲端 vs 本機欄位範圍 ────────────
 *
 *  ✅ 上雲(`transactions` 表 + uuid PK + RLS by user_id):
 *     - id                ← Transaction.id (uuid)
 *     - user_id           ← 從 auth.getSession()
 *     - code
 *     - type
 *     - shares
 *     - price
 *     - gross_amount      ← Transaction.grossAmount
 *     - fee
 *     - tax
 *     - net_amount        ← Transaction.netAmount
 *     - realized_pnl      ← Transaction.realizedPnL
 *     - timestamp         ← Transaction.timestamp(unix ms → ISO timestamptz)
 *     - note              ← Transaction.note(optional;undefined → null)
 *
 *  ❌ 本機限定:**無**(所有欄位都該上雲)
 *
 * ──────────── Excel 批次匯入效能 ────────────
 *
 *  `commitBackfilledTransactions` 對 27 筆 row 各呼叫 `buyOrFeed` / `sell`,
 *  各自 wrap 在獨立的 Dexie tx 內。每個 tx commit 後,**fire-and-forget**
 *  的 post-commit cloud 上傳 hook 並行跑 → 27 個 HTTP 請求大致同時發,
 *  總時間 ~1s(取決於 Supabase round-trip)。不需要顯式 batch insert API。
 *
 *  失敗 dedupe:cultivationRepo / loginStreakRepo 等 toast 的 30s dedupe
 *  也對這裡生效,27 筆全失敗時玩家只看到一個 toast。
 */

import { useLiveQuery } from 'dexie-react-hooks';
import Dexie from 'dexie';
import { db } from '@/db';
import { supabase, isCloudConfigured } from '@/lib/supabase';
import { reportCloudWriteFailure } from '@/lib/pendingSync';
import type { Transaction, TransactionType } from '@/types';

// ─── cached userId(同步可讀,給 in-tx 場景用)─────────

let cachedUserId: string | null = null;
if (isCloudConfigured) {
  void supabase.auth.getSession().then(({ data }) => {
    cachedUserId = data.session?.user?.id ?? null;
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    cachedUserId = session?.user?.id ?? null;
  });
}

async function getCurrentUserIdAsync(): Promise<string | null> {
  if (cachedUserId) return cachedUserId;
  try {
    const { data } = await supabase.auth.getSession();
    cachedUserId = data.session?.user?.id ?? null;
    return cachedUserId;
  } catch {
    return null;
  }
}

// ─── 公開 interface(不變)─────────────────────────────

export interface TransactionRepository {
  list(): Promise<Transaction[]>;
  listRecent(limit: number): Promise<Transaction[]>;
  listByType(type: Transaction['type']): Promise<Transaction[]>;
  getEarliest(): Promise<Transaction | undefined>;
  count(): Promise<number>;
  put(tx: Transaction): Promise<void>;
  clear(): Promise<void>;
}

// ─── 雲端 ↔ 本機 mapper ──────────────────────────────

interface RemoteTransaction {
  id: string;
  user_id: string;
  code: string;
  type: TransactionType;
  shares: number;
  price: number;
  gross_amount: number;
  fee: number;
  tax: number;
  net_amount: number;
  realized_pnl: number;
  timestamp: string; // ISO timestamptz
  note: string | null;
}

function toLocal(remote: RemoteTransaction): Transaction {
  return {
    id: remote.id,
    code: remote.code,
    type: remote.type,
    shares: remote.shares,
    price: remote.price,
    grossAmount: remote.gross_amount,
    fee: remote.fee,
    tax: remote.tax,
    netAmount: remote.net_amount,
    realizedPnL: remote.realized_pnl,
    timestamp: Date.parse(remote.timestamp),
    note: remote.note ?? undefined
  };
}

function toRemote(local: Transaction, userId: string): RemoteTransaction {
  return {
    id: local.id,
    user_id: userId,
    code: local.code,
    type: local.type,
    shares: local.shares,
    price: local.price,
    gross_amount: local.grossAmount,
    fee: local.fee,
    tax: local.tax,
    net_amount: local.netAmount,
    realized_pnl: local.realizedPnL,
    timestamp: new Date(local.timestamp).toISOString(),
    note: local.note ?? null
  };
}

// ─── Dexie-only impl(dev fallback)─────────────────

class DexieTransactionRepo implements TransactionRepository {
  list(): Promise<Transaction[]> {
    return db.transactions.orderBy('timestamp').toArray();
  }
  listRecent(limit: number): Promise<Transaction[]> {
    return db.transactions.orderBy('timestamp').reverse().limit(limit).toArray();
  }
  listByType(type: Transaction['type']): Promise<Transaction[]> {
    return db.transactions.where('type').equals(type).toArray();
  }
  getEarliest(): Promise<Transaction | undefined> {
    return db.transactions.orderBy('timestamp').first();
  }
  count(): Promise<number> {
    return db.transactions.count();
  }
  async put(tx: Transaction): Promise<void> {
    await db.transactions.put(tx);
  }
  async clear(): Promise<void> {
    await db.transactions.clear();
  }
}

// ─── Cloud-first impl ──────────────────────────────

const REVALIDATE_INTERVAL_MS = 10_000;
let lastRevalidateAt = 0;

class CloudFirstTransactionRepo implements TransactionRepository {
  async list(): Promise<Transaction[]> {
    try {
      const local = await db.transactions.orderBy('timestamp').toArray();
      void this.scheduleRevalidate();
      return local;
    } catch (e) {
      console.error('[transactionRepo] list failed:', e);
      return [];
    }
  }

  async listRecent(limit: number): Promise<Transaction[]> {
    try {
      const local = await db.transactions
        .orderBy('timestamp')
        .reverse()
        .limit(limit)
        .toArray();
      void this.scheduleRevalidate();
      return local;
    } catch (e) {
      console.error('[transactionRepo] listRecent failed:', e);
      return [];
    }
  }

  async listByType(type: Transaction['type']): Promise<Transaction[]> {
    try {
      const local = await db.transactions.where('type').equals(type).toArray();
      void this.scheduleRevalidate();
      return local;
    } catch (e) {
      console.error('[transactionRepo] listByType failed:', e);
      return [];
    }
  }

  getEarliest(): Promise<Transaction | undefined> {
    return db.transactions.orderBy('timestamp').first();
  }

  count(): Promise<number> {
    return db.transactions.count();
  }

  async put(tx: Transaction): Promise<void> {
    // 1. 樂觀更新本機(總是)
    await db.transactions.put(tx);

    // 2. 偵測是否在 Dexie tx 內(portfolio.ts buyOrFeed / sell 包過)
    const dexieTx = Dexie.currentTransaction;
    if (dexieTx) {
      // tx 內:本機 tx 完成後,post-commit hook fire-and-forget cloud sync。
      // **不能 rollback**(tx 已 commit),失敗只 toast。
      const userId = cachedUserId;
      if (!userId) return;
      dexieTx.on('complete', () => {
        void this.uploadOne(tx, userId).catch((e) => {
          reportCloudWriteFailure('交易', e);
        });
      });
      return;
    }

    // 3. tx 外:optimistic + cloud upsert(失敗保留本機,pendingSync drain)
    const userId = await getCurrentUserIdAsync();
    if (!userId) return;

    try {
      await this.uploadOne(tx, userId);
    } catch (e) {
      reportCloudWriteFailure('交易', e);
    }
  }

  async clear(): Promise<void> {
    await db.transactions.clear();
    // 雲端不主動 delete(換裝置仍能拉回)
  }

  // ─ private ─

  private async uploadOne(tx: Transaction, userId: string): Promise<void> {
    const { error } = await supabase
      .from('transactions')
      .upsert(toRemote(tx, userId), { onConflict: 'id' });
    // uuid 撞 unique 不可能(crypto.randomUUID 唯一性夠);但若 race 重送同筆,
    // 23505 視為 idempotent success
    if (error && error.code !== '23505') throw new Error(error.message);
  }

  private async scheduleRevalidate(): Promise<void> {
    const now = Date.now();
    if (now - lastRevalidateAt < REVALIDATE_INTERVAL_MS) return;

    // **Race fix**:throttle slot 同步 claim,沒 userId 才 release(見 cultivationRepo)
    lastRevalidateAt = now;
    const userId = cachedUserId;
    if (!userId) {
      lastRevalidateAt = 0;
      return;
    }

    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });
      if (error) throw new Error(error.message);
      if (!data) return;

      if (data.length === 0) {
        // 雲端空 + 本機有 → 一次性 seed(舊用戶過渡)
        const local = await db.transactions.toArray();
        if (local.length > 0) {
          const rows = local.map((t) => toRemote(t, userId));
          const { error: upErr } = await supabase
            .from('transactions')
            .upsert(rows, { onConflict: 'id' });
          if (upErr) throw new Error(upErr.message);
        }
        return;
      }

      // 雲端有資料 → bulkPut 進本機(by id idempotent — 同 uuid 覆蓋)
      const localEntries = (data as RemoteTransaction[]).map(toLocal);
      await db.transactions.bulkPut(localEntries);
    } catch (e) {
      console.warn('[transactionRepo] revalidate failed:', e);
    }
  }
}

// ─── factory + singleton ─────────────────────────────

export const transactionRepo: TransactionRepository = isCloudConfigured
  ? new CloudFirstTransactionRepo()
  : new DexieTransactionRepo();

export function useTransactions(): Transaction[] | undefined {
  return useLiveQuery(() => transactionRepo.list(), []);
}

export const dexieTransactionsTable = db.transactions;
