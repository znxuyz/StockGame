/**
 * 階段 3D 批 2 — `creatureUnlockRepo`:列表類 cloud-first(stale-while-revalidate
 * + 樂觀更新 + 白名單)。
 *
 * 圖鑑故事解鎖永久,append-only。本機 `&creatureId` Dexie 唯一索引 + 雲端
 * `(user_id, creature_id)` 複合 PK 雙重防重。
 *
 * **不 rollback on 雲端失敗** — 玩家已扣 100 修為,本機解鎖必須保留。雲端
 * 失敗只 toast「同步失敗,本機已解鎖」。
 *
 * ──────────── 雲端 vs 本機欄位範圍 ────────────
 *
 *  ✅ 上雲(`creature_unlocks` 表 + (user_id, creature_id) 複合 PK):
 *     - user_id
 *     - creature_id   ← CreatureUnlock.creatureId
 *     - unlocked_at   ← CreatureUnlock.unlockedAt(unix ms → timestamptz)
 *
 *  ❌ 不上雲(本機限定):
 *     - id  — Dexie auto-increment,純本機(雲端用 composite PK 不需要)
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { supabase, isCloudConfigured } from '@/lib/supabase';
import { reportCloudWriteFailure } from '@/lib/pendingSync';
import type { CreatureUnlock } from '@/types';

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

export interface CreatureUnlockRepository {
  list(): Promise<CreatureUnlock[]>;
  count(): Promise<number>;
  getByCreatureId(creatureId: string): Promise<CreatureUnlock | undefined>;
  add(u: Omit<CreatureUnlock, 'id'>): Promise<number>;
  clear(): Promise<void>;
}

// ─── 雲端 ↔ 本機 mapper ──────────────────────────────

interface RemoteCreatureUnlock {
  user_id: string;
  creature_id: string;
  unlocked_at: string; // ISO timestamptz
}

function toLocal(remote: RemoteCreatureUnlock): Omit<CreatureUnlock, 'id'> {
  return {
    creatureId: remote.creature_id,
    unlockedAt: Date.parse(remote.unlocked_at)
  };
}

function toRemote(local: Omit<CreatureUnlock, 'id'>, userId: string): RemoteCreatureUnlock {
  return {
    user_id: userId,
    creature_id: local.creatureId,
    unlocked_at: new Date(local.unlockedAt).toISOString()
  };
}

// ─── Dexie-only impl(dev fallback)─────────────────

class DexieCreatureUnlockRepo implements CreatureUnlockRepository {
  list(): Promise<CreatureUnlock[]> {
    return db.creatureUnlocks.toArray();
  }
  count(): Promise<number> {
    return db.creatureUnlocks.count();
  }
  getByCreatureId(creatureId: string): Promise<CreatureUnlock | undefined> {
    return db.creatureUnlocks.where('creatureId').equals(creatureId).first();
  }
  async add(u: Omit<CreatureUnlock, 'id'>): Promise<number> {
    return db.creatureUnlocks.add(u as CreatureUnlock);
  }
  async clear(): Promise<void> {
    await db.creatureUnlocks.clear();
  }
}

// ─── Cloud-first impl ──────────────────────────────

const REVALIDATE_INTERVAL_MS = 10_000;
let lastRevalidateAt = 0;

class CloudFirstCreatureUnlockRepo implements CreatureUnlockRepository {
  async list(): Promise<CreatureUnlock[]> {
    try {
      const local = await db.creatureUnlocks.toArray();
      void this.scheduleRevalidate();
      return local;
    } catch (e) {
      console.error('[creatureUnlockRepo] list failed:', e);
      return [];
    }
  }

  count(): Promise<number> {
    return db.creatureUnlocks.count();
  }

  getByCreatureId(creatureId: string): Promise<CreatureUnlock | undefined> {
    return db.creatureUnlocks.where('creatureId').equals(creatureId).first();
  }

  async add(u: Omit<CreatureUnlock, 'id'>): Promise<number> {
    // 1. 樂觀本機 add(&creatureId 唯一索引,race 時 throw → 維持既有 service catch 語意)
    const localId = await db.creatureUnlocks.add(u as CreatureUnlock);

    // 2. 沒 auth → 本機-only
    const userId = await getCurrentUserId();
    if (!userId) return localId;

    // 3. cloud insert — 玩家已扣修為,**不 rollback** 本機,失敗只 toast
    try {
      const { error } = await supabase
        .from('creature_unlocks')
        .insert(toRemote(u, userId));
      // 雲端 unique violation(另一裝置已寫入)→ idempotent success,不 toast
      if (error && error.code !== '23505') {
        throw new Error(error.message);
      }
    } catch (e) {
      reportCloudWriteFailure('圖鑑解鎖', e);
    }

    return localId;
  }

  async clear(): Promise<void> {
    await db.creatureUnlocks.clear();
    // 雲端不主動 delete(換裝置仍能拉回)
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
        .from('creature_unlocks')
        .select('*')
        .eq('user_id', userId);
      if (error) throw new Error(error.message);
      if (!data) return;

      if (data.length === 0) {
        // 雲端空 → 本機 seed 上去
        const local = await db.creatureUnlocks.toArray();
        if (local.length > 0) {
          const rows = local.map((u) => toRemote(u, userId));
          // 用 upsert 避免本機已有 cloud 寫過的 entry(race / 過渡期重複)
          const { error: upErr } = await supabase
            .from('creature_unlocks')
            .upsert(rows, { onConflict: 'user_id,creature_id' });
          if (upErr) throw new Error(upErr.message);
        }
        return;
      }

      // 雲端有資料 → 拉進本機(用 creatureId 做 dedup,本機 &creatureId 唯一索引
      // 會擋掉重複 add — 用 try/catch 包個別 add 才不會整批中斷)
      for (const row of data as RemoteCreatureUnlock[]) {
        const existing = await db.creatureUnlocks
          .where('creatureId')
          .equals(row.creature_id)
          .first();
        if (existing) continue; // 本機已有,跳過
        try {
          await db.creatureUnlocks.add(toLocal(row) as CreatureUnlock);
        } catch {
          // race / 唯一索引衝突 — 跳過該筆
        }
      }
    } catch (e) {
      console.warn('[creatureUnlockRepo] revalidate failed:', e);
    }
  }
}

// ─── factory + singleton ─────────────────────────────

export const creatureUnlockRepo: CreatureUnlockRepository = isCloudConfigured
  ? new CloudFirstCreatureUnlockRepo()
  : new DexieCreatureUnlockRepo();

export function useCreatureUnlocks(): CreatureUnlock[] | undefined {
  return useLiveQuery(() => creatureUnlockRepo.list(), []);
}
