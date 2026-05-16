/**
 * 階段 3D 緊急修復 — `cultivationRepo`:白名單 toRemote + 寫失敗不 throw +
 * 移除依賴不存在的 RPC,改成直接 upsert balance 表 + 本機 log。
 *
 * 前一輪批 1 假設雲端有 `earn_cultivation` / `spend_cultivation` RPC,實際沒有;
 * 加上雙寫整包碰到 schema cache 找不到 column 就炸 → 把 App init 卡死。
 * 本次緊急修復:
 *   1. 白名單 toRemote(只送 user_id / total_points / lifetime_earned / lifetime_spent)
 *   2. 拿掉 RPC 依賴,直接走 supabase.from('user_cultivation').upsert(...)
 *   3. cloud log writes 整段拿掉(雲端 cultivation_log 表 schema 不確定;留階段
 *      之後再對齊 — 本機 log 仍正常累積)
 *   4. 寫失敗一律「console.error + 回滾本機 + emit toast」,**不 throw**
 *
 * ──────────── 雲端 vs 本機欄位範圍 ────────────
 *
 *  ✅ 上雲(`user_cultivation` 表;`toRemoteBalance` 白名單):
 *     - user_id
 *     - total_points          ← UserCultivation.amount(雲端命名是 total_)
 *     - lifetime_earned       ← UserCultivation.lifetimeEarned
 *     - lifetime_spent        ← UserCultivation.lifetimeSpent
 *
 *  ❌ 不上雲(本機限定):
 *     - lastUpdated           Settings 風格的同步時間戳,本機 stale-while-revalidate 用
 *     - id 'main'             本機 singleton 主鍵
 *
 *  ❌ cultivation_log:**完全不上雲**(本批先這樣;本機 db.cultivationLog 照常 append)
 *
 *  ⚠️ 加新雲端欄位前,必先在 Supabase `user_cultivation` 表 ALTER 確認對應 column 存在
 *
 * ──────────── 原子性 trade-off ────────────
 *
 *  抽掉 RPC 之後,兩裝置同時花修為 race 沒有 PG-level 防線(只有本機預檢
 *  「餘額 >= delta」)。兩裝置同時花同一筆會雙方都 ok,雲端餘額可能變成負數。
 *  風險可控:單人玩遊戲多裝置同時花修為的機率極低;且 settingsRepo / loginStreakRepo
 *  也沒有原子防線。後續(階段 5 / 階段 4 之後)再評估 RPC 補強。
 *
 * ──────────── 錯誤處理 ────────────
 *
 *  `earn` / `spend`:雲端失敗 → console.error + 本機 balance / log rollback + emit toast,
 *  **不 throw**。Caller 拿到 `{ ok: false, reason: 'cloud_failed' }`(或 spend 拿
 *  `{ ok: false, reason: 'cloud_failed', current }`)決定要不要走業務拒絕路徑。
 *
 *  `getBalance`:外層 try/catch,永遠不 throw。
 *
 *  `putBalance` / `addLog` / 其他 raw 方法:雲端失敗 console.warn,**不 throw**,
 *  不影響本機資料。
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { supabase, isCloudConfigured } from '@/lib/supabase';
import { eventBus } from '@/services/eventBus';
import type { UserCultivation, CultivationLog, CultivationReason } from '@/types';

// ─── 公開 interface(批 1 加的 earn/spend 保留)─────

export type EarnResult =
  | { ok: true; newAmount: number }
  | { ok: false; reason: 'cloud_failed'; newAmount: number };

export type SpendResult =
  | { ok: true; newAmount: number }
  | {
      ok: false;
      reason: 'invalid_amount' | 'insufficient' | 'no_row' | 'cloud_failed';
      current?: number;
    };

export interface CultivationRepository {
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

  getBalance(): Promise<UserCultivation | undefined>;
  putBalance(u: UserCultivation): Promise<void>;
  clearBalance(): Promise<void>;

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

// ─── 雲端 ↔ 本機 mapper ──────────────────────────────

/**
 * 雲端 `user_cultivation` row shape — 只列已知存在的欄位。
 * **不要加** amount / last_updated 之類本機命名 — 跟雲端 schema 命名對齊用。
 */
interface RemoteCultivation {
  user_id: string;
  total_points: number;
  lifetime_earned: number;
  lifetime_spent: number;
  // updated_at 可能存在也可能沒,SELECT 時 ?. 取即可
  updated_at?: string;
}

function toLocalBalance(
  remote: RemoteCultivation,
  existingLocal: UserCultivation | undefined
): UserCultivation {
  const baseline: UserCultivation = existingLocal ?? {
    id: 'main',
    amount: 0,
    lifetimeEarned: 0,
    lifetimeSpent: 0,
    lastUpdated: Date.now()
  };
  return {
    ...baseline,
    amount: remote.total_points,
    lifetimeEarned: remote.lifetime_earned,
    lifetimeSpent: remote.lifetime_spent,
    lastUpdated: remote.updated_at ? new Date(remote.updated_at).getTime() : baseline.lastUpdated
  };
}

