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
