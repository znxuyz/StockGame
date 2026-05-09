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
  EFFECT_ORDER,
  EFFECT_THRESHOLD,
  getPetStatus
} from './petTier';
export type { SoulRealm, RingEffect, PetStatus } from './petTier';

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

export { incrementTaskProgress, claimTaskReward, getActiveTasks } from './taskService';
export type { ClaimTaskResult, ActiveTasks } from './taskService';
