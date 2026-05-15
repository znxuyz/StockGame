/**
 * 階段 3D 批 1 — `cultivationRepo`:Singleton 餘額 + append-only log,雲端為主。
 *
 * 跟 settingsRepo 模板的差異:
 *  - 修為餘額是「原子操作」(避免兩裝置同時花修為導致餘額負數 race),
 *    透過 Supabase RPC `earn_cultivation` / `spend_cultivation` 在雲端 atomically
 *    upsert balance + insert log。本機 `db.userCultivation` + `db.cultivationLog`
 *    仍 樂觀更新 + cloud 失敗 rollback。
 *  - cultivation_log 是 append-only history,RPC 自動寫入雲端 log;本機 addLog
 *    也樂觀寫一筆,跟雲端最後 row 對齊(若 server log_id 跟 local id 不同,
 *    現階段不 reconcile — 本機 id 只給 UI key 用,業務不依賴)。
 *
 * Interface 新增兩個 atomic 方法:
 *   `earn(delta, reason, reasonText, relatedPetId?) → Promise<EarnResult>`
 *   `spend(delta, reason, reasonText, relatedPetId?) → Promise<SpendResult>`
 *
 * 既有方法(`getBalance`/`putBalance`/`addLog`/`listLogs`/...)保留,給
 *  - cloudSync 之類「整包搬資料」場景
 *  - 非業務 mutation 場景(極罕見)
 *  服務層(`cultivationService`)的 `earnCultivation`/`spendCultivation` 改成
 *  call repo 的 `earn`/`spend`,確保原子性。
 *
 * ──────────── 雲端 vs 本機欄位範圍 ────────────
 *
 *  ✅ 上雲(`user_cultivation` + `cultivation_log`):
 *     - amount / lifetime_earned / lifetime_spent / last_updated
 *     - log: change / reason / reason_text / balance_after / related_pet_id / created_at
 *
 *  ❌ 不上雲(本機 only):
 *     - cultivationLog.id(Dexie auto-increment;雲端用 bigserial,各記各的)
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { supabase, isCloudConfigured } from '@/lib/supabase';
import type { UserCultivation, CultivationLog, CultivationReason } from '@/types';

// ─── 公開 interface(新增 earn/spend atomic 方法)──────

export interface EarnResult {
  ok: true;
  newAmount: number;
}

export type SpendResult =
  | { ok: true; newAmount: number }
  | { ok: false; reason: 'invalid_amount' | 'insufficient' | 'no_row'; current?: number };

export interface CultivationRepository {
  // 原子操作(階段 3D 新增 — 業務優先用這兩個)
  earn(
    delta: number,
    reason: CultivationReason,
    reasonText: string,
    relatedPetId?: string
  ): Promise<EarnResult>;
  spend(
    delta: number,
    reason: CultivationReason,
    reasonText: string,
    relatedPetId?: string
  ): Promise<SpendResult>;

  // userCultivation(singleton)
  getBalance(): Promise<UserCultivation | undefined>;
  putBalance(u: UserCultivation): Promise<void>;
  clearBalance(): Promise<void>;

  // cultivationLog(append-only)
  addLog(entry: Omit<CultivationLog, 'id'>): Promise<number>;
  bulkPutLogs(entries: CultivationLog[]): Promise<void>;
  listLogs(): Promise<CultivationLog[]>;
  listRecentLogs(limit: number): Promise<CultivationLog[]>;
  countLogs(): Promise<number>;
  clearLogs(): Promise<void>;
}

// ─── helper ──────────────────────────────────────────

async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(`auth.getSession 失敗:${error.message}`);
  const uid = data.session?.user?.id;
  if (!uid) throw new Error('未登入');
  return uid;
}

interface RemoteCultivation {
  user_id: string;
  amount: number;
  lifetime_earned: number;
  lifetime_spent: number;
  last_updated: number;
  updated_at: string;
}

function toLocalBalance(remote: RemoteCultivation): UserCultivation {
  return {
    id: 'main',
    amount: remote.amount,
    lifetimeEarned: remote.lifetime_earned,
    lifetimeSpent: remote.lifetime_spent,
    lastUpdated: remote.last_updated
  };
}

// ─── Dexie-only impl(dev fallback)─────

class DexieCultivationRepo implements CultivationRepository {
  async earn(
    delta: number,
    reason: CultivationReason,
    reasonText: string,
    relatedPetId?: string
  ): Promise<EarnResult> {
    if (delta <= 0) return { ok: true, newAmount: (await this.getBalance())?.amount ?? 0 };
    const current = (await this.getBalance()) ?? {
      id: 'main' as const,
      amount: 0,
      lifetimeEarned: 0,
      lifetimeSpent: 0,
      lastUpdated: Date.now()
    };
    const newAmount = current.amount + delta;
    const now = Date.now();
    await db.userCultivation.put({
      ...current,
      amount: newAmount,
      lifetimeEarned: current.lifetimeEarned + delta,
      lastUpdated: now
    });
    await db.cultivationLog.add({
      change: delta,
      reason,
      reasonText,
      balanceAfter: newAmount,
      createdAt: now,
      relatedPetId
    } as CultivationLog);
    return { ok: true, newAmount };
  }

  async spend(
    delta: number,
    reason: CultivationReason,
    reasonText: string,
    relatedPetId?: string
  ): Promise<SpendResult> {
    if (delta <= 0) return { ok: false, reason: 'invalid_amount' };
    const current = await this.getBalance();
    if (!current) return { ok: false, reason: 'no_row' };
    if (current.amount < delta) {
      return { ok: false, reason: 'insufficient', current: current.amount };
    }
    const newAmount = current.amount - delta;
    const now = Date.now();
    await db.userCultivation.put({
      ...current,
      amount: newAmount,
      lifetimeSpent: current.lifetimeSpent + delta,
      lastUpdated: now
    });
    await db.cultivationLog.add({
      change: -delta,
      reason,
      reasonText,
      balanceAfter: newAmount,
      createdAt: now,
      relatedPetId
    } as CultivationLog);
    return { ok: true, newAmount };
  }

  getBalance(): Promise<UserCultivation | undefined> {
    return db.userCultivation.get('main');
  }
  async putBalance(u: UserCultivation): Promise<void> {
    await db.userCultivation.put(u);
  }
  async clearBalance(): Promise<void> {
    await db.userCultivation.clear();
  }
  async addLog(entry: Omit<CultivationLog, 'id'>): Promise<number> {
    return db.cultivationLog.add(entry as CultivationLog);
  }
  async bulkPutLogs(entries: CultivationLog[]): Promise<void> {
    await db.cultivationLog.bulkPut(entries);
  }
  listLogs(): Promise<CultivationLog[]> {
    return db.cultivationLog.orderBy('createdAt').toArray();
  }
  listRecentLogs(limit: number): Promise<CultivationLog[]> {
    return db.cultivationLog.orderBy('createdAt').reverse().limit(limit).toArray();
  }
  countLogs(): Promise<number> {
    return db.cultivationLog.count();
  }
  async clearLogs(): Promise<void> {
    await db.cultivationLog.clear();
  }
}

// ─── Cloud-first impl ──────────────────

const REVALIDATE_INTERVAL_MS = 10_000;
let lastRevalidateAt = 0;

class CloudFirstCultivationRepo implements CultivationRepository {
  async earn(
    delta: number,
    reason: CultivationReason,
    reasonText: string,
    relatedPetId?: string
  ): Promise<EarnResult> {
    if (delta <= 0) {
      return { ok: true, newAmount: (await this.getBalance())?.amount ?? 0 };
    }

    // 1. 樂觀更新本機(balance + log)
    const previousBalance = await db.userCultivation.get('main');
    const baseline: UserCultivation = previousBalance ?? {
      id: 'main',
      amount: 0,
      lifetimeEarned: 0,
      lifetimeSpent: 0,
      lastUpdated: Date.now()
    };
    const optimisticAmount = baseline.amount + delta;
    const now = Date.now();
    await db.userCultivation.put({
      ...baseline,
      amount: optimisticAmount,
      lifetimeEarned: baseline.lifetimeEarned + delta,
      lastUpdated: now
    });
    const localLogId = await db.cultivationLog.add({
      change: delta,
      reason,
      reasonText,
      balanceAfter: optimisticAmount,
      createdAt: now,
      relatedPetId
    } as CultivationLog);

    // 2. 沒登入 → 本機已寫,不上雲不 throw
    try {
      await getCurrentUserId();
    } catch (e) {
      console.warn(
        '[cultivationRepo] not signed in — local-only earn, will reconcile after sign-in:',
        e
      );
      return { ok: true, newAmount: optimisticAmount };
    }

    // 3. RPC 雲端 atomic
    try {
      const { data, error } = await supabase.rpc('earn_cultivation', {
        p_delta: delta,
        p_reason: reason,
        p_reason_text: reasonText,
        p_related_pet_id: relatedPetId ?? null
      });
      if (error) throw new Error(error.message);
      const result = data as { ok: boolean; new_amount?: number; reason?: string };
      if (!result.ok) {
        throw new Error(`earn_cultivation 拒絕:${result.reason}`);
      }

      // 雲端的 new_amount 才是真相 — 若跟本機樂觀值不同(多裝置 race),信雲端
      const serverAmount = result.new_amount!;
      if (serverAmount !== optimisticAmount) {
        console.warn(
          `[cultivationRepo] server amount ${serverAmount} ≠ optimistic ${optimisticAmount}, server wins`
        );
        await db.userCultivation.put({
          ...baseline,
          amount: serverAmount,
          lifetimeEarned: baseline.lifetimeEarned + delta,
          lastUpdated: now
        });
      }
      return { ok: true, newAmount: serverAmount };
    } catch (e) {
      // 4. rollback 本機 balance + log
      if (previousBalance) {
        await db.userCultivation.put(previousBalance);
      } else {
        await db.userCultivation.delete('main');
      }
      await db.cultivationLog.delete(localLogId);
      throw new Error(
        `修為同步失敗,請重試:${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  async spend(
    delta: number,
    reason: CultivationReason,
    reasonText: string,
    relatedPetId?: string
  ): Promise<SpendResult> {
    if (delta <= 0) return { ok: false, reason: 'invalid_amount' };

    // 預檢:本機餘額不足直接拒,不上雲(避免無謂 RPC)
    const previousBalance = await db.userCultivation.get('main');
    if (!previousBalance) return { ok: false, reason: 'no_row' };
    if (previousBalance.amount < delta) {
      return { ok: false, reason: 'insufficient', current: previousBalance.amount };
    }

    // 1. 樂觀更新本機
    const optimisticAmount = previousBalance.amount - delta;
    const now = Date.now();
    await db.userCultivation.put({
      ...previousBalance,
      amount: optimisticAmount,
      lifetimeSpent: previousBalance.lifetimeSpent + delta,
      lastUpdated: now
    });
    const localLogId = await db.cultivationLog.add({
      change: -delta,
      reason,
      reasonText,
      balanceAfter: optimisticAmount,
      createdAt: now,
      relatedPetId
    } as CultivationLog);

    // 2. 沒登入 → 本機-only
    try {
      await getCurrentUserId();
    } catch (e) {
      console.warn(
        '[cultivationRepo] not signed in — local-only spend, will reconcile after sign-in:',
        e
      );
      return { ok: true, newAmount: optimisticAmount };
    }

    // 3. RPC
    try {
      const { data, error } = await supabase.rpc('spend_cultivation', {
        p_delta: delta,
        p_reason: reason,
        p_reason_text: reasonText,
        p_related_pet_id: relatedPetId ?? null
      });
      if (error) throw new Error(error.message);
      const result = data as {
        ok: boolean;
        new_amount?: number;
        reason?: 'invalid_amount' | 'insufficient' | 'no_row';
        current?: number;
      };
      if (!result.ok) {
        // 雲端拒絕(可能多裝置 race 把錢花光了)→ rollback 本機 + 回拒絕
        await db.userCultivation.put(previousBalance);
        await db.cultivationLog.delete(localLogId);
        return {
          ok: false,
          reason: result.reason ?? 'insufficient',
          current: result.current
        };
      }

      const serverAmount = result.new_amount!;
      if (serverAmount !== optimisticAmount) {
        console.warn(
          `[cultivationRepo] server amount ${serverAmount} ≠ optimistic ${optimisticAmount}, server wins`
        );
        await db.userCultivation.put({
          ...previousBalance,
          amount: serverAmount,
          lifetimeSpent: previousBalance.lifetimeSpent + delta,
          lastUpdated: now
        });
      }
      return { ok: true, newAmount: serverAmount };
    } catch (e) {
      // 技術錯誤(網路 / RLS / ...)→ rollback + throw
      await db.userCultivation.put(previousBalance);
      await db.cultivationLog.delete(localLogId);
      throw new Error(
        `修為同步失敗,請重試:${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  // ─ Singleton balance(stale-while-revalidate)─

  async getBalance(): Promise<UserCultivation | undefined> {
    try {
      const local = await db.userCultivation.get('main');
      void this.scheduleRevalidate(local);
      if (local) return local;
      return await this.fetchBalanceFromCloud();
    } catch (e) {
      console.error('[cultivationRepo] getBalance failed, returning undefined:', e);
      return undefined;
    }
  }

  async putBalance(u: UserCultivation): Promise<void> {
    // 直接 putBalance(非 earn/spend 路徑)— 用於 cloudSync 整包搬資料、test seed 等
    // 本機更新 + 嘗試 sync 雲端;cloud 失敗 throw(可被 cloudSync 整段 transaction 處理)
    await db.userCultivation.put(u);
    try {
      const userId = await getCurrentUserId();
      const { error } = await supabase
        .from('user_cultivation')
        .upsert(
          {
            user_id: userId,
            amount: u.amount,
            lifetime_earned: u.lifetimeEarned,
            lifetime_spent: u.lifetimeSpent,
            last_updated: u.lastUpdated
          },
          { onConflict: 'user_id' }
        );
      if (error) throw new Error(error.message);
    } catch (e) {
      console.warn('[cultivationRepo] putBalance cloud sync failed:', e);
      // 不 throw — putBalance 主要給 cloudSync / 整包寫入用,失敗只 warn
    }
  }

  async clearBalance(): Promise<void> {
    await db.userCultivation.clear();
    // 雲端不主動 delete(換裝置仍能拉回)
  }

  // ─ Log ─

  async addLog(entry: Omit<CultivationLog, 'id'>): Promise<number> {
    // 直接 addLog 通常是 cloudSync 整包寫入 / 測試。**業務 caller 應該用 earn/spend**,
    // 它們會原子寫 balance + log 上雲。這裡只寫本機 + 嘗試雲端 INSERT;雲端失敗只 warn。
    const localId = await db.cultivationLog.add(entry as CultivationLog);
    try {
      const userId = await getCurrentUserId();
      const { error } = await supabase.from('cultivation_log').insert({
        user_id: userId,
        change: entry.change,
        reason: entry.reason,
        reason_text: entry.reasonText,
        balance_after: entry.balanceAfter,
        related_pet_id: entry.relatedPetId ?? null
      });
      if (error) throw new Error(error.message);
    } catch (e) {
      console.warn('[cultivationRepo] addLog cloud sync failed:', e);
    }
    return localId;
  }

  async bulkPutLogs(entries: CultivationLog[]): Promise<void> {
    await db.cultivationLog.bulkPut(entries);
    // 雲端不批次同步(cloudSync 整檔改寫後此 method 退場)
  }

  listLogs(): Promise<CultivationLog[]> {
    return db.cultivationLog.orderBy('createdAt').toArray();
  }

  listRecentLogs(limit: number): Promise<CultivationLog[]> {
    // 階段 3D 批 1:本機 cache 為主。新裝置剛登入時本機沒 log,
    // earnRPC / spendRPC 之後會逐筆累積本機。一次性「拉雲端 log 全部下來」
    // 留階段 3D 批 2 處理。
    return db.cultivationLog.orderBy('createdAt').reverse().limit(limit).toArray();
  }

  countLogs(): Promise<number> {
    return db.cultivationLog.count();
  }

  async clearLogs(): Promise<void> {
    await db.cultivationLog.clear();
  }

  // ─ private ─

  private async scheduleRevalidate(local: UserCultivation | undefined): Promise<void> {
    const now = Date.now();
    if (now - lastRevalidateAt < REVALIDATE_INTERVAL_MS) return;
    lastRevalidateAt = now;

    try {
      const remote = await this.fetchBalanceFromCloud();
      if (!remote) return;
      const localUpdated = local?.lastUpdated ?? 0;
      if (remote.lastUpdated > localUpdated) {
        await db.userCultivation.put(remote);
      } else if (local && localUpdated > remote.lastUpdated) {
        console.warn(
          `[cultivationRepo] local newer than cloud (local=${localUpdated} > cloud=${remote.lastUpdated}), reconcile deferred`
        );
      }
    } catch (e) {
      console.warn('[cultivationRepo] revalidate failed:', e);
    }
  }

  private async fetchBalanceFromCloud(): Promise<UserCultivation | undefined> {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase
      .from('user_cultivation')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return toLocalBalance(data as RemoteCultivation);

    // 雲端沒 row(舊用戶,trigger 沒回填)→ 本機若有資料 seed 上去
    const existingLocal = await db.userCultivation.get('main');
    if (!existingLocal) return undefined;
    await this.putBalance(existingLocal);
    return existingLocal;
  }
}

// ─── factory + singleton ─────────────────────────────

export const cultivationRepo: CultivationRepository = isCloudConfigured
  ? new CloudFirstCultivationRepo()
  : new DexieCultivationRepo();

export function useCultivationBalance(): UserCultivation | undefined {
  return useLiveQuery(() => cultivationRepo.getBalance(), []);
}

export function useRecentCultivationLogs(limit: number): CultivationLog[] | undefined {
  return useLiveQuery(() => cultivationRepo.listRecentLogs(limit), [limit]);
}

/** Dexie transactional escape hatch — 只給 cloudSync.ts 用 */
export const dexieUserCultivationTable = db.userCultivation;
export const dexieCultivationLogTable = db.cultivationLog;
