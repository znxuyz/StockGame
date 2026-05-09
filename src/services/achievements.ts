/**
 * 成就評估器。
 *
 * 設計：
 *  - 每個成就一個 evaluator，回傳 { progress, unlocked }
 *  - 進度可以做進度條，unlocked 一旦為 true 就不會回 false（已解鎖永久保留）
 *  - 在 runAchievementChecks() 統一執行所有 evaluators，更新 DB
 *  - 大多數 evaluator 從 ctx 拿預先載好的資料（避免每個 evaluator 各自打 DB）
 *
 * 觸發時機：
 *  - 買入/加碼/賣出後
 *  - 價格更新後
 *  - App 載入時（為了長期類成就 anniv-1y, login-X 等）
 */

import { db } from '@/db';
import type {
  AchievementProgress,
  Holding,
  Pet,
  Settings,
  StockPrice,
  Transaction
} from '@/types';
import { ACHIEVEMENTS } from '@/data/achievements';
import { CREATURES } from '@/data/creatures';
import { computeSummary, type PortfolioSummary } from './summary';
import { daysBetween } from '@/utils';
import { getTaipeiDateString } from '@/api';

interface AchievementContext {
  now: number;
  holdings: Holding[]; // active 持倉
  activePets: Pet[]; // 未退役寵物
  allPets: Pet[]; // 含退役（用於圖鑑）
  prices: Map<string, StockPrice>;
  transactions: Transaction[];
  buyTxns: Transaction[];
  feedTxns: Transaction[];
  sellTxns: Transaction[];
  summary: PortfolioSummary;
  settings: Settings;
}

interface EvaluatorOutput {
  progress: number;
  unlocked: boolean;
}

type Evaluator = (ctx: AchievementContext) => EvaluatorOutput;

// ─── helpers ───────────────────────────────────────────────────────────────

function holdingReturnRate(h: Holding, prices: Map<string, StockPrice>): number {
  const p = prices.get(h.code);
  if (!p || h.totalCost === 0) return 0;
  const marketValue = p.currentPrice * h.shares;
  return (marketValue - h.totalCost) / h.totalCost;
}

function holdingProfit(h: Holding, prices: Map<string, StockPrice>): number {
  const p = prices.get(h.code);
  if (!p) return 0;
  return p.currentPrice * h.shares - h.totalCost;
}

// 簡易記憶（不存 DB）：first-profit 一旦達成就應永久解鎖，靠 DB 的 unlockedAt 持久化
// （所有 evaluator 用「once unlocked 永久 true」策略，下面 runAchievementChecks 會處理）

// ─── evaluators ────────────────────────────────────────────────────────────

