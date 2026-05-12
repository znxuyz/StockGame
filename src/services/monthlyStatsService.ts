/**
 * 階段 5C:月度戰績統計服務。
 *
 * 跨表 aggregate 給 MonthlyReviewCard 畫圖用,全部從本地 IndexedDB 拉,
 * 不需要雲端(離線玩家也能看月度戰績)。
 *
 * 設計取捨:
 *  - 「該月最賺神獸」用「該月買入 + 仍未退役」算 unrealized P/L;退役的算 final
 *    realizedPnL。若該月沒新買神獸,fallback 用該月底持有中、unrealized P/L 最高
 *  - 「修為月初/月底」從 cultivationLog 在該月 boundaries 前後最近一筆抓 balanceAfter
 *  - 「連登天數」= 該月內 lastLoginDate 落在月內的天數(由 cultivationLog reason=daily_login
 *    每日 entry 數量推算,比 streak 計數準)
 *  - 「完成任務」= 該月內 cultivationLog reason in ('daily_task','weekly_task') count
 *  - 「修煉日曆」= 該月每日是否有 daily_login,boolean[daysInMonth]
 */

import { db } from '@/db';
import { getRealm, realmLabel, realmRank } from './petTier';
import { getCreature } from '@/data/creatures';
import type { CreatureSpecies, Pet, Holding } from '@/types';

export interface BestCreatureSummary {
  petId: string;
  speciesId: string;
  species: CreatureSpecies | undefined;
  /** 報酬金額(已退役 → realizedPnL;未退役 → 月底市值 - totalCost) */
  profit: number;
  /** 報酬率 0-1(profit / totalCost) */
  profitPercent: number;
  /** 該月新買或仍持有的標記 */
  retired: boolean;
}

export interface RealmBreakthroughEntry {
  petId: string;
  speciesId: string;
  /** 'fan' → 'ling' 等 */
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
}

export interface MonthlyStats {
  year: number;
  /** 1-12 */
  month: number;
  /** 月初 0:00 unix ms */
  startMs: number;
  /** 月底 23:59:59.999 unix ms */
  endMs: number;
  /** 該月新召喚的不同神獸數(distinct speciesId) */
  newCreaturesCount: number;
  /** 該月退役的 pet 數量 */
  retiredCreaturesCount: number;
  /** 該月修為淨增加(end - start;<0 代表花得比賺得多) */
  cultivationGrowth: number;
  /** 該月有領簽到的天數 */
  consecutiveDays: number;
  /** 該月完成任務數(daily + weekly) */
  completedTasks: number;
  /** 該月最賺神獸(可能 null:該月沒任何相關活動) */
  bestCreature: BestCreatureSummary | null;
  /** 該月境界突破事件 */
  breakthroughs: RealmBreakthroughEntry[];
  /** 月初修為餘額 */
  cultivationStart: number;
  /** 月底修為餘額 */
  cultivationEnd: number;
  /**
   * 修煉日曆:該月每一天是否有簽到。length = 該月天數(28-31)。
   * day-of-month 1 → index 0。
   */
  loginCalendar: boolean[];
  /** 該月是否完全沒任何活動(全空,UI 顯示「該月還沒玩」) */
  isEmpty: boolean;
}

/** 該月 0:00 的 ms / 下個月 0:00 - 1ms */
function monthRange(year: number, month: number): { startMs: number; endMs: number; days: number } {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const next = new Date(year, month, 1, 0, 0, 0, 0);
  const days = Math.round((next.getTime() - start.getTime()) / 86_400_000);
  return { startMs: start.getTime(), endMs: next.getTime() - 1, days };
}

/** 從 cultivationLog 找「<= ts」最後一筆 balanceAfter;沒紀錄回 0 */
async function cultivationBalanceAt(ts: number): Promise<number> {
  // cultivationLog 是 append-only,id 隨 createdAt 遞增。掃全表 filter 比 where range 快(資料量小)
  const all = await db.cultivationLog.toArray();
  let lastBalance = 0;
  for (const log of all) {
    if (log.createdAt <= ts) {
      lastBalance = log.balanceAfter;
    } else {
      break; // 假設 createdAt 大致遞增(append-only)
    }
  }
  return lastBalance;
}

