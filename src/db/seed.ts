import { db } from './schema';
import { STARTER_STOCKS } from '@/data/stocks';
import type { Settings } from '@/types';

/**
 * 第一次啟動時種入：
 *  - 起手包股票清單
 *  - 預設設定（台新無折扣、最低 NT$20）
 *
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

  const stockCount = await db.stocks.count();
  if (stockCount === 0) {
    await db.stocks.bulkPut(STARTER_STOCKS);
  }
}