const EVALUATORS: Record<string, Evaluator> = {
  // 收集類
  'first-buy': (c) => unlockedIf(c.buyTxns.length >= 1),
  'collect-25': (c) => collectionProgress(c, 0.25),
  'collect-50': (c) => collectionProgress(c, 0.5),
  'collect-75': (c) => collectionProgress(c, 0.75),
  'collect-100': (c) => collectionProgress(c, 1.0),
  'four-symbols': (c) => {
    // 天罡四極:鴻鈞道祖(道) / 玄黃地母(地) / 滄溟海尊(海) / 紫微天樞(星)
    // 成就 id 沿用 'four-symbols'(IndexedDB 已存,不能改),只改實際目標
    const targets = ['hong-jun-dao-zu', 'xuan-huang-di-mu', 'cang-ming-hai-zun', 'zi-wei-tian-shu'];
    const owned = new Set(c.activePets.map((p) => p.speciesId));
    const have = targets.filter((t) => owned.has(t)).length;
    return { progress: have, unlocked: have >= targets.length };
  },
  'pets-10': (c) => threshold(c.activePets.length, 10),
  'pets-20': (c) => threshold(c.activePets.length, 20),
  'pets-50': (c) => threshold(c.activePets.length, 50),

  // 獲利類
  'first-profit': (c) => unlockedIf(c.summary.returnRate > 0),
  'profit-10': (c) => unlockedIf(c.summary.returnRate >= 0.1),
  'profit-30': (c) => unlockedIf(c.summary.returnRate >= 0.3),
  'profit-50': (c) => unlockedIf(c.summary.returnRate >= 0.5),
  'profit-100': (c) => unlockedIf(c.summary.returnRate >= 1.0),
  'profit-200': (c) => unlockedIf(c.summary.returnRate >= 2.0),
  'single-10k': (c) => singleProfitThreshold(c, 10_000),
  'single-100k': (c) => singleProfitThreshold(c, 100_000),
  'single-1m': (c) => singleProfitThreshold(c, 1_000_000),
  'monthly-3': (c) => monthlyStreakAtLeast(c, 3),
  'monthly-6': (c) => monthlyStreakAtLeast(c, 6),
  'monthly-12': (c) => monthlyStreakAtLeast(c, 12),

  // 虧損類
  'single-down-50': (c) => {
    const has = c.holdings.some((h) => holdingReturnRate(h, c.prices) <= -0.5);
    return unlockedIf(has);
  },
  'feed-down-5': (c) => {
    // 任何 holding 在加碼 ≥ 5 次後仍為負報酬
    let unlocked = false;
    let bestProgress = 0;
    for (const h of c.holdings) {
      const feedCount = c.feedTxns.filter((t) => t.code === h.code).length;
      bestProgress = Math.max(bestProgress, feedCount);
      if (feedCount >= 5 && holdingReturnRate(h, c.prices) < 0) {
        unlocked = true;
        break;
      }
    }
    return { progress: Math.min(5, bestProgress), unlocked };
  },
  'realize-loss-10': (c) => {
    const lossCount = c.sellTxns.filter((t) => t.realizedPnL < 0).length;
    return threshold(lossCount, 10);
  },

  // 等級類
  'level-99': (c) => {
    const max = c.activePets.reduce((m, p) => Math.max(m, p.level), 0);
    return { progress: max, unlocked: max >= 99 };
  },

  // 長期類
  'login-7': (c) => threshold(c.settings.maxConsecutiveDays, 7),
  'login-30': (c) => threshold(c.settings.maxConsecutiveDays, 30),
  'login-100': (c) => threshold(c.settings.maxConsecutiveDays, 100),
  'login-365': (c) => threshold(c.settings.maxConsecutiveDays, 365),
  'hold-1y': (c) => maxHoldDays(c, 365),
  'hold-3y': (c) => maxHoldDays(c, 1095),
  'diamond-hand': (c) => diamondHand(c, 1825),
  'anniv-1y': (c) => threshold(daysBetween(c.settings.createdAt, c.now), 365),
  'anniv-3y': (c) => threshold(daysBetween(c.settings.createdAt, c.now), 1095),

  // 操作類
  'first-sell': (c) => unlockedIf(c.sellTxns.length >= 1),
  'first-feed': (c) => unlockedIf(c.feedTxns.length >= 1),
  'feed-10': (c) => threshold(c.feedTxns.length, 10),
  'feed-50': (c) => threshold(c.feedTxns.length, 50),
  'feed-100': (c) => threshold(c.feedTxns.length, 100),
  'day-trader': (c) => {
    const today = getTaipeiDateString(new Date(c.now));
    const todayCount = c.transactions.filter(
      (t) => getTaipeiDateString(new Date(t.timestamp)) === today
    ).length;
    return threshold(todayCount, 10);
  },
  'zen-investor': (c) => zenInvestor(c)
};

function unlockedIf(condition: boolean): EvaluatorOutput {
  return { progress: condition ? 1 : 0, unlocked: condition };
}

function threshold(current: number, target: number): EvaluatorOutput {
  return { progress: Math.min(target, current), unlocked: current >= target };
}

function collectionProgress(c: AchievementContext, ratio: number): EvaluatorOutput {
  const owned = new Set(c.allPets.map((p) => p.speciesId));
  const total = CREATURES.length;
  const target = Math.ceil(total * ratio);
  return { progress: Math.min(target, owned.size), unlocked: owned.size >= target };
}

function singleProfitThreshold(c: AchievementContext, target: number): EvaluatorOutput {
  let best = 0;
  for (const h of c.holdings) {
    const profit = holdingProfit(h, c.prices) + h.realizedPnL;
    if (profit > best) best = profit;
  }
  // 也要考慮已退役的 holding（從 sellTxns 累積）
  // 這裡簡化為持倉中的最大值；歷史最大可在後續加 lifetime tracker 補上
  return { progress: Math.min(target, Math.max(0, Math.round(best))), unlocked: best >= target };
}

function maxHoldDays(c: AchievementContext, target: number): EvaluatorOutput {
  let best = 0;
  for (const h of c.holdings) {
    const days = daysBetween(h.firstPurchasedAt, c.now);
    if (days > best) best = days;
  }
  return threshold(best, target);
}

function diamondHand(c: AchievementContext, target: number): EvaluatorOutput {
  // 持有同檔超過 target 天 + 從未賣出
  let best = 0;
  for (const h of c.holdings) {
    const hasSold = c.sellTxns.some((t) => t.code === h.code);
    if (hasSold) continue;
    const days = daysBetween(h.firstPurchasedAt, c.now);
    if (days > best) best = days;
  }
  return threshold(best, target);
}