/**
 * 算指定年月的戰績統計。回 isEmpty:true 代表該月該玩家完全沒進來玩。
 */
export async function getMonthlyStats(year: number, month: number): Promise<MonthlyStats> {
  const { startMs, endMs, days } = monthRange(year, month);

  const [pets, holdings, cultivationLog] = await Promise.all([
    db.pets.toArray(),
    db.holdings.toArray(),
    db.cultivationLog.toArray()
  ]);

  // ─── 新召喚 / 退役 ───
  const bornInMonth: Pet[] = pets.filter((p) => p.bornAt >= startMs && p.bornAt <= endMs);
  const retiredInMonth: Pet[] = pets.filter(
    (p) => p.retiredAt != null && p.retiredAt >= startMs && p.retiredAt <= endMs
  );
  // distinct species 數
  const newSpeciesIds = new Set(bornInMonth.map((p) => p.speciesId));

  // ─── 該月最賺神獸 ───
  // 候選池:該月誕生的 pets ∪ 該月仍在持有中的 pets(bornAt <= endMs && (retiredAt == null || retiredAt > endMs))
  // 已退役在月內 → 用 realizedPnL;持有中 → 用「holding 月底時市值 - totalCost」估算
  // 月底市值用「目前 prices」估(玩家若多月才回頭看會稍有偏差,可接受;真正歷史月底
  // 市值要寫日快照,MVP 先簡化)
  const holdingByCode = new Map<string, Holding>();
  for (const h of holdings) holdingByCode.set(h.code, h);

  // 該月活躍 pets 池:bornAt <= endMs && (retiredAt == null || retiredAt >= startMs)
  const activeInMonth = pets.filter(
    (p) => p.bornAt <= endMs && (p.retiredAt == null || p.retiredAt >= startMs)
  );

  let best: BestCreatureSummary | null = null;
  const stockPrices = await db.prices.toArray();
  const priceByCode = new Map(stockPrices.map((s) => [s.code, s.currentPrice]));

  for (const p of activeInMonth) {
    const h = holdingByCode.get(p.code);
    if (!h) continue;
    let profit: number;
    let percent: number;
    const retired = p.retiredAt != null && p.retiredAt <= endMs;
    if (retired) {
      profit = h.realizedPnL;
      percent = h.totalCost > 0 ? profit / h.totalCost : 0;
    } else {
      const price = priceByCode.get(p.code) ?? h.avgCost;
      const marketValue = h.shares * price;
      profit = marketValue + h.realizedPnL - h.totalCost;
      percent = h.totalCost > 0 ? profit / h.totalCost : 0;
    }
    if (!best || profit > best.profit) {
      best = {
        petId: p.id,
        speciesId: p.speciesId,
        species: getCreature(p.speciesId),
        profit,
        profitPercent: percent,
        retired
      };
    }
  }

  // ─── 修為起終餘額 + 月增長 ───
  const cultivationStart = await cultivationBalanceAt(startMs - 1);
  const cultivationEnd = await cultivationBalanceAt(endMs);
  const cultivationGrowth = cultivationEnd - cultivationStart;

  // ─── 完成任務數 + 連登天數 + 修煉日曆 ───
  let completedTasks = 0;
  const loginDays = new Set<number>();
  for (const log of cultivationLog) {
    if (log.createdAt < startMs || log.createdAt > endMs) continue;
    if (log.reason === 'daily_task' || log.reason === 'weekly_task') {
      completedTasks++;
    } else if (log.reason === 'daily_login') {
      const date = new Date(log.createdAt);
      if (date.getFullYear() === year && date.getMonth() + 1 === month) {
        loginDays.add(date.getDate());
      }
    }
  }
  const loginCalendar = Array.from({ length: days }, (_, i) => loginDays.has(i + 1));
  const consecutiveDays = loginDays.size;

  // ─── 境界突破事件 ───
  // realm_breakthrough log 帶 relatedPetId,從 reasonText 拿不到 from→to(MVP 簡化:
  // 算這隻當前 vs bornAt 時的境界差,顯示最後一次升等的 from→to)
  const breakthroughs: RealmBreakthroughEntry[] = [];
  const seenPets = new Set<string>();
  for (const log of cultivationLog) {
    if (log.createdAt < startMs || log.createdAt > endMs) continue;
    if (log.reason !== 'realm_breakthrough') continue;
    const petId = log.relatedPetId;
    if (!petId || seenPets.has(petId)) continue;
    seenPets.add(petId);
    const pet = pets.find((p) => p.id === petId);
    if (!pet) continue;
    const h = holdingByCode.get(pet.code);
    if (!h) continue;
    const monthsHeld = (Date.now() - h.firstPurchasedAt) / (30 * 86_400_000) + (pet.boostedDays ?? 0) / 30;
    const currentRealm = getRealm(monthsHeld);
    // from = 前一階(假設突破上來那一階就是當前)
    const idx = realmRank(currentRealm);
    const order = ['fan', 'ling', 'yao', 'shen', 'sheng', 'xian'] as const;
    const from = idx > 0 ? order[idx - 1] : order[0];
    breakthroughs.push({
      petId,
      speciesId: pet.speciesId,
      from,
      to: currentRealm,
      fromLabel: realmLabel(from),
      toLabel: realmLabel(currentRealm)
    });
  }

  // 該月每張表都檢查 → 統一判斷是否「完全沒玩」
  const isEmpty =
    bornInMonth.length === 0 &&
    retiredInMonth.length === 0 &&
    loginDays.size === 0 &&
    completedTasks === 0 &&
    cultivationGrowth === 0 &&
    breakthroughs.length === 0 &&
    !best;

  return {
    year,
    month,
    startMs,
    endMs,
    newCreaturesCount: newSpeciesIds.size,
    retiredCreaturesCount: retiredInMonth.length,
    cultivationGrowth,
    consecutiveDays,
    completedTasks,
    bestCreature: best,
    breakthroughs,
    cultivationStart,
    cultivationEnd,
    loginCalendar,
    isEmpty
  };
}

