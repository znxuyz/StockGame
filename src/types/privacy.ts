/**
 * 階段 5E:隱私設定 + 公開持倉 + 排行榜 + 神獸借展 types。
 * 對應 supabase/migrations/20260512_stage5e_portfolio_loans.sql。
 */

export type PortfolioVisibility = 'hidden' | 'partial' | 'full';

export interface UserPrivacySettings {
  userId: string;
  portfolioAmountVisibility: PortfolioVisibility;
  showDailyReturn: boolean;
  showTotalReturn: boolean;
  joinLeaderboard: boolean;
  autoPublishSummon: boolean;
  autoPublishRealmUp: boolean;
  autoPublishTitleUp: boolean;
  autoPublishStreak: boolean;
  autoPublishEternal: boolean;
  updatedAt: string;
}

/** 預設值 — 隱私優先,新用戶看不到金額但其他功能全開 */
export const DEFAULT_PRIVACY: Omit<UserPrivacySettings, 'userId' | 'updatedAt'> = {
  portfolioAmountVisibility: 'hidden',
  showDailyReturn: true,
  showTotalReturn: true,
  joinLeaderboard: true,
  autoPublishSummon: true,
  autoPublishRealmUp: true,
  autoPublishTitleUp: true,
  autoPublishStreak: true,
  autoPublishEternal: true
};

export interface PortfolioSummaryItem {
  userId: string;
  stockCode: string;
  stockName: string;
  /** 0-100,該檔佔總市值的 % */
  portfolioWeight: number;
  investedAmount: number;
  currentValue: number;
  unrealizedPnl: number;
  /** -1~大 0.x 的比例(e.g. 0.155 = +15.5%) */
  returnPercent: number;
  dailyReturnPercent: number;
  updatedAt: string;
}

/** UI 顯示用:已套用對方隱私(金額遮罩 / 報酬率隱藏)後的物件 */
export interface FriendPortfolioItem {
  stockCode: string;
  stockName: string;
  portfolioWeight: number;
  /** 字串而非數字:已套用遮罩(可能為 '---' / '1*****7' / '1,234,567') */
  investedAmountText: string;
  currentValueText: string;
  unrealizedPnlText: string;
  /** 0-1 的比例,UI 自己 format;若對方關閉 → null */
  returnPercent: number | null;
  dailyReturnPercent: number | null;
}

export interface LeaderboardSnapshot {
  id: number;
  userId: string;
  snapshotDate: string;
  totalReturnPercent: number;
  dailyReturnPercent: number;
  totalValue: number;
  totalInvested: number;
  createdAt: string;
}

export type LeaderboardCategory = 'daily' | 'total';

export interface LeaderboardEntry {
  userId: string;
  rank: number;
  nickname: string;
  avatarCreatureId: string | null;
  titleName: string;
  titleEmoji: string;
  /** 隨 category 不同;若該玩家未參加排行榜 = null */
  value: number | null;
  /** 是否自己 */
  isMe: boolean;
  /** 是否參加排行榜(沒參加 → 灰色) */
  joinLeaderboard: boolean;
}

// ─── 神獸借展 ───────────────────────────────────────────

export type LoanStatus = 'active' | 'returned' | 'cancelled';

export interface CreatureLoan {
  id: number;
  lenderUserId: string;
  borrowerUserId: string;
  creatureSpeciesId: string;
  status: LoanStatus;
  loanedAt: string;
  returnsAt: string;
  returnedAt: string | null;
  lenderRewardGiven: boolean;
  borrowerRewardGiven: boolean;
}

/** 借展期間 24 小時,雙方獎勵 100 修為 */
export const LOAN_DURATION_MS = 24 * 60 * 60 * 1000;
export const LOAN_REWARD = 100;
export const MAX_ACTIVE_LOANS_LENT = 3;
export const MAX_ACTIVE_LOANS_BORROWED = 3;
