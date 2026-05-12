/**
 * 階段 5B:把本地事件同步到 Supabase 公開表(讓好友能看到)。
 *
 * 訂閱 eventBus 'cultivation:earn' / 'cultivation:spend',按 reason 分發:
 *   pet_added_codex   → 召喚新神獸 → upsert user_creature_summary + 寫 milestone 'summon'
 *   realm_breakthrough → 神獸境界突破 → update summary.highest_realm + 寫 'realm_up'
 *   streak_milestone  → 連登 7/14/30/60/100 → 寫 milestone 'streak'
 *   eternal           → 永恆紀念 → update summary.is_eternal + 寫 'eternal'
 *   (其他 reason) lifetime_earned 跨修仙稱號閾值 → 寫 'title_up'
 *
 * 設計取捨:
 *  - 每次 earn / spend 都拉「目前 pet + species + level + realm」算 highest;
 *    本地 IndexedDB 才知道 pet 詳情,Supabase 不存
 *  - upsert 用 (user_id, creature_species_id) 主鍵覆寫,防 race
 *  - 失敗只 console.warn,**不**重試 / queue — 本地仍是正確的,雲端公開資料失
 *    敗就晚一點補(下次事件觸發或 backfill)
 *  - 稱號升級判斷:earn 前後 lifetimeEarned 用 getTitle 比 id,跨閾值才寫
 */

import { db } from '@/db';
import { supabase, isCloudConfigured } from '@/lib/supabase';
import { eventBus } from './eventBus';
import { getRealm, realmLabel } from './petTier';
import { getTitle } from './titleService';
import { publishFeedEvent } from './feedEventService';
import { getCreature, getPetDisplayName } from '@/data/creatures';
import type {
  Pet,
  CultivationReason,
  MilestoneEventData,
  MilestoneEventType,
  SoulRealmId
} from '@/types';

/**
 * 階段 5D:哪些境界值得發到動態牆。
 * 凡 → 靈 / 靈 → 妖 太頻繁不發,只發升到 shen/sheng/xian。
 */
const FEED_PUBLISH_REALMS: SoulRealmId[] = ['shen', 'sheng', 'xian'];

let attached = false;
/** 之前那次 earn 的 lifetimeEarned 快照,給「稱號升級」判斷用 */
let lastLifetimeEarned: number | null = null;

