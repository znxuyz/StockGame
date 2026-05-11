/**
 * 圖鑑故事解鎖 service(階段 4C.3)。
 *
 * 解鎖一隻 100 修為,寫 db.creatureUnlocks。
 * &creatureId 唯一索引防 race(第二筆 add 直接 throw → catch 跳過)。
 * 賣光重買仍解鎖,因為紀錄是 per-creatureId 不是 per-pet。
 */

import { db } from '@/db';
import { spendCultivation } from './cultivationService';

export const STORY_UNLOCK_COST = 100;

export interface UnlockResult {
  success: boolean;
  reason?: 'invalid' | 'insufficient' | 'already_unlocked' | 'unknown';
}

/**
 * 解鎖某 creature 的修仙傳說故事。
 *  - 若已解鎖直接 success(idempotent)
 *  - 修為足夠 → spendCultivation(100, 'unlock_story', `解鎖傳說:X`)
 *  - 寫入 creatureUnlocks(race condition 第二筆 add throw 直接吞)
 */
export async function unlockCreatureStory(
  creatureId: string,
  displayName: string
): Promise<UnlockResult> {
  if (!creatureId) return { success: false, reason: 'invalid' };

  // idempotent:已解鎖直接 OK,不重複扣費
  const existing = await db.creatureUnlocks.where('creatureId').equals(creatureId).first();
  if (existing) return { success: true, reason: 'already_unlocked' };

  const r = await spendCultivation(
    STORY_UNLOCK_COST,
    'unlock_story',
    `解鎖傳說:${displayName}`
  );
  if (!r.success) {
    return { success: false, reason: r.reason === 'insufficient' ? 'insufficient' : 'unknown' };
  }

  try {
    await db.creatureUnlocks.add({
      creatureId,
      unlockedAt: Date.now()
    });
  } catch {
    // race:另一個並發 add 已寫入(&creatureId 唯一索引 throw),已 spend 過,視為成功
  }

  return { success: true };
}
