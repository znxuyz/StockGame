/**
 * 連續登入追蹤(階段 3D 批 1 後改用 loginStreakRepo)。
 *
 * 階段 3.1 之前用 `Settings.{lastLoginDate, consecutiveDays, maxConsecutiveDays}`
 * 三個欄位記連登。階段 3.1 起新增 `LoginStreak` table + `loginStreakService.
 * checkAndUpdateStreak()` 也做同樣的事,造成兩處重複。
 *
 * 階段 3D 批 1:把這個老 service 改成讀寫 `loginStreakRepo`(也就是後者表),
 * 跟 `loginStreakService` 共用同一份資料。第一次跑時若 LoginStreak row 為空,
 * 從本機 `Settings` 的舊欄位做一次性 migration(避免老用戶 streak 歸 0)。
 */

import { loginStreakRepo } from '@/repositories/loginStreakRepo';
import { settingsRepo } from '@/repositories/settingsRepo';
import { getTaipeiDateString } from '@/api';
import type { LoginStreak } from '@/types';

/**
 * 檢查並更新登入紀錄。
 * App 啟動時呼叫一次(idempotent)。`loginStreakService.checkAndUpdateStreak` 也會跑,
 * 兩者都更新同一份 row,順序無所謂 — 同日第二次跑會看到 lastLoginDate === today
 * 直接 return。
 */
export async function checkInLoginToday(now: Date = new Date()): Promise<void> {
  const today = getTaipeiDateString(now);
  const existing = await loginStreakRepo.get();
  const streak = existing ?? (await migrateLegacyFromSettings(today));
  if (!streak) {
    // 沒既有資料也沒 legacy → 第一次玩,建初始 row
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

  if (streak.lastLoginDate === today) {
    return; // 今天已經登入過了
  }

  const newStreak = streak.lastLoginDate && isPreviousDay(streak.lastLoginDate, today)
    ? streak.currentStreak + 1
    : 1;

  await loginStreakRepo.patch({
    lastLoginDate: today,
    currentStreak: newStreak,
    longestStreak: Math.max(streak.longestStreak, newStreak),
    todayClaimed: false,
    lifetimeLogins: streak.lifetimeLogins + 1
  });
}

/**
 * 一次性 migration:LoginStreak row 為空但 Settings 有 legacy 連登欄位 →
 * 用 Settings 的數字建 LoginStreak。
 *
 * 注意:Settings.{consecutiveDays, maxConsecutiveDays, lastLoginDate} 已標
 * @deprecated;階段 3D 批 1 之後 caller 全部讀 LoginStreak。本 helper 只在
 * **第一次 boot 時把舊資料搬過來**,搬完後 Settings 那三個欄位事實上 stale
 * 不再更新,等階段 3D 批 2 之後從 Dexie 型別刪除。
 */
async function migrateLegacyFromSettings(
  today: string
): Promise<LoginStreak | undefined> {
  const settings = await settingsRepo.get();
  if (!settings) return undefined;
  // 完全沒玩過 → 不算 legacy
  if (!settings.consecutiveDays && !settings.lastLoginDate) return undefined;

  const migrated: LoginStreak = {
    id: 'main',
    currentStreak: settings.consecutiveDays || 1,
    longestStreak: settings.maxConsecutiveDays || settings.consecutiveDays || 1,
    lastLoginDate: settings.lastLoginDate || today,
    todayClaimed: false,
    lifetimeLogins: settings.consecutiveDays || 1
  };
  await loginStreakRepo.put(migrated);
  // eslint-disable-next-line no-console
  console.log('[login] migrated legacy streak from Settings:', migrated);
  return migrated;
}

/** today 是不是 prev 的隔天(YYYY-MM-DD 字串) */
function isPreviousDay(prev: string, today: string): boolean {
  const prevDate = new Date(`${prev}T00:00:00+08:00`);
  const todayDate = new Date(`${today}T00:00:00+08:00`);
  const diff = todayDate.getTime() - prevDate.getTime();
  return Math.round(diff / 86_400_000) === 1;
}
