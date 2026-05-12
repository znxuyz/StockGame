/**
 * 階段 5F:站內通知 + 推播訂閱 types。
 * 對應 supabase/migrations/20260512_stage5f_notifications.sql。
 */

export type NotificationType =
  | 'friend_request'
  | 'friend_accepted'
  | 'feed_like'
  | 'feed_comment'
  | 'loan_received'
  | 'loan_returning'
  | 'loan_returned'
  | 'rank_changed'
  | 'achievement'
  | 'system';

export interface NotificationRelatedData {
  /** friend_request / friend_accepted / loan_received → 對方 user_id */
  fromUserId?: string;
  fromNickname?: string;
  /** feed_like / feed_comment → 動態 id */
  feedEventId?: number;
  /** feed_comment 摘要(<=30 字) */
  commentExcerpt?: string;
  /** loan_received / loan_returning / loan_returned 用 */
  loanId?: number;
  creatureSpeciesId?: string;
  creatureName?: string;
  /** rank_changed 用 */
  rank?: number;
  /** achievement 用 */
  achievementName?: string;
}

export interface AppNotification {
  id: number;
  userId: string;
  notificationType: NotificationType;
  title: string;
  message: string;
  fromUserId: string | null;
  relatedData: NotificationRelatedData;
  isRead: boolean;
  isPushed: boolean;
  createdAt: string;
  readAt: string | null;
}

export interface PushSubscriptionRow {
  id: number;
  userId: string;
  endpoint: string;
  /** browser 端 PushSubscription.toJSON().keys.p256dh */
  p256dhKey: string;
  /** browser 端 PushSubscription.toJSON().keys.auth */
  authKey: string;
  userAgent: string | null;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string;
}

/** 通知偏好(來自 user_privacy_settings 擴充欄位) */
export interface NotificationPreferences {
  pushEnabled: boolean;
  notifyFriendRequest: boolean;
  notifyFeedLike: boolean;
  notifyFeedComment: boolean;
  notifyLoan: boolean;
  notifyRank: boolean;
  notifyAchievement: boolean;
  /** 'HH:MM' 格式 */
  quietHoursStart: string;
  quietHoursEnd: string;
}

/** 預設通知偏好 */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  pushEnabled: true,
  notifyFriendRequest: true,
  notifyFeedLike: true,
  notifyFeedComment: true,
  notifyLoan: true,
  notifyRank: false,
  notifyAchievement: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00'
};