function zenInvestor(c: AchievementContext): EvaluatorOutput {
  // 一週內無任何交易：要先有過交易（避免新玩家秒拿）
  if (c.transactions.length === 0) return { progress: 0, unlocked: false };
  const sevenDaysAgo = c.now - 7 * 86_400_000;
  const recent = c.transactions.filter((t) => t.timestamp >= sevenDaysAgo);
  if (recent.length === 0) {
    // 從上次交易至今天數
    const lastTxn = c.transactions[c.transactions.length - 1].timestamp;
    const days = daysBetween(lastTxn, c.now);
    return threshold(Math.min(7, days), 7);
  }
  return { progress: 0, unlocked: false };
}

function monthlyStreakAtLeast(c: AchievementContext, target: number): EvaluatorOutput {
  // 從 snapshots 表算連續月正報酬：取每月最後一筆當作該月終值
  // 這個 evaluator 在 runAchievementChecks 中需要 snapshots，不能從 ctx 拿，
  // 所以暫時回 unlocked=false 直到有夠多 snapshot
  // （在 runAchievementChecks 中會被特殊處理；這裡先佔位）
  void c;
  void target;
  return { progress: 0, unlocked: false };
}

// ─── orchestrator ──────────────────────────────────────────────────────────

export interface AchievementCheckResult {
  /** 本次新解鎖的成就 id */
  newlyUnlocked: string[];
}

/**
 * 一次跑全部 evaluator，更新 DB。
 * 已解鎖的成就不會被覆寫成未解鎖（once unlocked, forever unlocked）。
 */
export async function runAchievementChecks(
  now: number = Date.now()
): Promise<AchievementCheckResult> {
  const [holdings, activePets, allPets, prices, transactions, settings, summary] =
    await Promise.all([
      db.holdings.toArray(),
      db.pets.filter((p) => !p.retiredAt).toArray(),
      db.pets.toArray(),
      db.prices.toArray(),
      db.transactions.orderBy('timestamp').toArray(),
      db.settings.get('singleton'),
      computeSummary()
    ]);

  if (!settings) return { newlyUnlocked: [] };

  const ctx: AchievementContext = {
    now,
    holdings,
    activePets,
    allPets,
    prices: new Map(prices.map((p) => [p.code, p])),
    transactions,
    buyTxns: transactions.filter((t) => t.type === 'buy'),
    feedTxns: transactions.filter((t) => t.type === 'feed'),
    sellTxns: transactions.filter((t) => t.type === 'sell'),
    summary,
    settings
  };

  // monthly streak 特殊處理：從 snapshots 算
  const monthlyStreak = await computeMonthlyPositiveStreak();

  const newlyUnlocked: string[] = [];
  const existing = await db.achievements.toArray();
  const existingMap = new Map(existing.map((a) => [a.id, a]));

  for (const def of ACHIEVEMENTS) {
    const evaluator = EVALUATORS[def.id];
    if (!evaluator) continue;

    let result = evaluator(ctx);

    // monthly evaluator 注入快照結果
    if (def.id.startsWith('monthly-')) {
      const need = Number(def.id.slice('monthly-'.length));
      result = { progress: Math.min(need, monthlyStreak), unlocked: monthlyStreak >= need };
    }

    const prev = existingMap.get(def.id);
    const wasUnlocked = !!prev?.unlockedAt;
    const isUnlocked = result.unlocked || wasUnlocked; // 一旦解鎖永久解鎖

    const next: AchievementProgress = {
      id: def.id,
      current: Math.max(prev?.current ?? 0, result.progress),
      unlockedAt: prev?.unlockedAt ?? (result.unlocked ? now : undefined)
    };

    // 只在內容有變動時才寫
    if (
      !prev ||
      prev.current !== next.current ||
      prev.unlockedAt !== next.unlockedAt
    ) {
      await db.achievements.put(next);
    }
    if (isUnlocked && !wasUnlocked) {
      newlyUnlocked.push(def.id);
    }
  }

  return { newlyUnlocked };
}

/** 從 snapshots 表計算「目前連續正報酬月份數」 */
async function computeMonthlyPositiveStreak(): Promise<number> {
  const snapshots = await db.snapshots.orderBy('date').toArray();
  if (snapshots.length === 0) return 0;

  // 取每月最後一筆當作該月結算
  const lastByMonth = new Map<string, (typeof snapshots)[number]>();
  for (const s of snapshots) {
    const month = s.date.slice(0, 7); // YYYY-MM
    lastByMonth.set(month, s);
  }
  const months = [...lastByMonth.keys()].sort();
  if (months.length === 0) return 0;

  // 從最近的月份往回數連續正報酬
  let streak = 0;
  for (let i = months.length - 1; i >= 0; i--) {
    const snap = lastByMonth.get(months[i]);
    if (!snap) break;
    if (snap.totalPnL > 0) streak += 1;
    else break;
  }
  return streak;
}
