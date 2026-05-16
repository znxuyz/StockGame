/**
 * 階段 3D 緊急修復 — `loginStreakRepo`:白名單 toRemote + 寫失敗不 throw。
 *
 * 沿用 settingsRepo 白名單模式,只送雲端 schema 確實存在的欄位。
 *
 * ──────────── 雲端 vs 本機欄位範圍 ────────────
 *
 *  ✅ 上雲(`user_login_streak` 表;`toRemote` 白名單):
 *     - user_id
 *     - current_streak              ← LoginStreak.currentStreak
 *     - max_streak                  ← LoginStreak.longestStreak(雲端命名是 max_)
 *     - last_login_date             ← LoginStreak.lastLoginDate
 *     - today_claimed               ← LoginStreak.todayClaimed
 *     - updated_at(trigger 自動,不送)
 *
 *  ❌ 不上雲(本機 Dexie 才有,Supabase 表沒這些欄位 — 階段 3D 批 1 部署炸過):
 *     - lifetimeLogins              本機累計登入天數
 *     - id 'main'                   本機 singleton 主鍵
 *     - updatedAt                   本機同步時間戳(stale-while-revalidate 用)
 *
 *  ⚠️ 在 toRemote 加新欄位前,必先在 Supabase `user_login_streak` 表 ALTER 確認
 *     對應 column 存在,否則 PostgREST schema cache 找不到欄位 → 寫入失敗
 *     (但本檔已改成「寫失敗 toast 而非 throw」,不會把 App 搞癱)
 *
 * ──────────── 錯誤處理 ────────────
 *
 *  `put` / `patch`:雲端失敗 → console.error + 回滾本機 + emit toast:show 提示,
 *  **不 throw**。Caller 無感繼續執行。
 *
 *  `get`:外層 try/catch — 永遠不 throw,失敗回 local cache 或 undefined。
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { supabase, isCloudConfigured } from '@/lib/supabase';
import { eventBus } from '@/services/eventBus';
import type { LoginStreak } from '@/types';

// ─── 公開 interface(不變)─────────────────────────────

export interface LoginStreakRepository {
  get(): Promise<LoginStreak | undefined>;
  put(s: LoginStreak): Promise<void>;
  /** partial update:取現有 → merge → put */
  patch(partial: Partial<LoginStreak>): Promise<void>;
  clear(): Promise<void>;
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
 * 雲端 row 的 shape — 只列已知存在的欄位。
 * **不要加** lifetime_logins / consecutive_days 之類本機限定欄位
 * (PostgREST schema cache 找不到 → 寫入炸,前一次部署的根因)。
 */
interface RemoteLoginStreak {
  user_id: string;
  current_streak: number;
  max_streak: number;
  last_login_date: string;
  today_claimed: boolean;
  updated_at: string;
}

/** 雲端 → 本機。`existingLocal` 提供本機限定欄位的當前值 — merge 保留之 */
function toLocal(
  remote: RemoteLoginStreak,
  existingLocal: LoginStreak | undefined
): LoginStreak {
  const baseline: LoginStreak = existingLocal ?? {
    id: 'main',
    currentStreak: 1,
    longestStreak: 1,
    lastLoginDate: remote.last_login_date,
    todayClaimed: false,
    lifetimeLogins: 1
  };
  return {
    ...baseline,
    // 只覆蓋雲端有對應的欄位
    currentStreak: remote.current_streak,
    longestStreak: remote.max_streak,
    lastLoginDate: remote.last_login_date,
    todayClaimed: remote.today_claimed,
    updatedAt: new Date(remote.updated_at).getTime()
    // lifetimeLogins 保留 baseline 值(本機限定)
  };
}

/**
 * 本機 → 雲端 upsert payload。**白名單**:只送雲端 schema 有的欄位。
 * 千萬不要 spread local — 多餘欄位會撞「column not found」。
 */
function toRemote(
  local: LoginStreak,
  userId: string
): Omit<RemoteLoginStreak, 'updated_at'> {
  return {
    user_id: userId,
    current_streak: local.currentStreak,
    max_streak: local.longestStreak,
    last_login_date: local.lastLoginDate,
    today_claimed: local.todayClaimed
  };
}

// ─── Dexie-only impl(dev fallback)─────

