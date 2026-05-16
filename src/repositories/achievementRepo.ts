/**
 * 階段 3D 批 2 — `achievementRepo`:列表類 cloud-first(stale-while-revalidate +
 * 樂觀更新 + 白名單)。
 *
 * 沿用 settingsRepo 模板。caller(`runAchievementChecks`)在 Dexie tx 外
 * 跑,**不用 tx-detection** 那套(跟 holdingRepo 不同)。
 *
 * ──────────── 雲端 vs 本機欄位範圍 ────────────
 *
 *  ✅ 上雲(`achievements` 表 + (user_id, achievement_id) 複合主鍵):
 *     - user_id
 *     - achievement_id    ← AchievementProgress.id
 *     - progress          ← AchievementProgress.current
 *     - unlocked_at       ← AchievementProgress.unlockedAt(unix ms → timestamptz;
 *                           local undefined → cloud null)
 *
 *  ❌ 沒有本機限定欄位 — AchievementProgress 只有 3 個欄位,全部上雲。
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { supabase, isCloudConfigured } from '@/lib/supabase';
import { eventBus } from '@/services/eventBus';
import type { AchievementProgress } from '@/types';

// ─── helper ──────────────────────────────────────────

async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

// ─── 公開 interface(不變)─────────────────────────────

export interface AchievementRepository {
  list(): Promise<AchievementProgress[]>;
  put(a: AchievementProgress): Promise<void>;
  bulkPut(a: AchievementProgress[]): Promise<void>;
  clear(): Promise<void>;
}

// ─── 雲端 ↔ 本機 mapper ──────────────────────────────

interface RemoteAchievement {
  user_id: string;
  achievement_id: string;
  progress: number;
  unlocked_at: string | null; // ISO timestamptz,nullable
}

function toLocal(remote: RemoteAchievement): AchievementProgress {
  return {
    id: remote.achievement_id,
    current: remote.progress,
    unlockedAt: remote.unlocked_at ? Date.parse(remote.unlocked_at) : undefined
  };
}

function toRemote(local: AchievementProgress, userId: string): RemoteAchievement {
  return {
    user_id: userId,
    achievement_id: local.id,
    progress: local.current,
    unlocked_at: local.unlockedAt ? new Date(local.unlockedAt).toISOString() : null
  };
}

// ─── Dexie-only impl(dev fallback)─────────────────

class DexieAchievementRepo implements AchievementRepository {
  list(): Promise<AchievementProgress[]> {
    return db.achievements.toArray();
  }
  async put(a: AchievementProgress): Promise<void> {
    await db.achievements.put(a);
  }
  async bulkPut(a: AchievementProgress[]): Promise<void> {
    await db.achievements.bulkPut(a);
  }
  async clear(): Promise<void> {
    await db.achievements.clear();
  }
}

// ─── Cloud-first impl ──────────────────────────────

const REVALIDATE_INTERVAL_MS = 10_000;
let lastRevalidateAt = 0;

class CloudFirstAchievementRepo implements AchievementRepository {
  async list(): Promise<AchievementProgress[]> {
    try {
      const local = await db.achievements.toArray();
      void this.scheduleRevalidate();
      return local;
    } catch (e) {
      console.error('[achievementRepo] list failed:', e);
      return [];
    }
  }

  async put(a: AchievementProgress): Promise<void> {
    const previous = await db.achievements.get(a.id);

    // 1. 樂觀更新本機
    await db.achievements.put(a);

    // 2. 沒登入 → 本機-only
    const userId = await getCurrentUserId();
    if (!userId) return;

    // 3. cloud upsert — 失敗 rollback + toast,不 throw
    try {
      const { error } = await supabase
        .from('achievements')
        .upsert(toRemote(a, userId), { onConflict: 'user_id,achievement_id' });
      if (error) throw new Error(error.message);
    } catch (e) {
      console.error('[achievementRepo] cloud upload failed:', e);
      if (previous) {
        await db.achievements.put(previous);
      } else {
        await db.achievements.delete(a.id);
      }
      eventBus.emit('toast:show', {
        message: '成就同步失敗(已還原本機)',
        variant: 'error'
      });
    }
  }

  async bulkPut(a: AchievementProgress[]): Promise<void> {
    // cloudSync legacy path,純本機(雲端是真實來源,不再 push 回去)
    await db.achievements.bulkPut(a);
  }

  async clear(): Promise<void> {
    await db.achievements.clear();
    // 雲端不主動 delete
  }

  // ─ private ─

  private async scheduleRevalidate(): Promise<void> {
    const now = Date.now();
    if (now - lastRevalidateAt < REVALIDATE_INTERVAL_MS) return;

    // **Race fix**:throttle slot 同步 claim,auth 失敗才 release(見 cultivationRepo)
    lastRevalidateAt = now;
    let userId: string | null;
    try {
      userId = await getCurrentUserId();
    } catch {
      lastRevalidateAt = 0;
      return;
    }
    if (!userId) {
      lastRevalidateAt = 0;
      return;
    }

    try {
      const { data, error } = await supabase
        .from('achievements')
        .select('*')
        .eq('user_id', userId);
      if (error) throw new Error(error.message);
      if (!data) return;

      if (data.length === 0) {
        // 雲端空 → 本機 seed 上去一次
        const local = await db.achievements.toArray();
        if (local.length > 0) {
          const rows = local.map((a) => toRemote(a, userId));
          const { error: upErr } = await supabase
            .from('achievements')
            .upsert(rows, { onConflict: 'user_id,achievement_id' });
          if (upErr) throw new Error(upErr.message);
        }
        return;
      }

      // 雲端有資料 → merge 進本機(保留本機-only 條目,過渡期保守)
      for (const row of data as RemoteAchievement[]) {
        await db.achievements.put(toLocal(row));
      }
    } catch (e) {
      console.warn('[achievementRepo] revalidate failed:', e);
    }
  }
}

// ─── factory + singleton ─────────────────────────────

export const achievementRepo: AchievementRepository = isCloudConfigured
  ? new CloudFirstAchievementRepo()
  : new DexieAchievementRepo();

export function useAchievements(): AchievementProgress[] | undefined {
  return useLiveQuery(() => achievementRepo.list(), []);
}

export const dexieAchievementsTable = db.achievements;
