/**
 * 修為點數服務(階段 2.1 寫,階段 3D 批 1 改成走 Repository atomic ops)。
 *
 * 階段 3D 批 1 之後,balance + log 的原子性由 Repository 內部
 * (CloudFirstCultivationRepo)透過 Supabase RPC `earn_cultivation` /
 * `spend_cultivation` 保證。Service 層只負責業務驗證 + emit eventBus。
 *
 * 對外 API 不變:earnCultivation / spendCultivation / getCultivationBalance / ...
 */

import { cultivationRepo } from '@/repositories/cultivationRepo';
import type { CultivationLog, CultivationReason } from '@/types';
import { eventBus } from './eventBus';

/** 當前修為餘額。沒紀錄回 0(不會 throw)。 */
export async function getCultivationBalance(): Promise<number> {
  const c = await cultivationRepo.getBalance();
  return c?.amount ?? 0;
}

export interface CultivationDetail {
  amount: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
}

export async function getCultivationDetail(): Promise<CultivationDetail> {
  const c = await cultivationRepo.getBalance();
  return {
    amount: c?.amount ?? 0,
    lifetimeEarned: c?.lifetimeEarned ?? 0,
    lifetimeSpent: c?.lifetimeSpent ?? 0
  };
}

/**
 * 賺取修為。透過 Repository 走 RPC `earn_cultivation`(雲端 atomically upsert balance + log)。
 * amount <= 0 視為 no-op,回當前餘額。回傳變動後餘額。
 */
export async function earnCultivation(
  amount: number,
  reason: CultivationReason,
  reasonText: string,
  relatedPetId?: string
): Promise<number> {
  if (amount <= 0) return getCultivationBalance();

  const result = await cultivationRepo.earn(amount, reason, reasonText, relatedPetId);
  // earn 永遠回 ok(invalid_amount 已被上面擋掉);雲端失敗 throw 已由 Repo 處理
  eventBus.emit('cultivation:earn', { amount, reason, reasonText, relatedPetId });
  return result.newAmount;
}

export interface SpendResult {
  success: boolean;
  /** 失敗原因(僅 success=false 時填) */
  reason?: 'invalid_amount' | 'insufficient';
  /** 變動後餘額(僅 success=true 時填) */
  newBalance?: number;
}

/**
 * 消耗修為。透過 Repository 走 RPC `spend_cultivation`(雲端 atomic check + 扣)。
 * 餘額不足 → 回 success=false,不會扣到負數(RPC 端 WHERE amount >= delta 保證)。
 */
export async function spendCultivation(
  amount: number,
  reason: CultivationReason,
  reasonText: string,
  relatedPetId?: string
): Promise<SpendResult> {
  if (amount <= 0) return { success: false, reason: 'invalid_amount' };

  const result = await cultivationRepo.spend(amount, reason, reasonText, relatedPetId);
  if (!result.ok) {
    // Repo 的 'no_row' 對外視為 insufficient(玩家視角沒差別,都是錢不夠)
    const uiReason = result.reason === 'invalid_amount' ? 'invalid_amount' : 'insufficient';
    return { success: false, reason: uiReason };
  }

  eventBus.emit('cultivation:spend', { amount, reason, reasonText, relatedPetId });
  return { success: true, newBalance: result.newAmount };
}

/**
 * 取最近 N 筆變動歷史,時間倒序(最新在前)。
 * 紀錄 tab 列表用,預設 50 筆,點「載入更多」可遞增 limit。
 */
export async function getCultivationHistory(limit: number = 50): Promise<CultivationLog[]> {
  return cultivationRepo.listRecentLogs(limit);
}
