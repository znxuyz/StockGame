/**
 * 階段 3D 批 2 — `holdingRepo`:列表類 cloud-first(stale-while-revalidate +
 * 樂觀更新 + 白名單)。
 *
 * 沿用 settingsRepo 模板,但這個 Repository **被 portfolio.ts 包在 Dexie
 * transaction 內呼叫**(buyOrFeed / sell)。Dexie transaction body 不允許
 * await 非 Dexie promise(會 abort 整個 tx)。所以這個檔多兩個機制:
 *
 *  1. **cachedUserId**:module-level 同步可讀的 userId,避開 await getSession()。
 *     auth state 變動時自動更新。Auth gate (PR #116) 保證玩家 mount Game 時
 *     session 已 ready,所以 cache 通常有值。
 *
 *  2. **`Dexie.currentTransaction` detection**:
 *     - tx 內 → 本機 put/delete 完後,用 `tx.on('complete')` 註冊 post-commit
 *       hook 跑雲端 sync(fire-and-forget,失敗只 console.warn + toast)。
 *       **不能 rollback 本機**(tx 已 commit),這是 in-tx 場景的 trade-off。
 *     - tx 外 → 完整 optimistic + cloud upsert + rollback + toast,跟其他
 *       cloud-first repo 同模板。
 *
 * ──────────── 雲端 vs 本機欄位範圍 ────────────
 *
 *  ✅ 上雲(`holdings` 表 + (user_id, code) 複合主鍵;`toRemote` 白名單):
 *     - user_id
 *     - code
 *     - shares
 *     - avg_cost              ← Holding.avgCost
 *     - total_cost            ← Holding.totalCost
 *     - realized_pnl          ← Holding.realizedPnL
 *     - first_purchased_at    ← Holding.firstPurchasedAt(unix ms → ISO timestamptz)
 *     - last_transaction_at   ← Holding.lastTransactionAt(unix ms → ISO timestamptz)
 *
 *  ❌ 不上雲(本機限定):
 *     - petId  — 跨裝置時用 code 配對 pets 表 query 出對應 pet(批 3 處理)
 *
 *  ⚠️ 新裝置從雲端 sync holdings 時,**雲端沒 petId** — 本機 Holding.petId 是
 *     required string。對策:`toLocal` 用 `existing?.petId ?? uuid()`,沒對應
 *     local 時 mint 一個 placeholder。批 3 pets 上雲後可用 code 對齊真實 petId。
 *     在此之前,新裝置看到 holdings 但對應神獸 emoji 可能顯示異常(degraded UX)。
 */

import { useLiveQuery } from 'dexie-react-hooks';
import Dexie from 'dexie';
import { db } from '@/db';
import { supabase, isCloudConfigured } from '@/lib/supabase';
import { reportCloudWriteFailure } from '@/lib/pendingSync';
import { uuid } from '@/utils';
import type { Holding } from '@/types';

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

// ─── 公開 interface(不變,caller 完全無感)─────────────

export interface HoldingRepository {
  count(): Promise<number>;
  get(code: string): Promise<Holding | undefined>;
  list(): Promise<Holding[]>;
  listRecent(): Promise<Holding[]>;
  put(holding: Holding): Promise<void>;
  delete(code: string): Promise<void>;
  clear(): Promise<void>;
}

// ─── 雲端 ↔ 本機 mapper ──────────────────────────────

interface RemoteHolding {
  user_id: string;
  code: string;
  shares: number;
  avg_cost: number;
  total_cost: number;
  realized_pnl: number;
  first_purchased_at: string; // ISO timestamptz
  last_transaction_at: string; // ISO timestamptz
}

function toLocal(remote: RemoteHolding, existing: Holding | undefined): Holding {
  return {
    code: remote.code,
    shares: remote.shares,
    avgCost: remote.avg_cost,
    totalCost: remote.total_cost,
    realizedPnL: remote.realized_pnl,
    firstPurchasedAt: Date.parse(remote.first_purchased_at),
    lastTransactionAt: Date.parse(remote.last_transaction_at),
    petId: existing?.petId ?? uuid() // placeholder,批 3 pets 上雲後對齊
  };
}