class DexieLoginStreakRepo implements LoginStreakRepository {
  get(): Promise<LoginStreak | undefined> {
    return db.userLoginStreak.get('main');
  }
  async put(s: LoginStreak): Promise<void> {
    await db.userLoginStreak.put(s);
  }
  async patch(partial: Partial<LoginStreak>): Promise<void> {
    const current = await db.userLoginStreak.get('main');
    if (!current) return;
    await db.userLoginStreak.put({ ...current, ...partial });
  }
  async clear(): Promise<void> {
    await db.userLoginStreak.clear();
  }
}

// ─── Cloud-first impl ──────────────────

const REVALIDATE_INTERVAL_MS = 10_000;
let lastRevalidateAt = 0;

class CloudFirstLoginStreakRepo implements LoginStreakRepository {
  async get(): Promise<LoginStreak | undefined> {
    try {
      const local = await db.userLoginStreak.get('main');
      void this.scheduleRevalidate(local);
      if (local) return local;
      return await this.fetchFromCloud();
    } catch (e) {
      console.error('[loginStreakRepo] get failed, returning undefined:', e);
      return undefined;
    }
  }

  async put(s: LoginStreak): Promise<void> {
    const previous = await db.userLoginStreak.get('main');
    const stamped: LoginStreak = { ...s, updatedAt: Date.now() };

    // 1. 樂觀更新本機
    await db.userLoginStreak.put(stamped);

    // 2. 取 userId — 沒登入靜默 local-only
    let userId: string;
    try {
      userId = await getCurrentUserId();
    } catch {
      return;
    }

    // 3. upsert 雲端 — 失敗 console.error + rollback + toast,**不 throw**
    try {
      await this.uploadToCloud(stamped, userId);
    } catch (e) {
      console.error('[loginStreakRepo] cloud upload failed:', e);
      if (previous) {
        await db.userLoginStreak.put(previous);
      } else {
        await db.userLoginStreak.delete('main');
      }
      eventBus.emit('toast:show', {
        message: '連登資料同步失敗(已還原本機)',
        variant: 'error'
      });
    }
  }

  async patch(partial: Partial<LoginStreak>): Promise<void> {
    const current = await db.userLoginStreak.get('main');
    if (!current) return;
    await this.put({ ...current, ...partial });
  }

  async clear(): Promise<void> {
    await db.userLoginStreak.clear();
  }

  // ─ private ─

  private async scheduleRevalidate(local: LoginStreak | undefined): Promise<void> {
    const now = Date.now();
    if (now - lastRevalidateAt < REVALIDATE_INTERVAL_MS) return;

    // **Race fix**:throttle slot 同步 claim,auth 失敗才 release(見 cultivationRepo)
    lastRevalidateAt = now;
    try {
      await getCurrentUserId();
    } catch {
      lastRevalidateAt = 0;
      return;
    }

    try {
      const remote = await this.fetchFromCloud();
      if (!remote) return;
      const localUpdatedAt = local?.updatedAt ?? 0;
      if (remote.updatedAt && remote.updatedAt > localUpdatedAt) {
        await db.userLoginStreak.put(remote);
      }
    } catch (e) {
      console.warn('[loginStreakRepo] revalidate failed:', e);
    }
  }

  private async fetchFromCloud(): Promise<LoginStreak | undefined> {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase
      .from('user_login_streak')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const existingLocal = await db.userLoginStreak.get('main');
    if (data) return toLocal(data as RemoteLoginStreak, existingLocal);

    if (!existingLocal) return undefined;
    const stamped: LoginStreak = { ...existingLocal, updatedAt: Date.now() };
    // seed 上去;失敗只 warn,呼叫端仍回 baseline
    try {
      await this.uploadToCloud(stamped, userId);
    } catch (e) {
      console.warn('[loginStreakRepo] seed upload failed:', e);
    }
    return stamped;
  }

  private async uploadToCloud(s: LoginStreak, userId: string): Promise<void> {
    const { error } = await supabase
      .from('user_login_streak')
      .upsert(toRemote(s, userId), { onConflict: 'user_id' });
    if (error) throw new Error(error.message);
  }
}

// ─── factory + singleton ─────────────────────────────

export const loginStreakRepo: LoginStreakRepository = isCloudConfigured
  ? new CloudFirstLoginStreakRepo()
  : new DexieLoginStreakRepo();

export function useLoginStreak(): LoginStreak | undefined {
  return useLiveQuery(() => loginStreakRepo.get(), []);
}

/** Dexie transactional escape hatch — 只給 cloudSync.ts 用 */
export const dexieLoginStreakTable = db.userLoginStreak;
