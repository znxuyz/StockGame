export { audio } from './audio';

export { buyOrFeed, sell } from './portfolio';
export type { BuyParams, SellParams, ActionResult } from './portfolio';

export { calculateLevel } from './evolution';

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