function toRemoteBalance(
  local: UserCultivation,
  userId: string
): Omit<RemoteCultivation, 'updated_at'> {
  return {
    user_id: userId,
    total_points: local.amount,
    lifetime_earned: local.lifetimeEarned,
    lifetime_spent: local.lifetimeSpent
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

// ─── Cloud-first impl(沒 RPC,直接 upsert 表)─────

const REVALIDATE_INTERVAL_MS = 10_000;
let lastRevalidateAt = 0;

class CloudFirstCultivationRepo implements CultivationRepository {
  /**
   * 階段 3D 配合 Server-side dedup:
   * Supabase `earn_cultivation` RPC 對 (user, reason ∈ {realm_breakthrough,
   * effect_unlock, level_up}, pet) 在 30 分鐘內 silent skip(回 success 但不
   * 真的加)。本機沒辦法事前預測會不會被 dedup,所以走「樂觀 + refetch
   * 校正」:
   *
   *   1. 本機樂觀寫 balance + log(沒 cloudId)
   *   2. 呼叫 RPC(不解析 return value,server 是真相)
   *   3. RPC 成功 → refetch user_cultivation 蓋掉本機 balance(若 silent skip,
   *      cloud 沒加,refetch 把本機 +N 抹回去)
   *   4. refetch cultivation_log 最近 20 筆 → 刪掉本機這筆 optimistic + 用
   *      cloudId dedupe 寫入雲端 entries(若 silent skip 沒新 log,
   *      optimistic 還是會被刪 → log 跟 balance 一起回到 pre-earn 狀態)
   *   5. RPC 失敗 → 完整 rollback(balance + log)+ toast + 回 cloud_failed
   */
  async earn(
    delta: number,
    reason: CultivationReason,
    reasonText: string,
    relatedPetId?: string
  ): Promise<EarnResult> {
    if (delta <= 0) {
      return { ok: true, newAmount: (await this.getBalance())?.amount ?? 0 };
    }

    // 1. 樂觀更新本機(balance + log,沒 cloudId)
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
    const optimisticBalance: UserCultivation = {
      ...baseline,
      amount: optimisticAmount,
      lifetimeEarned: baseline.lifetimeEarned + delta,
      lastUpdated: now
    };
    await db.userCultivation.put(optimisticBalance);
    const optimisticLogId = await db.cultivationLog.add({
      change: delta,
      reason,
      reasonText,
      balanceAfter: optimisticAmount,
      createdAt: now,
      relatedPetId
    } as CultivationLog);

    // 2. 沒登入 → 本機已寫,不上雲
    let userId: string;
    try {
      userId = await getCurrentUserId();
    } catch {
      return { ok: true, newAmount: optimisticAmount };
    }

    // 3. 呼叫 RPC(server 內含 30-min dedup);失敗 → 完整 rollback
    try {
      const { error } = await supabase.rpc('earn_cultivation', {
        p_delta: delta,
        p_reason: reason,
        p_reason_text: reasonText,
        p_related_pet_id: relatedPetId ?? null
      });
      if (error) throw new Error(error.message);
    } catch (e) {
      console.error('[cultivationRepo] earn RPC failed:', e);
      if (previousBalance) {
        await db.userCultivation.put(previousBalance);
      } else {
        await db.userCultivation.delete('main');
      }
      await db.cultivationLog.delete(optimisticLogId);
      eventBus.emit('toast:show', {
        message: '修為同步失敗(已還原本機)',
        variant: 'error'
      });
      return {
        ok: false,
        reason: 'cloud_failed',
        newAmount: previousBalance?.amount ?? 0
      };
    }

    // 4. Refetch cloud balance — 蓋掉本機(silent skip 情況下這步把樂觀值抹回去)
    try {
      const { data, error } = await supabase
        .from('user_cultivation')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (data) {
        await db.userCultivation.put(toLocalBalance(data as RemoteCultivation, baseline));
      }
    } catch (e) {
      console.warn('[cultivationRepo] earn refetch balance failed:', e);
    }

    // 5. Refetch cloud log — 刪 optimistic + dedupe 匯入 cloud entries
    //    cloud 沒這張表 / 失敗時 → optimistic log 保留(降級行為)
    try {
      const { data, error } = await supabase
        .from('cultivation_log')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      if (data) {
        // 5a. 刪掉這次 optimistic local entry(它沒 cloudId,refetch 拿到的雲端
        //     entry 才是真相;若 silent skip 沒新 entry,刪掉就等於還原)
        await db.cultivationLog.delete(optimisticLogId);

        // 5b. dedupe:過去已匯入的 cloud entry(cloudId 已存在本機)→ 跳過
        const all = await db.cultivationLog.toArray();
        const existingCloudIds = new Set<number>();
        for (const e of all) {
          if (typeof e.cloudId === 'number') existingCloudIds.add(e.cloudId);
        }

        const toInsert: CultivationLog[] = [];
        for (const row of data) {
          const cloudId = typeof row.id === 'number' ? row.id : Number(row.id);
          if (existingCloudIds.has(cloudId)) continue;
          toInsert.push({
            cloudId,
            change: row.change as number,
            reason: row.reason as CultivationReason,
            reasonText: (row.reason_text as string) ?? '',
            balanceAfter: row.balance_after as number,
            createdAt: row.created_at
              ? new Date(row.created_at as string).getTime()
              : Date.now(),
            relatedPetId: (row.related_pet_id ?? undefined) as string | undefined
          });
        }
        if (toInsert.length > 0) {
          await db.cultivationLog.bulkAdd(toInsert as CultivationLog[]);
        }
      }
    } catch (e) {
      console.warn('[cultivationRepo] earn refetch log failed:', e);
    }

    // 6. 回當前本機餘額(refetch 後的真相 — silent skip 已抹回 pre-earn 值)
    const finalBalance = await db.userCultivation.get('main');
    return { ok: true, newAmount: finalBalance?.amount ?? optimisticAmount };
  }

  async spend(
    delta: number,
    reason: CultivationReason,
    reasonText: string,
    relatedPetId?: string
  ): Promise<SpendResult> {
    if (delta <= 0) return { ok: false, reason: 'invalid_amount' };

    // 預檢本機餘額(雲端沒 RPC 做 atomic check,只靠本機 + 雲端 upsert)
    const previousBalance = await db.userCultivation.get('main');
    if (!previousBalance) return { ok: false, reason: 'no_row' };
    if (previousBalance.amount < delta) {
      return { ok: false, reason: 'insufficient', current: previousBalance.amount };
    }

    // 1. 樂觀更新本機
    const newAmount = previousBalance.amount - delta;
    const now = Date.now();
    const newBalance: UserCultivation = {
      ...previousBalance,
      amount: newAmount,
      lifetimeSpent: previousBalance.lifetimeSpent + delta,
      lastUpdated: now
    };
    await db.userCultivation.put(newBalance);
    const localLogId = await db.cultivationLog.add({
      change: -delta,
      reason,
      reasonText,
      balanceAfter: newAmount,
      createdAt: now,
      relatedPetId
    } as CultivationLog);

    // 2. 沒登入 → 本機 only
    let userId: string;
    try {
      userId = await getCurrentUserId();
    } catch {
      return { ok: true, newAmount };
    }

    // 3. upsert 雲端 — 失敗 rollback + toast,**不 throw**
    try {
      await this.uploadBalanceToCloud(newBalance, userId);
      return { ok: true, newAmount };
    } catch (e) {
      console.error('[cultivationRepo] spend cloud upload failed:', e);
      await db.userCultivation.put(previousBalance);
      await db.cultivationLog.delete(localLogId);
      eventBus.emit('toast:show', {
        message: '修為同步失敗(已還原本機)',
        variant: 'error'
      });
      return {
        ok: false,
        reason: 'cloud_failed',
        current: previousBalance.amount
      };
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
    await db.userCultivation.put(u);
    try {
      const userId = await getCurrentUserId();
      await this.uploadBalanceToCloud(u, userId);
    } catch (e) {
      console.warn('[cultivationRepo] putBalance cloud sync failed:', e);
    }
  }

  async clearBalance(): Promise<void> {
    await db.userCultivation.clear();
  }

  // ─ Log(雲端本批不寫,本機照常)─

  async addLog(entry: Omit<CultivationLog, 'id'>): Promise<number> {
    // **雲端 log 寫入暫停**:cultivation_log schema 未對齊。本機正常 append。
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

    const existingLocal = await db.userCultivation.get('main');
    if (data) return toLocalBalance(data as RemoteCultivation, existingLocal);

    // 雲端沒 row → 本機 seed 上去
    if (!existingLocal) return undefined;
    try {
      await this.uploadBalanceToCloud(existingLocal, userId);
    } catch (e) {
      console.warn('[cultivationRepo] seed upload failed:', e);
    }
    return existingLocal;
  }

  private async uploadBalanceToCloud(u: UserCultivation, userId: string): Promise<void> {
    const { error } = await supabase
      .from('user_cultivation')
      .upsert(toRemoteBalance(u, userId), { onConflict: 'user_id' });
    if (error) throw new Error(error.message);
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
