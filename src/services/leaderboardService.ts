/**
 * 階段 5E:好友報酬率排行榜。
 *
 * 設計取捨:
 *  - 沒有 Supabase scheduled function,改在 client 端「打開排行 tab 時」
 *    觸發自己的 daily snapshot(`generateMySnapshot`,upsert today)
 *  - 排行讀「最近一筆 snapshot」per friend(可能各人不同日,但好友圈通常 OK)
 *  - cache 1 分鐘避免短時間頻繁打 db
 *  - 自己永遠看得到自己排名(joinLeaderboard=false 也有 rank,但不含對方視野)
 *  - 沒參加排行(joinLeaderboard=false)的好友依然顯示但 value=null + 灰色
 */

import { supabase, isCloudConfigured } from '@/lib/supabase';
import { computeSummary } from './summary';
import { getProfilesByIds } from './profileService';
import { getTitle } from './titleService';
import type {
  LeaderboardCategory,
  LeaderboardEntry,
  LeaderboardSnapshot
} from '@/types';

interface SnapshotRow {
  id: number;
  user_id: string;
  snapshot_date: string;
  total_return_percent: number;
  daily_return_percent: number;
  total_value: number;
  total_invested: number;
  created_at: string;
}

function rowToSnapshot(row: SnapshotRow): LeaderboardSnapshot {
  return {
    id: row.id,
    userId: row.user_id,
    snapshotDate: row.snapshot_date,
    totalReturnPercent: row.total_return_percent,
    dailyReturnPercent: row.daily_return_percent,
    totalValue: row.total_value,
    totalInvested: row.total_invested,
    createdAt: row.created_at
  };
}

async function getCurrentUserId(): Promise<string | null> {
  if (!isCloudConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const CACHE_TTL_MS = 60_000;
let cachedDaily: { ts: number; entries: LeaderboardEntry[] } | null = null;
let cachedTotal: { ts: number; entries: LeaderboardEntry[] } | null = null;

export function clearLeaderboardCache(): void {
  cachedDaily = null;
  cachedTotal = null;
}

/** 把本地 summary 算出來 → upsert 今日 snapshot */
export async function generateMySnapshot(): Promise<{ ok: boolean }> {
  if (!isCloudConfigured) return { ok: false };
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false };

  const summary = await computeSummary();
  const { error } = await supabase.from('leaderboard_snapshots').upsert(
    {
      user_id: userId,
      snapshot_date: todayDateStr(),
      total_return_percent: clamp(summary.returnRate, -999.9999, 999.9999),
      daily_return_percent: clamp(summary.todayReturnRate, -999.9999, 999.9999),
      total_value: Math.round(summary.totalMarketValue),
      total_invested: Math.round(summary.totalCost)
    },
    { onConflict: 'user_id,snapshot_date' }
  );
  if (error) {
    console.warn('[leaderboard] generateMySnapshot:', error.message);
    return { ok: false };
  }
  return { ok: true };
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(min, n));
}

/**
 * 撈好友排行榜:好友 + 自己,每人取最近一筆 snapshot。
 *  - category='daily' → 依 daily_return_percent 排
 *  - category='total' → 依 total_return_percent 排
 *  - joinLeaderboard=false 的 user 仍出現在列表但 value=null,排在最後
 *  - 我自己一律出現(即使我關了 joinLeaderboard)
 */
