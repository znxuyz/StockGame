export { audio } from './audio';

export { buyOrFeed, sell } from './portfolio';
export type { BuyParams, SellParams, ActionResult } from './portfolio';

export { calculateLevel } from './evolution';
export {
  getRealm,
  realmLabel,
  realmRank,
  realmProgress,
  REALM_ORDER,
  REALM_THRESHOLD_MONTHS,
  REALM_COLOR,
  getRingEffect,
  effectLabel,
  upgradeEffect,
  EFFECT_ORDER,
  EFFECT_THRESHOLD,
  getPetStatus
} from './petTier';
export type { SoulRealm, RingEffect, PetStatus } from './petTier';

export {
  COLOR_VARIANT_TINT,
  COLOR_VARIANT_LABEL,
  COLOR_VARIANT_ORDER,
  COLOR_VARIANT_CSS
} from './petColor';

export { BACKGROUNDS, getBackgroundDef, bgTextureKey } from './background';
export type { BackgroundDef } from './background';

export { unlockCreatureStory, STORY_UNLOCK_COST } from './creatureUnlockService';
export type { UnlockResult } from './creatureUnlockService';

export { runPriceUpdate, describePriceUpdateError } from './priceUpdate';
export type { PriceUpdateResult } from './priceUpdate';

export { computeSummary, getHoldingDetail } from './summary';
export type { PortfolioSummary, HoldingDetail } from './summary';

export { recordDailySnapshot } from './snapshot';
export { backfillSnapshotsIfNeeded, resetBackfillFlag } from './snapshotBackfill';
export type { BackfillResult } from './snapshotBackfill';

// 階段 5H:歷史價快取 + 真實歷史快照重建(取代 snapshotBackfill 的 proxy 行為)
export {
  getHistoricalPrice,
  prefetchRange,
  getPriceMap,
  findPriceOnOrBefore
} from './historicalPriceService';
export { rebuildDailySnapshots, scheduleRebuildHistory } from './portfolioHistoryService';
export type { RebuildProgress, RebuildResult } from './portfolioHistoryService';
export {
  clearOldData,
  commitBackfilledTransactions,
  exportBackup,
  downloadBackupFile,
  newPendingTx
} from './historicalBackfillService';
export type {
  PendingTransaction,
  PendingTxType,
  CommitProgress,
  CommitResult
} from './historicalBackfillService';

// 階段 5G:Excel 批次匯入 — **不從 services/index re-export**,因為
// excelImportService 內 static import ExcelJS(~900KB)。re-export 會讓
// 主 bundle 把整包 ExcelJS 一起打包。改由 ExcelImportModal 直接 deep import
// services/excelImportService,搭配 React.lazy 把 ExcelJS 切到 modal 的
// lazy chunk 內(只有玩家點開 Excel 匯入才下載)
export { checkInLoginToday } from './login';
export { runAchievementChecks } from './achievements';
export type { AchievementCheckResult } from './achievements';

export {
  ensureTaiexHistory,
  updateTaiexIntraday,
  getAllTaiex,
  getLatestTaiex
} from './marketIndexUpdate';
export { getMarketCompare } from './marketCompare';
export type { MarketCompareDataPoint, MarketCompareResult } from './marketCompare';

export {
  getCultivationBalance,
  getCultivationDetail,
  earnCultivation,
  spendCultivation,
  getCultivationHistory
} from './cultivationService';
export type { CultivationDetail, SpendResult } from './cultivationService';

export { eventBus } from './eventBus';
export type {
  CultivationEarnEvent,
  CultivationSpendEvent,
  TaskCompletedEvent,
  EventMap
} from './eventBus';

export {
  checkAndUpdateStreak,
  claimTodayLogin,
  getLoginStreak,
  STREAK_MILESTONES
} from './loginStreakService';
export type { CheckResult, ClaimResult, MilestoneDef } from './loginStreakService';

