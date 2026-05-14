/**
 * 連續登入追蹤。
 * 不需要保留全部登入紀錄，只記三個欄位：
 *  - lastLoginDate: 上次登入日期
 *  - consecutiveDays: 目前連續天數
 *  - maxConsecutiveDays: 史上最高連續天數
 */

import { settingsRepo } from '@/repositories/settingsRepo';
import { getTaipeiDateString } from '@/api';

/**
 * 檢查並更新登入紀錄。
 * 在 App 載入時呼叫一次（idempotent，同日多次呼叫不會重複增加）。
 */
export async function checkInLoginToday(now: Date = new Date()): Promise<void> {
  const today = getTaipeiDateString(now);
  const settings = await settingsRepo.get();
  if (!settings) return;

  if (settings.lastLoginDate === today) {
    return; // 今天已經登入過了
  }

  let consecutive = settings.consecutiveDays;
  if (settings.lastLoginDate && isPreviousDay(settings.lastLoginDate, today)) {
    consecutive += 1;
  } else {
    // 不是連續登入，從 1 重新開始
    consecutive = 1;
  }

  const max = Math.max(settings.maxConsecutiveDays, consecutive);
  await settingsRepo.patch({
    lastLoginDate: today,
    consecutiveDays: consecutive,
    maxConsecutiveDays: max
  });
}

/** today 是不是 prev 的隔天（YYYY-MM-DD 字串） */
function isPreviousDay(prev: string, today: string): boolean {
  const prevDate = new Date(`${prev}T00:00:00+08:00`);
  const todayDate = new Date(`${today}T00:00:00+08:00`);
  const diff = todayDate.getTime() - prevDate.getTime();
  return Math.round(diff / 86_400_000) === 1;
}
