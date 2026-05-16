/**
 * 階段 3D 批 3b — `petRepo`:cloud-first 列表類 + tx-aware + frame-write 防呆。
 *
 * 沿用 transactionRepo 模板:stale-while-revalidate + 樂觀更新 + 白名單。
 *
 * Pet.id 本機 string uuid = 雲端 uuid,**1-to-1 mapping,不需 cloudId**。
 *
 * ──────────── 雲端 vs 本機欄位範圍 ────────────
 *
 *  ✅ 上雲(`pets` 表 + uuid PK + RLS by user_id)— `CLOUD_FIELDS` 白名單:
 *     - id                  ← Pet.id (uuid)
 *     - user_id             ← 從 auth.getSession()
 *     - code
 *     - species_id          ← Pet.speciesId
 *     - level
 *     - custom_name         ← Pet.customName(undefined → null)
 *     - born_at             ← Pet.bornAt(unix ms → ISO timestamptz)
 *     - retired_at          ← Pet.retiredAt(undefined → null;在世 = null)
 *     - color_variant       ← Pet.colorVariant(undefined → 'default')
 *     - boosted_days        ← Pet.boostedDays(undefined → 0)
 *     - effect_boost_until  ← Pet.effectBoostUntil(undefined → null)
 *     - is_eternal          ← Pet.isEternal(undefined → false)
 *     - eternal_date        ← Pet.eternalDate(undefined → null)
 *     - final_effect        ← Pet.finalEffect(undefined → null)
 *
 *  ❌ **不上雲**(純 UI 狀態 — PhaserMap 變動時即時寫,跨裝置重算成本低,
 *     避免每幀打雲端):
 *     - lastRealmCheck      上次境界檢查值
 *     - lastEffectCheck     上次魂環特效檢查值
 *
 *  注意:Supabase pets 表保留這 2 個 column 不刪(spec 講的,以後可能想存)。
 *  寫入策略 — `patch()` 偵測 partial 是否只含 non-CLOUD field;若是 → 純本機,
 *  完全不打雲端。PhaserMap 的 `patch({ lastRealmCheck })` 走這條,zero cloud cost。
 *
 * ──────────── tx-detection ────────────
 *
 *  portfolio.ts buyOrFeed/sell 在 `db.transaction('rw', ...)` 內呼叫
 *  `petRepo.put`(line 158/185/307/330)。Dexie tx body 不允許 await 非 Dexie
 *  promise → 同 holdingRepo / transactionRepo 處理:
 *  - cachedUserId(module-level 同步可讀)
 *  - tx 內 → tx.on('complete') 跑 fire-and-forget cloud sync(失敗 toast,
 *    不能 rollback 因 tx 已 commit)
 *  - tx 外 → optimistic + cloud upsert + rollback + toast
 *
 * ──────────── UNIQUE (user_id, custom_name) constraint ────────────
 *
 *  雲端 pets 有 UNIQUE (user_id, custom_name) 且 NULLS NOT DISTINCT。
 *  本機多隻 customName=null 的 pets 一次性 seed 上雲時,第二筆 onwards 會撞
 *  違反。修法:**seed 改 per-pet 個別 upsert(非 batch)**,失敗的單獨記錄
 *  console.warn,不阻斷其他 pets。其他寫入(單筆 put)正常 toast。
 *
 *  若大量撞牆,user 會收到 console + toast 提示,可改 schema 為 NULLS DISTINCT。
 */

import { useLiveQuery } from 'dexie-react-hooks';
import Dexie from 'dexie';
import { db } from '@/db';
import { supabase, isCloudConfigured } from '@/lib/supabase';
import { eventBus } from '@/services/eventBus';
import type { Pet, PetColorVariant } from '@/types';
import type { RingEffect } from '@/services/petTier';

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

// ─── Pet 雲端欄位白名單 ─────────────────────────────

/**
 * patch() 檢查 partial 是否含這些 key 的任一個 — 若無(只有 lastRealmCheck /
 * lastEffectCheck 之類純 UI state),完全不打雲端,zero cloud cost。
 */
const CLOUD_FIELDS_OF_PET: ReadonlySet<keyof Pet> = new Set([
  'id',
  'code',
  'speciesId',
  'level',
  'customName',
  'bornAt',
  'retiredAt',
  'colorVariant',
  'boostedDays',
  'effectBoostUntil',
  'isEternal',
  'eternalDate',
  'finalEffect'
]);

function partialTouchesCloud(partial: Partial<Pet>): boolean {
  for (const key of Object.keys(partial) as Array<keyof Pet>) {
    if (CLOUD_FIELDS_OF_PET.has(key)) return true;
  }
  return false;
}