function toRemote(local: Holding, userId: string): RemoteHolding {
  return {
    user_id: userId,
    code: local.code,
    shares: local.shares,
    avg_cost: local.avgCost,
    total_cost: local.totalCost,
    realized_pnl: local.realizedPnL,
    first_purchased_at: new Date(local.firstPurchasedAt).toISOString(),
    last_transaction_at: new Date(local.lastTransactionAt).toISOString()
  };
}

// ─── Dexie-only impl(dev fallback)─────────────────

class DexieHoldingRepo implements HoldingRepository {
  count(): Promise<number> {
    return db.holdings.count();
  }
  get(code: string): Promise<Holding | undefined> {
    return db.holdings.get(code);
  }
  list(): Promise<Holding[]> {
    return db.holdings.toArray();
  }
  listRecent(): Promise<Holding[]> {
    return db.holdings.orderBy('lastTransactionAt').reverse().toArray();
  }
  async put(h: Holding): Promise<void> {
    await db.holdings.put(h);
  }
  async delete(code: string): Promise<void> {
    await db.holdings.delete(code);
  }
  async clear(): Promise<void> {
    await db.holdings.clear();
  }
}

// ─── Cloud-first impl ──────────────────────────────

const REVALIDATE_INTERVAL_MS = 10_000;
let lastRevalidateAt = 0;

class CloudFirstHoldingRepo implements HoldingRepository {
  count(): Promise<number> {
    return db.holdings.count();
  }

  get(code: string): Promise<Holding | undefined> {
    return db.holdings.get(code);
  }

  async list(): Promise<Holding[]> {
    try {
      const local = await db.holdings.toArray();
      void this.scheduleRevalidate();
      return local;
    } catch (e) {
      console.error('[holdingRepo] list failed:', e);
      return [];
    }
  }

  async listRecent(): Promise<Holding[]> {
    try {
      const local = await db.holdings.orderBy('lastTransactionAt').reverse().toArray();
      void this.scheduleRevalidate();
      return local;
    } catch (e) {
      console.error('[holdingRepo] listRecent failed:', e);
      return [];
    }
  }

  async put(h: Holding): Promise<void> {
    // 1. 樂觀更新本機(總是)
    await db.holdings.put(h);

    // 2. 偵測是否在 Dexie tx 內 — 影響 cloud sync 策略
    const tx = Dexie.currentTransaction;
    if (tx) {
      // 在 tx 內:本機已 commit,雲端 sync 走 post-commit hook(fire-and-forget,
      // 失敗只 console.warn + toast,**不能 rollback 本機**)。
      const userId = cachedUserId;
      if (!userId) return; // 沒 auth,本機-only
      tx.on('complete', () => {
        void this.uploadOne(h, userId).catch((e) => {
          reportCloudWriteFailure('持倉', e);
        });
      });
      return;
    }

    // 3. tx 外:optimistic + cloud upsert
    // 階段 4-C:雲端失敗**不 rollback**(offline-first 保留本機),
    // 由 pendingSync.drainPendingSync 在連線恢復時自動重送。
    const userId = await getCurrentUserIdAsync();
    if (!userId) return; // 沒 auth,本機-only

    try {
      await this.uploadOne(h, userId);
    } catch (e) {
      reportCloudWriteFailure('持倉', e);
    }
  }

  async delete(code: string): Promise<void> {
    await db.holdings.delete(code);

    const tx = Dexie.currentTransaction;
    if (tx) {
      const userId = cachedUserId;
      if (!userId) return;
      tx.on('complete', () => {
        void this.deleteOne(code, userId).catch((e) => {
          reportCloudWriteFailure('持倉刪除', e);
        });
      });
      return;
    }

    const userId = await getCurrentUserIdAsync();
    if (!userId) return;

    try {
      await this.deleteOne(code, userId);
    } catch (e) {
      reportCloudWriteFailure('持倉刪除', e);
    }
  }

  async clear(): Promise<void> {
    await db.holdings.clear();
    // 雲端不主動 delete(換裝置仍能拉回)
  }

  // ─ private ─