async function getCurrentUserId(): Promise<string | null> {
  if (!isCloudConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

/**
 * 從本地 IndexedDB 算「指定 pet 當下的境界 / 等級」。
 * holding 撈不到時 fallback realm='fan' / level=1,讓 caller 至少寫得進去。
 */
async function getPetSnapshot(petId: string): Promise<{
  pet: Pet;
  realm: SoulRealmId;
  level: number;
} | null> {
  const pet = await db.pets.get(petId);
  if (!pet) return null;
  const holding = await db.holdings.get(pet.code).catch(() => undefined);
  if (!holding) {
    return { pet, realm: 'fan', level: 1 };
  }
  const monthsHeld =
    (Date.now() - holding.firstPurchasedAt) / (30 * 86_400_000) +
    (pet.boostedDays ?? 0) / 30;
  const realm = getRealm(monthsHeld);
  const level = Math.max(1, Math.floor(holding.totalCost / 1000) + 1);
  return { pet, realm, level };
}

async function recordMilestone(
  userId: string,
  eventType: MilestoneEventType,
  eventData: MilestoneEventData
): Promise<void> {
  const { error } = await supabase.from('user_milestones').insert({
    user_id: userId,
    event_type: eventType,
    event_data: eventData
  });
  if (error) {
    console.warn(`[profileSync] milestone insert (${eventType}) failed:`, error.message);
  }
}

/**
 * upsert user_creature_summary。Caller 已知 pet/species,我們只負責推算當下境界 +
 * 跟現有 row 比較 highest_realm / highest_level 取較高者寫回。
 *
 *  - eternalOverride=true 時強制 is_eternal=true(不會被舊 row 覆蓋掉)
 *  - 新 row 用 insert,衝突 onConflict=(user_id,creature_species_id) → update
 */
async function upsertCreatureSummary(
  userId: string,
  petId: string,
  options: { eternalOverride?: boolean } = {}
): Promise<void> {
  const snap = await getPetSnapshot(petId);
  if (!snap) return;
  const { pet, realm, level } = snap;

  // 先 select 舊 row,人工 max() 跟新值合併
  const { data: existing } = await supabase
    .from('user_creature_summary')
    .select('*')
    .eq('user_id', userId)
    .eq('creature_species_id', pet.speciesId)
    .maybeSingle();

  const realmOrder: SoulRealmId[] = ['fan', 'ling', 'yao', 'shen', 'sheng', 'xian'];
  const oldRealmIdx = existing?.highest_realm ? realmOrder.indexOf(existing.highest_realm) : -1;
  const newRealmIdx = realmOrder.indexOf(realm);
  const finalRealm = newRealmIdx > oldRealmIdx ? realm : (existing?.highest_realm as SoulRealmId);
  const finalLevel = Math.max(level, existing?.highest_level ?? 1);
  const finalEternal = options.eternalOverride || existing?.is_eternal || pet.isEternal || false;
  const firstSummonedAt = existing?.first_summoned_at ?? new Date(pet.bornAt).toISOString();

  const { error } = await supabase
    .from('user_creature_summary')
    .upsert(
      {
        user_id: userId,
        creature_species_id: pet.speciesId,
        is_eternal: finalEternal,
        highest_realm: finalRealm ?? 'fan',
        highest_level: finalLevel,
        first_summoned_at: firstSummonedAt
      },
      { onConflict: 'user_id,creature_species_id' }
    );
  if (error) {
    console.warn('[profileSync] upsertCreatureSummary failed:', error.message);
  }
}

/**
 * 接 cultivation:earn 事件,依 reason 分發。
 * 不 throw,所有失敗都 console.warn。
 */
async function handleEarn(payload: {
  reason: CultivationReason;
  reasonText: string;
  relatedPetId?: string;
  amount: number;
}): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;

  switch (payload.reason) {
    case 'pet_added_codex': {
      if (!payload.relatedPetId) return;
      const snap = await getPetSnapshot(payload.relatedPetId);
      if (!snap) return;
      await upsertCreatureSummary(userId, payload.relatedPetId);
      const species = getCreature(snap.pet.speciesId);
      const creatureName = getPetDisplayName(snap.pet, species);
      await recordMilestone(userId, 'summon', {
        creatureId: snap.pet.speciesId,
        creatureName
      });
      // 階段 5D:同步發到動態牆(5min dedup 內 caller 不需 worry 連續召喚刷牆)
      await publishFeedEvent('summon', {
        creatureSpeciesId: snap.pet.speciesId,
        creatureName
      });
      break;
    }
    case 'realm_breakthrough': {
      if (!payload.relatedPetId) return;
      const snap = await getPetSnapshot(payload.relatedPetId);
      if (!snap) return;
      await upsertCreatureSummary(userId, payload.relatedPetId);
      const species = getCreature(snap.pet.speciesId);
      const creatureName = getPetDisplayName(snap.pet, species);
      await recordMilestone(userId, 'realm_up', {
        creatureId: snap.pet.speciesId,
        creatureName,
        realm: snap.realm,
        realmLabel: realmLabel(snap.realm)
      });
      // 階段 5D:只在升到 shen/sheng/xian 三高階境界時發牆,凡靈妖太頻繁
      if (FEED_PUBLISH_REALMS.includes(snap.realm)) {
        await publishFeedEvent('creature_realm_up', {
          creatureSpeciesId: snap.pet.speciesId,
          creatureName,
          toRealm: snap.realm,
          toRealmLabel: realmLabel(snap.realm)
        });
      }
      break;
    }
    case 'streak_milestone': {
      // reasonText 如「連登 30 天里程碑」,從文字抓數字
      const match = /(\d+)/.exec(payload.reasonText);
      const days = match ? Number(match[1]) : payload.amount;
      await recordMilestone(userId, 'streak', { streakDays: days });
      // 階段 5D:同步動態牆
      await publishFeedEvent('streak_milestone', { days });
      break;
    }
    case 'pet_level_up': {
      // 升等只 upsert summary 把 highest_level 推上去,不寫 milestone(太頻繁)
      if (payload.relatedPetId) {
        await upsertCreatureSummary(userId, payload.relatedPetId);
      }
      break;
    }
    default:
      break;
  }

  // 不論 reason 為何,都檢查稱號是否升等(lifetime_earned 跨閾值)
  await maybeRecordTitleUp(userId);
}

async function handleSpend(payload: {
  reason: CultivationReason;
  reasonText: string;
  relatedPetId?: string;
}): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;

  if (payload.reason === 'eternal' && payload.relatedPetId) {
    const snap = await getPetSnapshot(payload.relatedPetId);
    if (!snap) return;
    await upsertCreatureSummary(userId, payload.relatedPetId, { eternalOverride: true });
    const species = getCreature(snap.pet.speciesId);
    const creatureName = getPetDisplayName(snap.pet, species);
    await recordMilestone(userId, 'eternal', {
      creatureId: snap.pet.speciesId,
      creatureName
    });
    // 階段 5D:永恆紀念是重大事件,一定發牆
    await publishFeedEvent('eternal', {
      creatureSpeciesId: snap.pet.speciesId,
      creatureName
    });
  }
}