// ─── 公開 interface(舊方法保留,新加 getByCode / listRetired)──

export interface PetRepository {
  count(): Promise<number>;
  countBySpecies(speciesId: string): Promise<number>;
  get(id: string): Promise<Pet | undefined>;
  /** 階段 3D 批 3b 加 — 雖然 spec 列為 getByCode,interface 沿用 dot.notation */
  getByCode(code: string): Promise<Pet | undefined>;
  list(): Promise<Pet[]>;
  listActive(): Promise<Pet[]>;
  /** 階段 3D 批 3b 加 — 已退役神獸(retiredAt 有值) */
  listRetired(): Promise<Pet[]>;
  put(pet: Pet): Promise<void>;
  bulkPut(pets: Pet[]): Promise<void>;
  patch(id: string, partial: Partial<Pet>): Promise<void>;
  clear(): Promise<void>;
}

// ─── 雲端 ↔ 本機 mapper ──────────────────────────────

interface RemotePet {
  id: string;
  user_id: string;
  code: string;
  species_id: string;
  level: number;
  custom_name: string | null;
  born_at: string; // ISO timestamptz
  retired_at: string | null;
  color_variant: PetColorVariant;
  boosted_days: number;
  effect_boost_until: string | null;
  is_eternal: boolean;
  eternal_date: string | null;
  final_effect: RingEffect | null;
  // 雲端 schema 仍保留 last_realm_check / last_effect_check column,但這檔
  // 不送、不讀(純本機 UI 狀態)。SELECT * 拿到時忽略。
}

function toLocal(remote: RemotePet, existing: Pet | undefined): Pet {
  return {
    id: remote.id,
    code: remote.code,
    speciesId: remote.species_id,
    level: remote.level,
    customName: remote.custom_name ?? undefined,
    bornAt: Date.parse(remote.born_at),
    retiredAt: remote.retired_at ? Date.parse(remote.retired_at) : undefined,
    colorVariant: remote.color_variant,
    boostedDays: remote.boosted_days,
    effectBoostUntil: remote.effect_boost_until
      ? Date.parse(remote.effect_boost_until)
      : undefined,
    isEternal: remote.is_eternal,
    eternalDate: remote.eternal_date ? Date.parse(remote.eternal_date) : undefined,
    finalEffect: remote.final_effect ?? undefined,
    // 純本機 UI 狀態:保留既有值(雲端不存)
    lastRealmCheck: existing?.lastRealmCheck,
    lastEffectCheck: existing?.lastEffectCheck
  };
}

function toRemote(local: Pet, userId: string): RemotePet {
  return {
    id: local.id,
    user_id: userId,
    code: local.code,
    species_id: local.speciesId,
    level: local.level,
    custom_name: local.customName ?? null, // undefined / 空字串 → null
    born_at: new Date(local.bornAt).toISOString(),
    retired_at: local.retiredAt ? new Date(local.retiredAt).toISOString() : null,
    color_variant: local.colorVariant ?? 'default',
    boosted_days: local.boostedDays ?? 0,
    effect_boost_until: local.effectBoostUntil
      ? new Date(local.effectBoostUntil).toISOString()
      : null,
    is_eternal: local.isEternal ?? false,
    eternal_date: local.eternalDate ? new Date(local.eternalDate).toISOString() : null,
    final_effect: local.finalEffect ?? null
  };
}

// ─── Dexie-only impl(dev fallback)─────────────────

class DexiePetRepo implements PetRepository {
  count(): Promise<number> {
    return db.pets.count();
  }
  countBySpecies(speciesId: string): Promise<number> {
    return db.pets.where('speciesId').equals(speciesId).count();
  }
  get(id: string): Promise<Pet | undefined> {
    return db.pets.get(id);
  }
  async getByCode(code: string): Promise<Pet | undefined> {
    return db.pets.where('code').equals(code).first();
  }
  list(): Promise<Pet[]> {
    return db.pets.toArray();
  }
  listActive(): Promise<Pet[]> {
    return db.pets.filter((p) => !p.retiredAt).toArray();
  }
  listRetired(): Promise<Pet[]> {
    return db.pets.filter((p) => !!p.retiredAt).toArray();
  }
  async put(pet: Pet): Promise<void> {
    await db.pets.put(pet);
  }
  async bulkPut(pets: Pet[]): Promise<void> {
    await db.pets.bulkPut(pets);
  }
  async patch(id: string, partial: Partial<Pet>): Promise<void> {
    await db.pets.update(id, partial);
  }
  async clear(): Promise<void> {
    await db.pets.clear();
  }
}