export async function getLeaderboard(
  category: LeaderboardCategory
): Promise<LeaderboardEntry[]> {
  if (!isCloudConfigured) return [];
  const cache = category === 'daily' ? cachedDaily : cachedTotal;
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.entries;

  const me = await getCurrentUserId();
  if (!me) return [];

  // 進入排行頁順手更新自己的 snapshot
  await generateMySnapshot();

  // 撈好友
  const { data: friendsRows } = await supabase
    .from('friends')
    .select('user_a, user_b')
    .or(`user_a.eq.${me},user_b.eq.${me}`);
  const friendIds = (friendsRows ?? []).map((r) =>
    r.user_a === me ? r.user_b : r.user_a
  ) as string[];
  const candidateIds = Array.from(new Set([me, ...friendIds]));

  // 撈每人最近 snapshot(各人各取自己最新一筆)
  // Supabase 沒 distinct on,改用「全撈 + 在 client 端 group by user_id 取最新」
  const { data: snapshotRows } = await supabase
    .from('leaderboard_snapshots')
    .select('*')
    .in('user_id', candidateIds)
    .order('snapshot_date', { ascending: false });

  const latestByUser = new Map<string, LeaderboardSnapshot>();
  for (const row of (snapshotRows as SnapshotRow[]) ?? []) {
    if (!latestByUser.has(row.user_id)) {
      latestByUser.set(row.user_id, rowToSnapshot(row));
    }
  }

  // 撈隱私設定 + profiles + 修為(供稱號)
  const [{ data: privacyRows }, profiles, { data: blobRows }] = await Promise.all([
    supabase.from('user_privacy_settings').select('*').in('user_id', candidateIds),
    getProfilesByIds(candidateIds),
    supabase.from('user_data').select('user_id, blob').in('user_id', candidateIds)
  ]);

  // 排行榜只需要 joinLeaderboard 一個欄位,直接 narrow 成簡單 map
  const privacyMap = new Map<string, { joinLeaderboard: boolean }>();
  for (const row of (privacyRows as Record<string, unknown>[]) ?? []) {
    privacyMap.set(row.user_id as string, {
      joinLeaderboard: row.join_leaderboard as boolean
    });
  }
  const lifetimeMap = new Map<string, number>();
  for (const row of (blobRows as { user_id: string; blob: Record<string, unknown> | null }[]) ?? []) {
    const blob = row.blob ?? {};
    const cult = blob.userCultivation as { lifetimeEarned?: number } | null | undefined;
    if (typeof cult?.lifetimeEarned === 'number') {
      lifetimeMap.set(row.user_id, cult.lifetimeEarned);
    }
  }

  // 組 entry + 排序
  const raw = candidateIds.map<LeaderboardEntry>((uid) => {
    const profile = profiles.get(uid);
    const privacy = privacyMap.get(uid);
    const isMe = uid === me;
    // 對方 joinLeaderboard=false 且不是自己 → 不參加
    const joinLb = privacy?.joinLeaderboard ?? true;
    const snap = latestByUser.get(uid);
    let value: number | null = null;
    if (snap) {
      if (!joinLb && !isMe) {
        value = null;
      } else {
        value = category === 'daily' ? snap.dailyReturnPercent : snap.totalReturnPercent;
      }
    }
    const title = getTitle(lifetimeMap.get(uid) ?? 0);
    return {
      userId: uid,
      rank: 0, // 排序後填
      nickname: profile?.nickname ?? (isMe ? '你' : '修仙者'),
      avatarCreatureId: profile?.avatarCreatureId ?? null,
      titleName: title.name,
      titleEmoji: title.emoji,
      value,
      isMe,
      joinLeaderboard: joinLb
    };
  });

  // 排序:有 value 的依 value desc,沒 value 的(未參加 / 沒 snapshot)放後面
  raw.sort((a, b) => {
    if (a.value === null && b.value === null) return 0;
    if (a.value === null) return 1;
    if (b.value === null) return -1;
    return b.value - a.value;
  });
  raw.forEach((e, i) => {
    e.rank = i + 1;
  });

  if (category === 'daily') cachedDaily = { ts: Date.now(), entries: raw };
  else cachedTotal = { ts: Date.now(), entries: raw };

  return raw;
}

/**
 * 階段 5E.x:完整排行榜 + 自己排名(改版 2:獨立入口 + 完整可滾動)。
 *
 *  - fullList:**完整排序好的列表**(含自己 + 全部好友 + joinLeaderboard=false 也在)
 *    UI 自己滾動瀏覽,玩家可以找到自己「真實位置」
 *  - self.rank:1-based 排名;沒 entry 時 null
 *  - self.hasData:有任何 snapshot 資料才 true
 *  - self.isParticipating:joinLeaderboard 設定
 *  - 移除 isInTopList(改版 2:不論是否在 top,都 sticky 顯示自己)
 *
 * 共用 getLeaderboard 1 分鐘 cache。
 */
export interface LeaderboardWithSelf {
  fullList: LeaderboardEntry[];
  totalCount: number;
  self: {
    /** 1-based rank;沒 entry 時 null */
    rank: number | null;
    entry: LeaderboardEntry | null;
    hasData: boolean;
    isParticipating: boolean;
  };
}

export async function getLeaderboardWithSelf(
  category: LeaderboardCategory
): Promise<LeaderboardWithSelf> {
  const all = await getLeaderboard(category);
  const me = await getCurrentUserId();
  const myIdx = me ? all.findIndex((e) => e.userId === me) : -1;
  const myEntry = myIdx >= 0 ? all[myIdx] : null;
  const myRank = myIdx >= 0 ? myIdx + 1 : null;

  return {
    fullList: all,
    totalCount: all.length,
    self: {
      rank: myRank,
      entry: myEntry,
      hasData: myEntry !== null && myEntry.value !== null,
      isParticipating: myEntry?.joinLeaderboard ?? true
    }
  };
}