/** lifetimeEarned 跨稱號閾值 → 寫 title_up milestone(只升不寫降) */
async function maybeRecordTitleUp(userId: string): Promise<void> {
  const cult = await db.userCultivation.get('main');
  if (!cult) return;
  const newLifetime = cult.lifetimeEarned;
  const newTitle = getTitle(newLifetime);
  const prevLifetime = lastLifetimeEarned;
  lastLifetimeEarned = newLifetime;

  if (prevLifetime === null) return; // 第一次比對 = baseline,不發
  const prevTitle = getTitle(prevLifetime);
  if (newTitle.id <= prevTitle.id) return;

  await recordMilestone(userId, 'title_up', {
    titleId: newTitle.id,
    titleName: newTitle.name
  });
  // 階段 5D:稱號升等也發牆(凡 → 渡劫 8 階,跨閾值頻率低,不需 dedup)
  await publishFeedEvent('title_up', {
    fromTitle: prevTitle.name,
    toTitle: newTitle.name
  });
}

/**
 * 註冊事件 listeners。回傳 detach 函式。
 * App.tsx 應在 mount 時呼叫一次,且只呼叫一次。
 */
export function attachProfileSyncListeners(): () => void {
  if (attached) return () => {};
  attached = true;

  const offEarn = eventBus.on('cultivation:earn', (payload) => {
    void handleEarn(payload).catch((e) => console.warn('[profileSync] earn handler:', e));
  });
  const offSpend = eventBus.on('cultivation:spend', (payload) => {
    void handleSpend(payload).catch((e) => console.warn('[profileSync] spend handler:', e));
  });

  return () => {
    offEarn();
    offSpend();
    attached = false;
  };
}

/**
 * 一次性 backfill:登入後若雲端 summary 為空,把本地全部 pet 寫上去。
 * 確保現有玩家立刻有公開資料。
 *
 *  - 用 select count 判斷「為空」
 *  - 撈所有本地 pets,bornAt 升序 upsert 一次(同 species 多隻會被 max() 合併)
 *  - 永恆 pet 一律 eternalOverride
 *  - 失敗逐筆 warn,不擋主流程
 *  - 順手把 lastLifetimeEarned baseline 設成「現在的 lifetime」,避免之後第一次
 *    earn 就誤判跨閾值
 */
export async function backfillProfileSync(): Promise<void> {
  if (!isCloudConfigured) return;
  const userId = await getCurrentUserId();
  if (!userId) return;

  // 設 baseline,後續才能正確判稱號升等
  const cult = await db.userCultivation.get('main');
  lastLifetimeEarned = cult?.lifetimeEarned ?? 0;

  // 判斷是否已 backfill 過(該 user 至少有一筆 summary 就跳過)
  const { count } = await supabase
    .from('user_creature_summary')
    .select('user_id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if ((count ?? 0) > 0) return;

  const pets = await db.pets.toArray();
  if (pets.length === 0) return;

  for (const pet of pets) {
    try {
      await upsertCreatureSummary(userId, pet.id, {
        eternalOverride: pet.isEternal === true
      });
    } catch (e) {
      console.warn(`[profileSync] backfill pet ${pet.id} failed:`, e);
    }
  }
}

// 給單元測試 / dev tool 用,別在 production 直接 import
export const _internal = {
  getPetSnapshot,
  recordMilestone,
  upsertCreatureSummary,
  maybeRecordTitleUp
};
