/**
 * 階段 5B:好友個人頁資料抓取 + 圖鑑對比 + 我 vs 他統計。
 *
 * 全部從 Supabase 公開表讀(user_profile / user_showcase / user_creature_summary /
 * user_milestones)。RLS 已開讀寫分離,讀放給所有登入用戶。
 *
 * 設計取捨:
 *  - cache 30 秒避免頻繁請求(同一玩家短時間切回個人頁不重抓)
 *  - 對方刪帳號(cascade auth.users) → user_profile 拿不到 row → 回 null,UI 提示
 *  - 自己被對方封鎖目前無法在 client 偵測(blocked_users RLS 只讓自己看自己 blocker)
 *    這需要 server-side function 才能查,MVP 先省略
 */

import { petRepo } from '@/repositories/petRepo';
import { supabase, isCloudConfigured } from '@/lib/supabase';
import { getProfile } from './profileService';
import { getShowcase } from './showcaseService';
import { getTitle } from './titleService';
import { realmRank } from './petTier';
import type {
  CreatureSummary,
  UserMilestone,
  UserProfile,
  UserShowcase,
  SoulRealmId,
  MilestoneEventType,
  MilestoneEventData
} from '@/types';

interface CreatureSummaryRow {
  user_id: string;
  creature_species_id: string;
  is_eternal: boolean;
  highest_realm: SoulRealmId;
  highest_level: number;
  first_summoned_at: string;
  updated_at: string;
}

interface MilestoneRow {
  id: number;
  user_id: string;
  event_type: MilestoneEventType;
  event_data: MilestoneEventData | null;
  occurred_at: string;
}

function rowToSummary(row: CreatureSummaryRow): CreatureSummary {
  return {
    userId: row.user_id,
    creatureSpeciesId: row.creature_species_id,
    isEternal: row.is_eternal,
    highestRealm: row.highest_realm,
    highestLevel: row.highest_level,
    firstSummonedAt: row.first_summoned_at,
    updatedAt: row.updated_at
  };
}

function rowToMilestone(row: MilestoneRow): UserMilestone {
  return {
    id: row.id,
    userId: row.user_id,
    eventType: row.event_type,
    eventData: row.event_data ?? {},
    occurredAt: row.occurred_at
  };
}

// ─── 30 秒快取(key = `${kind}:${userId}`) ──────────────
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { ts: number; value: unknown }>();

function readCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

function writeCache(key: string, value: unknown): void {
  cache.set(key, { ts: Date.now(), value });
}

export function clearFriendProfileCache(userId?: string): void {
  if (!userId) {
    cache.clear();
    return;
  }
  for (const k of cache.keys()) {
    if (k.endsWith(`:${userId}`)) cache.delete(k);
  }
}

// ─── 公開 API ───────────────────────────────────────────

export async function getFriendCreatures(userId: string): Promise<CreatureSummary[]> {
  if (!isCloudConfigured) return [];
  const key = `creatures:${userId}`;
  const cached = readCache<CreatureSummary[]>(key);
  if (cached) return cached;

  const { data, error } = await supabase
    .from('user_creature_summary')
    .select('*')
    .eq('user_id', userId);
  if (error || !data) {
    if (error) console.warn('[friendProfileService] getFriendCreatures:', error.message);
    return [];
  }
  const out = (data as CreatureSummaryRow[]).map(rowToSummary);
  writeCache(key, out);
  return out;
}

export async function getFriendShowcase(userId: string): Promise<UserShowcase | null> {
  const key = `showcase:${userId}`;
  const cached = readCache<UserShowcase | null>(key);
  if (cached !== null) return cached;
  const sc = await getShowcase(userId);
  writeCache(key, sc);
  return sc;
}

export async function getFriendMilestones(
  userId: string,
  limit = 10,
  offset = 0
): Promise<UserMilestone[]> {
  if (!isCloudConfigured) return [];
  const { data, error } = await supabase
    .from('user_milestones')
    .select('*')
    .eq('user_id', userId)
    .order('occurred_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error || !data) {
    if (error) console.warn('[friendProfileService] getFriendMilestones:', error.message);
    return [];
  }
  return (data as MilestoneRow[]).map(rowToMilestone);
}

/**
 * 撈對方雲端 user_data.blob 裡的修為總額 / lifetime / streak / 任務完成數,
 * 給「我 vs 他」對比用。失敗回 null 不擋主流程。
 */
export interface FriendCloudStats {
  cultivation: number | null;
  lifetimeEarned: number | null;
  consecutiveDays: number | null;
  longestStreak: number | null;
}

export async function getFriendCloudStats(userId: string): Promise<FriendCloudStats> {
  const empty: FriendCloudStats = {
    cultivation: null,
    lifetimeEarned: null,
    consecutiveDays: null,
    longestStreak: null
  };
  if (!isCloudConfigured) return empty;
  const key = `stats:${userId}`;
  const cached = readCache<FriendCloudStats>(key);
  if (cached) return cached;

  const { data, error } = await supabase
    .from('user_data')
    .select('blob')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data?.blob) {
    if (error) console.warn('[friendProfileService] getFriendCloudStats:', error.message);
    writeCache(key, empty);
    return empty;
  }
  const blob = data.blob as Record<string, unknown>;
  const cult = blob.userCultivation as
    | { amount?: number; lifetimeEarned?: number }
    | undefined
    | null;
  const streak = blob.userLoginStreak as
    | { currentStreak?: number; longestStreak?: number }
    | undefined
    | null;
  const out: FriendCloudStats = {
    cultivation: cult?.amount ?? null,
    lifetimeEarned: cult?.lifetimeEarned ?? null,
    consecutiveDays: streak?.currentStreak ?? null,
    longestStreak: streak?.longestStreak ?? null
  };
  writeCache(key, out);
  return out;
}

