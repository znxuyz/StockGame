import { db } from './schema';
import type { Settings } from '@/types';

/**
 * 第一次啟動時種入：
 *  - 預設設定（台新無折扣、最低 NT$20）
 *
 * 不種入起手股票清單（玩家從零開始，買什麼加什麼）。
 * 後續每次啟動如果 settings 已存在就略過，避免覆蓋玩家設定。
 */
export async function seedIfEmpty(): Promise<void> {
  const settingsCount = await db.settings.count();
  if (settingsCount === 0) {
    const initial: Settings = {
      id: 'singleton',
      brokerageFeeDiscount: 1.0, // 台新無折扣
      brokerageMinFee: 20,
      soundEnabled: true,
      createdAt: Date.now()
    };
    await db.settings.put(initial);
  }
}
