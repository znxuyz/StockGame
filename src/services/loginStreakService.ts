/**
 * 連登紀錄 + 簽到服務(階段 3.1)。
 *
 * 流程:
 *   1. App 啟動 → checkAndUpdateStreak()
 *      - 第一次玩 → 建 row,currentStreak = 1
 *      - 同一天重開 → 不變,只回 isNewDay = false
 *      - 昨天有登 → currentStreak += 1,longestStreak 取 max
 *      - 斷簽(超過 1 天)→ currentStreak = 1
 *   2. 玩家在 DailyCheckInModal 點「領取」 → claimTodayLogin()
 *      - 基礎 +10 修為
 *      - 若連登天數命中 milestone(7/14/30/60/100)→ 額外 +100/200/500/1000/2000 修為
 *        用 milestoneRewards table milestoneDay 唯一索引防同 milestone 重複領
 *      - todayClaimed = true
 *
 * 日期處理:
 *   getDateString 固定格式 'YYYY-MM-DD',用台灣時區的本地日期
 *   getYesterdayString = today - 24h(用本地 date 算,不會被 DST/午夜/UTC 干擾)
 */

import { loginStreakRepo } from '@/repositories/loginStreakRepo';
import { taskRepo } from '@/repositories/taskRepo';
import type { LoginStreak } from '@/types';
import { earnCultivation } from './cultivationService';

const SINGLETON_ID = 'main' as const;
/** 每日簽到的基礎修為(里程碑日另加) */
const BASE_DAILY_REWARD = 10;

/** 連登里程碑表(可調) */
export interface MilestoneDef {
  day: number;
  reward: number;
  text: string;
}
export const STREAK_MILESTONES: MilestoneDef[] = [
  { day: 7, reward: 100, text: '連登 7 天' },
  { day: 14, reward: 200, text: '連登 14 天' },
  { day: 30, reward: 500, text: '連登 30 天' },
  { day: 60, reward: 1000, text: '連登 60 天' },
  { day: 100, reward: 2000, text: '連登 100 天' }
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
function dateToString(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function yesterdayOf(d: Date): string {
  const y = new Date(d);
  y.setDate(y.getDate() - 1);
  return dateToString(y);
}

export interface CheckResult {
  /** 是不是新的一天(用來決定要不要彈簽到 modal) */
  isNewDay: boolean;
  streak: LoginStreak;
}

/**
 * App 啟動呼叫一次。比對 DB 內 lastLoginDate 跟今天:
 *   - 同一天:不動,回 isNewDay = false
 *   - 昨天:連登 +1
 *   - 更早:斷簽,重設為 1
 *   - DB 沒紀錄:第一次玩,建 row currentStreak = 1
 */
export async function checkAndUpdateStreak(now: Date = new Date()): Promise<CheckResult> {
  const today = dateToString(now);
  const yesterday = yesterdayOf(now);
  const existing = await loginStreakRepo.get();

  if (!existing) {
    const init: LoginStreak = {
      id: SINGLETON_ID,
      currentStreak: 1,
      longestStreak: 1,
      lastLoginDate: today,
      todayClaimed: false,
      lifetimeLogins: 1
    };
    await loginStreakRepo.put(init);
    return { isNewDay: true, streak: init };
  }

  if (existing.lastLoginDate === today) {
    // 同一天重開 — 不變
    return { isNewDay: false, streak: existing };
  }

  // 進到新一天(昨天接續 / 斷簽 / 第一次同步雲端後本地比 lastLogin 還新...)
  const newCurrent = existing.lastLoginDate === yesterday ? existing.currentStreak + 1 : 1;
  const updated: LoginStreak = {
    ...existing,
    currentStreak: newCurrent,
    longestStreak: Math.max(existing.longestStreak, newCurrent),
    lastLoginDate: today,
    todayClaimed: false,
    lifetimeLogins: existing.lifetimeLogins + 1
  };
  await loginStreakRepo.put(updated);
  return { isNewDay: true, streak: updated };
}

export interface ClaimResult {
  success: boolean;
  reason?: 'no_streak' | 'already_claimed';
  /** 基礎獎勵實際發放金額(success=true 時填) */
  baseReward?: number;
  /** 命中里程碑時填 */
  milestone?: MilestoneDef;
}

/**
 * 領取今日簽到。每天只能領一次。
 * 同 milestoneDay 的里程碑用 milestoneRewards.milestoneDay 唯一索引防重領。
 */
export async function claimTodayLogin(): Promise<ClaimResult> {
  const streak = await loginStreakRepo.get();
  if (!streak) return { success: false, reason: 'no_streak' };
  if (streak.todayClaimed) return { success: false, reason: 'already_claimed' };

  // 1. 基礎簽到獎勵
  await earnCultivation(
    BASE_DAILY_REWARD,
    'daily_login',
    `每日簽到(連登 ${streak.currentStreak} 天)`
  );

  // 2. 命中里程碑 → 額外發
  let claimedMilestone: MilestoneDef | undefined;
  const ms = STREAK_MILESTONES.find((m) => m.day === streak.currentStreak);
  if (ms) {
    const existing = await taskRepo.getMilestoneByDay(ms.day);
    if (!existing) {
      // milestoneDay 唯一索引,race 時 add 第二筆會 throw — 視為對手已領,catch 跳過
      try {
        await taskRepo.addMilestone({ milestoneDay: ms.day, claimedAt: Date.now() });
        await earnCultivation(ms.reward, 'streak_milestone', `🎉 ${ms.text}!`);
        claimedMilestone = ms;
      } catch {
        // 已經有同 day 的紀錄(race)— 跳過,但 todayClaimed 仍要設(玩家點過按鈕)
      }
    }
  }

  // 3. 標記今日已領
  await loginStreakRepo.put({ ...streak, todayClaimed: true });

  return { success: true, baseReward: BASE_DAILY_REWARD, milestone: claimedMilestone };
}

/** 純讀,給 hook / UI 用 */
export async function getLoginStreak(): Promise<LoginStreak | undefined> {
  return loginStreakRepo.get();
}