export {
  incrementTaskProgress,
  claimTaskReward,
  getActiveTasks,
  checkAndGenerateDailyTasks,
  checkAndGenerateWeeklyTasks,
  emitTaskTrigger,
  attachTaskListeners
} from './taskService';
export type { ClaimTaskResult, ActiveTasks } from './taskService';

// 階段 5A:好友系統(身分層)
export {
  formatInviteCode,
  parseInviteCode,
  formatInviteCodeInput,
  generateUniqueInviteCode
} from './inviteCodeService';
export {
  getMyProfile,
  getProfile,
  getProfilesByIds,
  createProfileIfNeeded,
  updateProfile,
  updateLastSeen,
  generateDefaultNickname
} from './profileService';
export {
  searchByInviteCode,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
  removeFriend,
  blockUser,
  unblockUser,
  getFriends,
  getPendingRequests,
  getSentRequests
} from './friendService';
export type { SearchResult, SendRequestResult } from './friendService';
export {
  CULTIVATION_TITLES,
  getTitle,
  getNextTitle,
  titleProgress
} from './titleService';
export type { CultivationTitle } from './titleService';

// 階段 5C:月度戰績
export {
  getMonthlyStats,
  getAvailableMonths,
  getPreviousMonth,
  monthlyReviewKey,
  markMonthlyReviewShown,
  wasMonthlyReviewShown
} from './monthlyStatsService';

// 階段 5F:通知中心 + 推播
export {
  notify,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  subscribeToMyNotifications,
  cleanupOldNotifications
} from './notificationService';
export type { NotifyParams } from './notificationService';
export {
  isPushSupported,
  requestNotificationPermission,
  subscribePush,
  unsubscribePush,
  getCurrentSubscription
} from './pushService';
export type { PushSupportResult, PushSupportReason } from './pushService';

// 階段 5E:持倉隱私 + 排行榜 + 神獸借展
export { getMyPrivacy, getFriendPrivacy, updateMyPrivacy } from './privacyService';
export type { UpdatePrivacyInput } from './privacyService';
export { syncMyPortfolio, getFriendPortfolio } from './portfolioSyncService';
export { generateMySnapshot, getLeaderboard, getLeaderboardWithSelf, clearLeaderboardCache } from './leaderboardService';
export type { LeaderboardWithSelf } from './leaderboardService';
export {
  loanCreature,
  recallLoan,
  claimBorrowerReward,
  getMyActiveLoans,
  getFriendIncomingLoans,
  checkExpiredLoans
} from './creatureLoanService';
export type { LoanResult, ActiveLoansBundle } from './creatureLoanService';

// 階段 5D:動態牆
export {
  publishFeedEvent,
  getFriendsFeed,
  deleteFeedEvent,
  getUnreadFeedCount
} from './feedEventService';
export { likeFeedEvent, unlikeFeedEvent } from './feedLikeService';
export {
  addComment,
  getComments,
  deleteComment
} from './feedCommentService';
export type { CommentWithAuthor } from './feedCommentService';
export {
  detectSensitiveWords,
  publishCultivationShare
} from './cultivationShareService';
export type { DetectedSensitive, PublishShareInput } from './cultivationShareService';
export { getOnlineFriends } from './onlineFriendsService';
export type { OnlineFriend } from './onlineFriendsService';

// 階段 5B:好友個人頁
export { attachProfileSyncListeners, backfillProfileSync } from './profileSyncService';
export { getMyShowcase, updateMyShowcase, getShowcase } from './showcaseService';
export {
  getFriendCreatures,
  getFriendShowcase,
  getFriendMilestones,
  getFriendCloudStats,
  getFriendFullProfile,
  getCodexComparison,
  getMyVsTheirMetrics,
  clearFriendProfileCache
} from './friendProfileService';
export type {
  FriendFullProfile,
  FriendCloudStats,
  CodexEntry,
  CodexEntryStatus,
  CodexComparisonSummary,
  VsMetric
} from './friendProfileService';
