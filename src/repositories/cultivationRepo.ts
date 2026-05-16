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
   * 緊急修法:雲端沒 `earn_cultivation` RPC,改成跟 spend() 同套(直接
   * upsert user_cultivation 表)。原本走 RPC 是想要 server-side 30 分鐘
   * dedup,但 RPC 從來沒部署上去(部署的是不同名稱 / 沒部署 SQL migration),
   * 每次領取都 404,使用者拿不到修為。
   *
   * 後續若想恢復 dedup:在 supabase migrations 加 `earn_cultivation` RPC
   * 並部署,**然後改回 RPC 版本**。在此之前用 upsert 保證至少功能正常。
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

    // 1. 樂觀更新本機(balance + log)
    const previousBalance = await db.userCultivation.get('main');
    const baseline: UserCultivation = previousBalance ?? {
      id: 'main',
      amount: 0,
      lifetimeEarned: 0,
      lifetimeSpent: 0,
      lastUpdated: Date.now()
    };
    const newAmount = baseline.amount + delta;
    const now = Date.now();
    const newBalance: UserCultivation = {
      ...baseline,
      amount: newAmount,
      lifetimeEarned: baseline.lifetimeEarned + delta,
      lastUpdated: now
    };
    await db.userCultivation.put(newBalance);
    const localLogId = await db.cultivationLog.add({
      change: delta,
      reason,
      reasonText,
      balanceAfter: newAmount,
      createdAt: now,
      relatedPetId
    } as CultivationLog);

    // 2. 沒登入 → 本機已寫,不上雲
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
      console.error('[cultivationRepo] earn cloud upload failed:', e);
      if (previousBalance) {
        await db.userCultivation.put(previousBalance);
      } else {
        await db.userCultivation.delete('main');
      }
      await db.cultivationLog.delete(localLogId);
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

    // **Race fix**:throttle slot 同步 claim — 多個 useLiveQuery 訂閱者(HUD +
    // 修為 tab 等)同 tick 內可能都通過 throttle check,各自跑 fetch/push
    // 同樣 cloud value → 噴 N 次 `推本機上雲` warning。先佔 slot,auth 失敗
    // 才 release 讓下次重試(Bug A boot race 仍然處理到)。
    lastRevalidateAt = now;

    let userId: string;
    try {
      userId = await getCurrentUserId();
    } catch {
      lastRevalidateAt = 0;
      return;
    }

    try {
      // 直接查雲端 raw row,不走 toLocalBalance(它會無條件覆寫 amount)
      const { data, error } = await supabase
        .from('user_cultivation')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new Error(error.message);

      // 情境 A:雲端**沒**這個 user 的 row → 本機若有資料,推上去 seed
      if (!data) {
        if (local && (local.amount > 0 || local.lifetimeEarned > 0 || local.lifetimeSpent > 0)) {
          try {
            await this.uploadBalanceToCloud(local, userId);
          } catch (e) {
            console.warn('[cultivationRepo] seed upload failed:', e);
          }
        }
        return;
      }

      const remote = data as RemoteCultivation;
      // **Bug C 修正**:偵測雲端 row 是「auto-default 空殼」(trigger 自動建立
      // 但沒寫過修為)。三欄全 0 + 本機有正值 → 本機才是真實資料,推回雲端,
      // 不要被 cloud 0 蓋掉。
      const cloudIsAutoDefault =
        remote.total_points === 0 &&
        remote.lifetime_earned === 0 &&
        remote.lifetime_spent === 0;
      const localHasData =
        !!local &&
        (local.amount > 0 || local.lifetimeEarned > 0 || local.lifetimeSpent > 0);

      if (cloudIsAutoDefault && localHasData) {
        console.warn(
          `[cultivationRepo] 雲端 row 是 auto-default 空殼(0/0/0),本機有資料 (${local.amount}/${local.lifetimeEarned}/${local.lifetimeSpent}) → 推本機上雲`
        );
        try {
          await this.uploadBalanceToCloud(local!, userId);
        } catch (e) {
          console.warn('[cultivationRepo] heal upload failed:', e);
        }
        return;
      }

      // 同理:雲端 lifetimeEarned 比本機**少** → 本機才是新,推上去
      // (lifetimeEarned 是 monotonic 只增不減,本機 > 雲端只可能是雲端被舊資料蓋掉)
      if (local && local.lifetimeEarned > remote.lifetime_earned) {
        console.warn(
          `[cultivationRepo] 本機 lifetimeEarned (${local.lifetimeEarned}) > 雲端 (${remote.lifetime_earned}) → 推本機上雲`
        );
        try {
          await this.uploadBalanceToCloud(local, userId);
        } catch (e) {
          console.warn('[cultivationRepo] heal-by-lifetime upload failed:', e);
        }
        return;
      }

      // 正常路徑:雲端較新 → 採用雲端
      const remoteLocal = toLocalBalance(remote, local);
      const localUpdated = local?.lastUpdated ?? 0;
      if (remoteLocal.lastUpdated > localUpdated) {
        await db.userCultivation.put(remoteLocal);
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