  private async scheduleRevalidate(): Promise<void> {
    const now = Date.now();
    if (now - lastRevalidateAt < REVALIDATE_INTERVAL_MS) return;

    // **Race fix**:throttle slot 同步 claim,沒 userId 才 release
    // (見 cultivationRepo 同 pattern 註解)
    lastRevalidateAt = now;
    const userId = cachedUserId;
    if (!userId) {
      lastRevalidateAt = 0;
      return;
    }

    try {
      const { data, error } = await supabase
        .from('holdings')
        .select('*')
        .eq('user_id', userId);
      if (error) throw new Error(error.message);
      if (!data) return;

      if (data.length === 0) {
        // 雲端空 → 從本機 seed(舊用戶第一次上雲)。
        // **Bug B 修正**:逐 row upsert + 個別錯誤紀錄。
        // 之前用 batch upsert(rows)一筆撞 constraint 全部失敗 → 0 holdings 上雲。
        const local = await db.holdings.toArray();
        if (local.length === 0) return;

        let ok = 0;
        const failed: { code: string; reason: string }[] = [];
        for (const h of local) {
          const { error: upErr } = await supabase
            .from('holdings')
            .upsert(toRemote(h, userId), { onConflict: 'user_id,code' });
          if (upErr) {
            failed.push({ code: h.code, reason: `${upErr.code ?? '?'} ${upErr.message}` });
          } else {
            ok++;
          }
        }
        if (failed.length > 0) {
          console.warn(
            `[holdingRepo] self-heal 不完整:本機 ${local.length} 筆,上傳成功 ${ok},失敗 ${failed.length}`
          );
          for (const f of failed) {
            console.warn(`[holdingRepo] self-heal 失敗 code=${f.code}: ${f.reason}`);
          }
        }
        // 確認雲端筆數(用 count head 避免拉回 payload)
        const { count, error: cntErr } = await supabase
          .from('holdings')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId);
        if (!cntErr && count !== null && count !== local.length) {
          console.warn(
            `[holdingRepo] self-heal 結束驗證:本機 ${local.length} 筆,雲端 ${count} 筆(不一致)`
          );
        }
        return;
      }

      // 雲端有資料 → merge 進本機(保留本機-only 條目,避免 race / 過渡期誤刪)
      // **race fix(階段 6.X)**:用 lastTransactionAt 偵測本機是否較新
      // (剛 buyOrFeed 完,雲端 upload 還在 in-flight,雲端 row 仍是舊值;
      // 此時若直接覆蓋本機,會把使用者剛加碼的 21 股蓋回 16 股)。
      // 本機 lastTransactionAt > 雲端 → skip,讓 pendingSync drain 補推上雲。
      for (const row of data as RemoteHolding[]) {
        const existing = await db.holdings.get(row.code);
        const remoteTs = Date.parse(row.last_transaction_at);
        if (existing && existing.lastTransactionAt > remoteTs) {
          // 本機較新,保留(等 pendingSync drain 把本機推上雲)
          continue;
        }
        await db.holdings.put(toLocal(row, existing));
      }
    } catch (e) {
      console.warn('[holdingRepo] revalidate failed:', e);
    }
  }

  private async uploadOne(h: Holding, userId: string): Promise<void> {
    const { error } = await supabase
      .from('holdings')
      .upsert(toRemote(h, userId), { onConflict: 'user_id,code' });
    if (error) throw new Error(error.message);
  }

  private async deleteOne(code: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('holdings')
      .delete()
      .eq('user_id', userId)
      .eq('code', code);
    if (error) throw new Error(error.message);
  }
}

// ─── factory + singleton ─────────────────────────────

export const holdingRepo: HoldingRepository = isCloudConfigured
  ? new CloudFirstHoldingRepo()
  : new DexieHoldingRepo();

export function useHoldings(): Holding[] | undefined {
  return useLiveQuery(() => holdingRepo.list(), []);
}

export function useRecentHoldings(): Holding[] | undefined {
  return useLiveQuery(() => holdingRepo.listRecent(), []);
}

export const dexieHoldingsTable = db.holdings;
