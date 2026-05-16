/**
 * 修為點數服務(階段 2.1 寫,階段 3D 批 1 改成走 Repository atomic ops)。
 *
 * 階段 3D 批 1 假設雲端有 `earn_cultivation` / `spend_cultivation` RPC,但
 * RPC 從來沒部署成功。階段 4-B 後 Repository 改成直接 upsert
 * `user_cultivation` 表,沒了 server-side atomic check(本機預檢餘額仍在)。
 * Service 層只負責業務驗證 + emit eventBus,不變。
 *
 * 對外 API:earnCultivation / spendCultivation / getCultivationBalance / ...
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
 * 賺取修為。透過 Repository 樂觀更新本機 + upsert 雲端 user_cultivation 表。
 * amount <= 0 視為 no-op,回當前餘額。回傳變動後餘額(若雲端失敗已 rollback,
 * 回的就是 rollback 後的舊餘額;repo 已 emit toast)。
 */
export async function earnCultivation(
  amount: number,
  reason: CultivationReason,
  reasonText: string,
  relatedPetId?: string
): Promise<number> {
  if (amount <= 0) return getCultivationBalance();

  const result = await cultivationRepo.earn(amount, reason, reasonText, relatedPetId);
  if (!result.ok) {
    // 雲端失敗已 rollback + toast,別 emit 'cultivation:earn'(避免飄字 + 任務觸發誤判)
    return result.newAmount;
  }
  eventBus.emit('cultivation:earn', { amount, reason, reasonText, relatedPetId });
  return result.newAmount;
}

export interface SpendResult {
  success: boolean;
  /** 失敗原因(僅 success=false 時填) */
  reason?: 'invalid_amount' | 'insufficient' | 'cloud_failed';
  /** 變動後餘額(僅 success=true 時填) */
  newBalance?: number;
}

/**
 * 消耗修為。樂觀更新本機 + 雲端 upsert。
 * 餘額不足 → success=false reason='insufficient'(本機預檢)。
 * 雲端寫失敗 → repo 已 rollback + emit toast,本 service 回 success=false
 *   reason='cloud_failed';caller(RenameModal 等)看到非 success 就停止業務動作。
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
    // 'no_row' 對玩家視角等同 insufficient(都是「錢不夠」)— UI 訊息可以共用
    let uiReason: SpendResult['reason'];
    if (result.reason === 'invalid_amount') uiReason = 'invalid_amount';
    else if (result.reason === 'cloud_failed') uiReason = 'cloud_failed';
    else uiReason = 'insufficient';
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
