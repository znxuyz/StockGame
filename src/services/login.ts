/**
 * 連續登入追蹤(階段 3D 批 1 後改用 loginStreakRepo)。
 *
 * 階段 3.1 之前用 `Settings.{lastLoginDate, consecutiveDays, maxConsecutiveDays}`
 * 三個欄位記連登。階段 3.1 新增 `LoginStreak` table + `loginStreakService.
 * checkAndUpdateStreak()` 後,兩處重複;階段 3D 批 1 把這個老 service 改成
 * 讀寫 `loginStreakRepo`,跟 `loginStreakService` 共用同一份資料。
 *
 * 階段 6.X(Dexie v16)後 Settings 那三個 legacy 欄位整個拔除,
 * 一次性 `migrateLegacyFromSettings` 也一併移除 — 舊玩家有充分時間升級
 * 過(階段 3D 批 1 以來),沒升的會被 v16 migration 直接刪欄位,
 * LoginStreak 從零起算。
 */

import { loginStreakRepo } from '@/repositories/loginStreakRepo';
import { getTaipeiDateString } from '@/api';

/**
 * 檢查並更新登入紀錄。
 * App 啟動時呼叫一次(idempotent)。`loginStreakService.checkAndUpdateStreak` 也會跑,
 * 兩者都更新同一份 row,順序無所謂 — 同日第二次跑會看到 lastLoginDate === today
 * 直接 return。
 */
export async function checkInLoginToday(now: Date = new Date()): Promise<void> {
  const today = getTaipeiDateString(now);
  const existing = await loginStreakRepo.get();
  if (!existing) {
    // 第一次玩(或 v16 migration 後 LoginStreak 重置)→ 建初始 row
    await loginStreakRepo.put({
      id: 'main',
      currentStreak: 1,
      longestStreak: 1,
      lastLoginDate: today,
      todayClaimed: false,
      lifetimeLogins: 1
    });
    return;
  }

  if (existing.lastLoginDate === today) {
    return; // 今天已經登入過了
  }

  const newStreak = existing.lastLoginDate && isPreviousDay(existing.lastLoginDate, today)
    ? existing.currentStreak + 1
    : 1;

  await loginStreakRepo.patch({
    lastLoginDate: today,
    currentStreak: newStreak,
    longestStreak: Math.max(existing.longestStreak, newStreak),
    todayClaimed: false,
    lifetimeLogins: existing.lifetimeLogins + 1
  });
}

/** today 是不是 prev 的隔天(YYYY-MM-DD 字串) */
function isPreviousDay(prev: string, today: string): boolean {
  const prevDate = new Date(`${prev}T00:00:00+08:00`);
  const todayDate = new Date(`${today}T00:00:00+08:00`);
  const diff = todayDate.getTime() - prevDate.getTime();
  return Math.round(diff / 86_400_000) === 1;
}
