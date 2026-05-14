/**
 * useCultivation hook(階段 2.2)。
 *
 * 訂閱 Dexie userCultivation singleton row,任何 earn / spend 寫入都會
 * 自動 retrigger live query → React 重 render,HUD 修為數字即時更新。
 *
 * 沒紀錄(新玩家)時回 zero 狀態,避免下游 component 各自 ?? 0 處理。
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { cultivationRepo } from '@/repositories/cultivationRepo';
import type { CultivationDetail } from '@/services';

const ZERO: CultivationDetail = {
  amount: 0,
  lifetimeEarned: 0,
  lifetimeSpent: 0
};

export function useCultivation(): CultivationDetail {
  const detail = useLiveQuery(
    async (): Promise<CultivationDetail> => {
      const c = await cultivationRepo.getBalance();
      return c
        ? {
            amount: c.amount,
            lifetimeEarned: c.lifetimeEarned,
            lifetimeSpent: c.lifetimeSpent
          }
        : ZERO;
    },
    [],
    ZERO // initial value 第一次 render 不會 undefined,省掉 ?? boilerplate
  );
  return detail;
}