export interface FriendFullProfile {
  profile: UserProfile;
  showcase: UserShowcase | null;
  creatures: CreatureSummary[];
  milestones: UserMilestone[];
  cloudStats: FriendCloudStats;
}

/**
 * 一次性並行抓對方完整檔案。profile 拿不到視同「找不到此用戶」,return null。
 * 其他子查失敗 → 仍 return,讓 UI 顯示部分資料。
 */
export async function getFriendFullProfile(userId: string): Promise<FriendFullProfile | null> {
  const profile = await getProfile(userId);
  if (!profile) return null;

  const [showcase, creatures, milestones, cloudStats] = await Promise.all([
    getFriendShowcase(userId),
    getFriendCreatures(userId),
    getFriendMilestones(userId, 10, 0),
    getFriendCloudStats(userId)
  ]);

  return { profile, showcase, creatures, milestones, cloudStats };
}

// ─── 圖鑑對比 + 我 vs 他統計 ────────────────────────────

export type CodexEntryStatus = 'both' | 'me_only' | 'them_only' | 'neither';

export interface CodexEntry {
  creatureSpeciesId: string;
  status: CodexEntryStatus;
  myEternal: boolean;
  theirEternal: boolean;
  /** 對方該神獸的最高境界(只有 status='both' / 'them_only' 時有值) */
  theirRealm?: SoulRealmId;
  theirLevel?: number;
}

export interface CodexComparisonSummary {
  myOwned: number;
  theirOwned: number;
  bothOwned: number;
  total: number;
}

/**
 * 圖鑑對比:把本地 `db.pets` distinct speciesId + 對方 creatures summary
 * 對 50 隻 CREATURES 做交集 / 差集,給 CodexComparison UI 上 4 種顏色用。
 */
export async function getCodexComparison(
  friendCreatures: CreatureSummary[],
  allCreatureIds: string[]
): Promise<{ entries: CodexEntry[]; summary: CodexComparisonSummary }> {
  const myPets = await petRepo.list();
  const myOwnedIds = new Set(myPets.map((p) => p.speciesId));
  const myEternalIds = new Set(myPets.filter((p) => p.isEternal).map((p) => p.speciesId));

  const theirMap = new Map<string, CreatureSummary>();
  for (const c of friendCreatures) theirMap.set(c.creatureSpeciesId, c);

  let myOwned = 0;
  let theirOwned = friendCreatures.length;
  let bothOwned = 0;

  const entries: CodexEntry[] = allCreatureIds.map((id) => {
    const mine = myOwnedIds.has(id);
    const theirs = theirMap.has(id);
    if (mine) myOwned++;
    if (mine && theirs) bothOwned++;
    const theirSummary = theirMap.get(id);
    const status: CodexEntryStatus = mine && theirs ? 'both' : mine ? 'me_only' : theirs ? 'them_only' : 'neither';
    return {
      creatureSpeciesId: id,
      status,
      myEternal: myEternalIds.has(id),
      theirEternal: theirSummary?.isEternal ?? false,
      theirRealm: theirSummary?.highestRealm,
      theirLevel: theirSummary?.highestLevel
    };
  });

  return {
    entries,
    summary: {
      myOwned,
      theirOwned,
      bothOwned,
      total: allCreatureIds.length
    }
  };
}

// ─── 我 vs 他對比表 ──────────────────────────────────────

export interface VsMetric {
  label: string;
  me: number;
  them: number;
  format?: (n: number) => string;
}

export async function getMyVsTheirMetrics(
  friend: FriendFullProfile,
  myCultivationLifetime: number,
  myCultivationCurrent: number,
  myConsecutiveDays: number,
  totalCreatures: number,
  allCreatureIds: string[]
): Promise<VsMetric[]> {
  const myPets = await petRepo.list();
  const mySpecies = new Set(myPets.map((p) => p.speciesId));
  const myEternals = new Set(myPets.filter((p) => p.isEternal).map((p) => p.speciesId));
  void allCreatureIds; // 預留:之後可顯示圖鑑進度條
  void myCultivationLifetime;

  const theirEternals = friend.creatures.filter((c) => c.isEternal).length;
  const theirOwned = friend.creatures.length;

  return [
    {
      label: '💎 修為',
      me: myCultivationCurrent,
      them: friend.cloudStats.cultivation ?? 0,
      format: (n) => n.toLocaleString()
    },
    {
      label: '🐾 神獸',
      me: mySpecies.size,
      them: theirOwned,
      format: (n) => `${n} 隻`
    },
    {
      label: '📚 圖鑑',
      me: mySpecies.size,
      them: theirOwned,
      format: (n) => `${n} / ${totalCreatures}`
    },
    {
      label: '🔥 連登',
      me: myConsecutiveDays,
      them: friend.cloudStats.consecutiveDays ?? 0,
      format: (n) => `${n} 天`
    },
    {
      label: '✨ 永恆',
      me: myEternals.size,
      them: theirEternals,
      format: (n) => `${n} 隻`
    }
  ];
}

// 給單元測試 / dev tool 用
export const _internal = { rowToSummary, rowToMilestone, realmRank, getTitle };