/**
 * 取過去 N 個月的「可看月份」清單(該月有任何活動才算可看)。
 * 給「設定 → 月度回顧」的月份 picker 用。
 */
export async function getAvailableMonths(limit = 12): Promise<{ year: number; month: number; isEmpty: boolean }[]> {
  const out: { year: number; month: number; isEmpty: boolean }[] = [];
  const now = new Date();
  for (let i = 0; i < limit; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const stats = await getMonthlyStats(d.getFullYear(), d.getMonth() + 1);
    out.push({ year: d.getFullYear(), month: d.getMonth() + 1, isEmpty: stats.isEmpty });
  }
  return out;
}

/** 上個月的 year/month(用於每月 1 日自動彈出) */
export function getPreviousMonth(now: Date = new Date()): { year: number; month: number } {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** localStorage key 用,例如 'monthlyReviewShown_2026-04' */
export function monthlyReviewKey(year: number, month: number): string {
  return `monthlyReviewShown_${year}-${String(month).padStart(2, '0')}`;
}

/** 標記某月已提示過(localStorage,跨 session 持久) */
export function markMonthlyReviewShown(year: number, month: number): void {
  try {
    localStorage.setItem(monthlyReviewKey(year, month), '1');
  } catch {
    // localStorage 滿 / 私密模式 → 忽略,大不了重複彈一次
  }
}

export function wasMonthlyReviewShown(year: number, month: number): boolean {
  try {
    return localStorage.getItem(monthlyReviewKey(year, month)) === '1';
  } catch {
    return false;
  }
}