// ─── Cloud-first impl ──────────────────────────────

const REVALIDATE_INTERVAL_MS = 10_000;
let lastRevalidateAt = 0;

class CloudFirstPetRepo implements PetRepository {
  count(): Promise<number> {
    return db.pets.count();
  }

  countBySpecies(speciesId: string): Promise<number> {
    return db.pets.where('speciesId').equals(speciesId).count();
  }

  get(id: string): Promise<Pet | undefined> {
    return db.pets.get(id);
  }

  getByCode(code: string): Promise<Pet | undefined> {
    return db.pets.where('code').equals(code).first();
  }

  async list(): Promise<Pet[]> {
    try {
      const local = await db.pets.toArray();
      void this.scheduleRevalidate();
      return local;
    } catch (e) {
      console.error('[petRepo] list failed:', e);
      return [];
    }
  }

  async listActive(): Promise<Pet[]> {
    try {
      const local = await db.pets.filter((p) => !p.retiredAt).toArray();
      void this.scheduleRevalidate();
      return local;
    } catch (e) {
      console.error('[petRepo] listActive failed:', e);
      return [];
    }
  }

  async listRetired(): Promise<Pet[]> {
    try {
      const local = await db.pets.filter((p) => !!p.retiredAt).toArray();
      void this.scheduleRevalidate();
      return local;
    } catch (e) {
      console.error('[petRepo] listRetired failed:', e);
      return [];
    }
  }

  async put(pet: Pet): Promise<void> {
    const previous = await db.pets.get(pet.id);

    // 1. 樂觀更新本機(總是)
    await db.pets.put(pet);

    // 2. tx-detection — portfolio.ts buyOrFeed/sell 包過
    const dexieTx = Dexie.currentTransaction;
    if (dexieTx) {
      const userId = cachedUserId;
      if (!userId) return;
      dexieTx.on('complete', () => {
        void this.uploadOne(pet, userId).catch((e) => {
          console.warn('[petRepo] in-tx cloud upload failed:', e);
          eventBus.emit('toast:show', {
            message: '神獸雲端同步失敗(本機已更新)',
            variant: 'error'
          });
        });
      });
      return;
    }

    // 3. tx 外:完整 optimistic + cloud upsert + rollback + toast
    const userId = await getCurrentUserIdAsync();
    if (!userId) return;

    try {
      await this.uploadOne(pet, userId);
    } catch (e) {
      console.error('[petRepo] cloud upload failed:', e);
      if (previous) {
        await db.pets.put(previous);
      } else {
        await db.pets.delete(pet.id);
      }
      eventBus.emit('toast:show', {
        message: '神獸同步失敗(已還原本機)',
        variant: 'error'
      });
    }
  }

  async bulkPut(pets: Pet[]): Promise<void> {
    // cloudSync legacy pull-then-write — 純本機,不 push 回雲端
    await db.pets.bulkPut(pets);
  }

  async patch(id: string, partial: Partial<Pet>): Promise<void> {
    const local = await db.pets.get(id);
    if (!local) return;

    // 1. 樂觀本機 update
    await db.pets.update(id, partial);

    // 2. **若 partial 只含 non-CLOUD field(如 PhaserMap 的 lastRealmCheck /
    //    lastEffectCheck),完全不打雲端** — zero cloud cost,規避 frame-write 災難
    if (!partialTouchesCloud(partial)) {
      return;
    }

    // 3. 含 cloud field → 跟 put 同套 tx-aware
    const merged: Pet = { ...local, ...partial };
    const dexieTx = Dexie.currentTransaction;
    if (dexieTx) {
      const userId = cachedUserId;
      if (!userId) return;
      dexieTx.on('complete', () => {
        void this.uploadOne(merged, userId).catch((e) => {
          console.warn('[petRepo] in-tx patch cloud sync failed:', e);
          eventBus.emit('toast:show', {
            message: '神獸雲端同步失敗(本機已更新)',
            variant: 'error'
          });
        });
      });
      return;
    }

    const userId = await getCurrentUserIdAsync();
    if (!userId) return;

    try {
      await this.uploadOne(merged, userId);
    } catch (e) {
      console.error('[petRepo] patch cloud upload failed:', e);
      // rollback partial(把舊欄位寫回去)
      await db.pets.update(id, local as Partial<Pet>);
      eventBus.emit('toast:show', {
        message: '神獸同步失敗(已還原本機)',
        variant: 'error'
      });
    }
  }

  async clear(): Promise<void> {
    await db.pets.clear();
    // 雲端不主動 delete(換裝置仍能拉回)
  }

