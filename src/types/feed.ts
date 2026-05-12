/**
 * 階段 5D:動態牆 events / likes / comments。
 *
 * 對應 Supabase 表(`supabase/migrations/20260512_stage5d_feed.sql`)。
 * 全部讀依好友關係限制,寫只能寫自己 — 由 RLS 保證。
 */

import type { SoulRealmId } from './showcase';

export type FeedEventType =
  | 'summon'
  | 'creature_realm_up'
  | 'title_up'
  | 'streak_milestone'
  | 'eternal'
  | 'cultivation_share';

/** 自動觸發類 / 手動發文類 event_data 的 union(都用 jsonb 存) */
export interface FeedEventData {
  // 自動類
  creatureSpeciesId?: string;
  creatureName?: string;
  fromRealm?: SoulRealmId;
  toRealm?: SoulRealmId;
  fromRealmLabel?: string;
  toRealmLabel?: string;
  fromTitle?: string;
  toTitle?: string;
  /** streak_milestone 用 */
  days?: number;
  // 手動 cultivation_share 用
  content?: string;
  taggedCreatures?: string[];
  taggedStocks?: string[];
}

export interface FeedEvent {
  id: number;
  userId: string;
  eventType: FeedEventType;
  eventData: FeedEventData;
  occurredAt: string;
  isDeleted: boolean;
}

export interface FeedLike {
  eventId: number;
  userId: string;
  createdAt: string;
}

export interface FeedComment {
  id: number;
  eventId: number;
  userId: string;
  content: string;
  createdAt: string;
  isDeleted: boolean;
}

/** UI 用:含計數和「我有沒有按讚」 */
export interface FeedEventWithMeta extends FeedEvent {
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
}
