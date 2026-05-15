/**
 * 階段 3D 批 1 — `loginStreakRepo`:Singleton row + 雲端為主 + 本機快取。
 *
 * 沿用 settingsRepo 模板:
 *  - `get` stale-while-revalidate(throttle 10s)+ 整段包 try/catch 永不 throw
 *  - `put` / `patch` 樂觀更新本機 + cloud upsert + rollback;沒登入時本機-only
 *  - factory:`isCloudConfigured` → `CloudFirstLoginStreakRepo`,否則 dev fallback
 *
 * ──────────── 雲端 vs 本機欄位範圍 ────────────
 *
 *  ✅ 上雲(`user_login_streak` 表):
 *     - currentStreak / longestStreak
 *     - lastLoginDate / todayClaimed
 *     - lifetimeLogins
 *
 *  ❌ 不上雲:
 *     - id(本機 singleton 主鍵 'main',雲端用 user_id 取代)
 *     - updatedAt(本機同步時間戳,給 stale-while-revalidate 比 updated_at 用)
 *
 * ⚠️ 在 toRemote 加新欄位前,必先在 Supabase `user_login_streak` 表 ALTER ADD COLUMN
 *    (否則 PostgREST schema cache 找不到欄位,寫入 throw — 同 settingsRepo 雷)
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { supabase, isCloudConfigured } from '@/lib/supabase';
import type { LoginStreak } from '@/types';

// ─── 公開 interface(不變)─────────────────────────────

export interface LoginStreakRepository {
  get(): Promise<LoginStreak | undefined>;
  put(s: LoginStreak): Promise<void>;
  /** partial update:取現有 → merge → put */
  patch(partial: Partial<LoginStreak>): Promise<void>;
  clear(): Promise<void>;
}

// ─── helper:取目前 user_id ────────────────────────────

async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(`auth.getSession 失敗:${error.message}`);
  const uid = data.session?.user?.id;
  if (!uid) throw new Error('未登入');
  return uid;
}

// ─── 雲端 ↔ 本機 mapper ──────────────────────────────

interface RemoteLoginStreak {
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_login_date: string;
  today_claimed: boolean;
  lifetime_logins: number;
  updated_at: string; // ISO timestamptz
}

function toLocal(remote: RemoteLoginStreak): LoginStreak {
  return {
    id: 'main',
    currentStreak: remote.current_streak,
    longestStreak: remote.longest_streak,
    lastLoginDate: remote.last_login_date,
    todayClaimed: remote.today_claimed,
    lifetimeLogins: remote.lifetime_logins,
    updatedAt: new Date(remote.updated_at).getTime()
  };
}

function toRemote(
  local: LoginStreak,
  userId: string
): Omit<RemoteLoginStreak, 'updated_at'> {
  return {
    user_id: userId,
    current_streak: local.currentStreak,
    longest_streak: local.longestStreak,
    last_login_date: local.lastLoginDate,
    today_claimed: local.todayClaimed,
    lifetime_logins: local.lifetimeLogins
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

    await db.userLoginStreak.put(stamped);

    let userId: string;
    try {
      userId = await getCurrentUserId();
    } catch (e) {
      console.warn(
        '[loginStreakRepo] not signed in — local-only write, will sync after sign-in:',
        e
      );
      return;
    }

    try {
      await this.uploadToCloud(stamped, userId);
    } catch (e) {
      if (previous) {
        await db.userLoginStreak.put(previous);
      } else {
        await db.userLoginStreak.delete('main');
      }
      throw new Error(
        `連登紀錄同步失敗,請重試:${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  async patch(partial: Partial<LoginStreak>): Promise<void> {
    const current = await db.userLoginStreak.get('main');
    if (!current) return;
    await this.put({ ...current, ...partial });
  }

  async clear(): Promise<void> {
    await db.userLoginStreak.clear();
    // 雲端不主動 delete — 只是本機 cache 清掉。Supabase row 留著(換裝置仍能拉回)
  }

  // ─ private ─

  private async scheduleRevalidate(local: LoginStreak | undefined): Promise<void> {
    const now = Date.now();
    if (now - lastRevalidateAt < REVALIDATE_INTERVAL_MS) return;
    lastRevalidateAt = now;

    try {
      const remote = await this.fetchFromCloud();
      if (!remote) return;

      const localUpdatedAt = local?.updatedAt ?? 0;
      if (remote.updatedAt && remote.updatedAt > localUpdatedAt) {
        await db.userLoginStreak.put(remote);
      } else if (local && localUpdatedAt > (remote.updatedAt ?? 0)) {
        console.warn(
          `[loginStreakRepo] local newer than cloud (local=${localUpdatedAt} > cloud=${remote.updatedAt}), reconcile deferred`
        );
      }
    } catch (e) {
      console.warn('[loginStreakRepo] revalidate failed:', e);
    }
  }

  /**
   * 雲端拉。沒 row(舊用戶,trigger 沒回填)→ 本機資料 seed 上去。
   * 完全沒本機也沒雲端 → undefined。
   */
  private async fetchFromCloud(): Promise<LoginStreak | undefined> {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase
      .from('user_login_streak')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return toLocal(data as RemoteLoginStreak);

    const existingLocal = await db.userLoginStreak.get('main');
    if (!existingLocal) return undefined;
    const stamped: LoginStreak = { ...existingLocal, updatedAt: Date.now() };
    await this.uploadToCloud(stamped, userId);
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

/** Dexie transactional escape hatch — 只給 cloudSync.ts 用(階段 3D 改寫後消失) */
export const dexieLoginStreakTable = db.userLoginStreak;