  // ─ private ─

  private async uploadOne(pet: Pet, userId: string): Promise<void> {
    const { error } = await supabase
      .from('pets')
      .upsert(toRemote(pet, userId), { onConflict: 'id' });
    // **23505 修正**:之前 swallow 全部 23505 視為 OK,但 NULLS NOT DISTINCT
    // 撞 UNIQUE (user_id, custom_name) 也是 23505 — 真實同步失敗變看不見。
    // 改 only swallow when conflict 是預期的(by PK id,upsert 該成功),其他
    // 一律 throw 給 caller 處理 rollback / toast。
    if (error) throw new Error(`${error.code ?? '?'} ${error.message}`);
  }

  /**
   * Seed 用 per-pet 個別 upsert,不批次 — 避免某筆撞 UNIQUE (user_id, custom_name)
   * NULLS NOT DISTINCT 把整批失敗。每筆失敗都會收集 + 印 console + toast,
   * 不再 silent swallow 23505。
   */
  private async seedFromLocal(local: Pet[], userId: string): Promise<void> {
    const failed: { id: string; reason: string }[] = [];
    let ok = 0;
    for (const pet of local) {
      try {
        const { error } = await supabase
          .from('pets')
          .upsert(toRemote(pet, userId), { onConflict: 'id' });
        if (error) {
          failed.push({
            id: `${pet.id} (code=${pet.code}, customName=${pet.customName ?? 'null'})`,
            reason: `${error.code ?? '?'} ${error.message}`
          });
        } else {
          ok++;
        }
      } catch (e) {
        failed.push({
          id: `${pet.id} (code=${pet.code}, customName=${pet.customName ?? 'null'})`,
          reason: e instanceof Error ? e.message : String(e)
        });
      }
    }
    if (failed.length > 0) {
      console.warn(
        `[petRepo] self-heal 不完整:本機 ${local.length} 隻,上傳成功 ${ok},失敗 ${failed.length}`
      );
      for (const f of failed) {
        console.warn(`[petRepo] self-heal 失敗 ${f.id}: ${f.reason}`);
      }
      eventBus.emit('toast:show', {
        message: `${failed.length} 隻神獸雲端同步失敗(看 console)`,
        variant: 'error'
      });
    }
  }

  private async scheduleRevalidate(): Promise<void> {
    const now = Date.now();
    if (now - lastRevalidateAt < REVALIDATE_INTERVAL_MS) return;

    // **Bug A 修正**:throttle 標記延後到 userId 取得之後再蓋,
    // 避免 boot race 把 throttle 吃掉導致 seed 永遠跑不到(同 holdingRepo)。
    const userId = cachedUserId;
    if (!userId) return;
    lastRevalidateAt = now;

    try {
      const { data, error } = await supabase
        .from('pets')
        .select('*')
        .eq('user_id', userId);
      if (error) throw new Error(error.message);
      if (!data) return;

      if (data.length === 0) {
        // 雲端空 + 本機有 → seed(per-pet,UNIQUE 友善)
        const local = await db.pets.toArray();
        if (local.length > 0) {
          await this.seedFromLocal(local, userId);
          // 驗證雲端筆數(可能撞 UNIQUE constraint 只進部分)
          const { count, error: cntErr } = await supabase
            .from('pets')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);
          if (!cntErr && count !== null && count !== local.length) {
            console.warn(
              `[petRepo] self-heal 結束驗證:本機 ${local.length} 隻,雲端 ${count} 隻(不一致,可能撞 custom_name UNIQUE)`
            );
          }
        }
        return;
      }

      // 雲端有 → bulkPut 進本機(by uuid id idempotent;merge with existing
      // 保留 lastRealmCheck / lastEffectCheck 純本機 UI 欄位)
      const localById = new Map<string, Pet>();
      for (const p of await db.pets.toArray()) localById.set(p.id, p);

      const localEntries = (data as RemotePet[]).map((r) => toLocal(r, localById.get(r.id)));
      await db.pets.bulkPut(localEntries);
    } catch (e) {
      console.warn('[petRepo] revalidate failed:', e);
    }
  }
}

// ─── factory + singleton ─────────────────────────────

export const petRepo: PetRepository = isCloudConfigured
  ? new CloudFirstPetRepo()
  : new DexiePetRepo();

export function useAllPets(): Pet[] | undefined {
  return useLiveQuery(() => petRepo.list(), []);
}

export function useActivePets(): Pet[] | undefined {
  return useLiveQuery(() => petRepo.listActive(), []);
}

export const dexiePetsTable = db.pets;
