import type { UserProfile } from './profile';

/**
 * 階段 5A:好友系統 — 雙向好友 row(對應 SQL friends 表)。
 * row 內 user_a 永遠 < user_b 統一方向避免重複(SQL constraint)。
 */
export interface FriendRow {
  id: number;
  userA: string;
  userB: string;
  createdAt: string;
}

/**
 * UI 用:把對方 profile 攤平,直接給 FriendsModal 渲染。
 */
export interface FriendEntry {
  friendshipId: number;
  /** 對方的 user_id */
  userId: string;
  profile: UserProfile;
  /** 對方雲端同步的修為總額(從 user_data.blob 撈,可能 null) */
  cultivation: number | null;
  /** 對方累計登入天數(從 user_data.blob 撈,可能 null) */
  cultivationDays: number | null;
  createdAt: string;
}

export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected';

export interface FriendRequestRow {
  id: number;
  fromUser: string;
  toUser: string;
  status: FriendRequestStatus;
  createdAt: string;
  updatedAt: string;
}

/** UI 用:含發起人 / 接受人對應 profile */
export interface FriendRequestEntry {
  id: number;
  fromUser: string;
  toUser: string;
  status: FriendRequestStatus;
  /** 對方(發送方向相反者)的 profile */
  otherProfile: UserProfile;
  /** 對方雲端同步的修為總額(可能 null) */
  cultivation: number | null;
  createdAt: string;
}

export interface BlockedUserRow {
  id: number;
  blocker: string;
  blocked: string;
  createdAt: string;
}
