/**
 * 修為點數服務(階段 2.1)。
 *
 * 兩個責任:
 *  1. 維護 userCultivation 單例 row(amount / lifetimeEarned / lifetimeSpent)
 *  2. append-only cultivationLog 記錄每筆變動
 *
 * 對外 API 全用 named export functions(跟 codebase 既有 portfolio.ts 一致),
 * 不走 class instance — 簡化 React 使用 + 沒 mock 需求。
 *
 * 階段 2.1 不做的事:
 *  ✗ HUD 顯示             → 階段 2.2
 *  ✗ 5 個來源整合進業務邏輯 → 階段 2.3
 *  ✗ 飄字動畫              → 階段 2.4(eventBus 已先準備好讓 2.4 接)
 *  ✗ 紀錄 tab UI           → 階段 2.5
 *  ✗ Supabase 同步          → 階段 2.6
 */

import { db } from '@/db';
import type { CultivationLog, CultivationReason, UserCultivation } from '@/types';
import { eventBus } from './eventBus';

/** singleton row 主鍵,專案目前單一玩家所以固定字串 */
const SINGLETON_ID = 'main' as const;

/**
 * 確保 userCultivation 有 row,沒有就建一個 zero 狀態的並回傳。
 * 私有 helper:earn / spend / getDetail 都會用到。
 */
async function ensureCultivation(): Promise<UserCultivation> {
  const existing = await db.userCultivation.get(SINGLETON_ID);
  if (existing) return existing;
  const init: UserCultivation = {
    id: SINGLETON_ID,
    amount: 0,
    lifetimeEarned: 0,
    lifetimeSpent: 0,
    lastUpdated: Date.now()
  };
  await db.userCultivation.put(init);
  return init;
}

/** 當前修為餘額。沒紀錄回 0(不會 throw)。 */
export async function getCultivationBalance(): Promise<number> {
  const c = await db.userCultivation.get(SINGLETON_ID);
  return c?.amount ?? 0;
}

export interface CultivationDetail {
  amount: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
}

/** 餘額 + lifetime 統計三件組,給紀錄 tab 顯示用 */
export async function getCultivationDetail(): Promise<CultivationDetail> {
  const c = await db.userCultivation.get(SINGLETON_ID);
  return {
    amount: c?.amount ?? 0,
    lifetimeEarned: c?.lifetimeEarned ?? 0,
    lifetimeSpent: c?.lifetimeSpent ?? 0
  };
}

/**
 * 賺取修為。寫 log + 更新 lifetimeEarned + emit 'cultivation:earn'。
 * amount <= 0 視為 no-op 直接回當前 balance(防呆,呼叫端不需自己 if)。
 * 回傳變動後餘額,呼叫端可立即接到。
 */
export async function earnCultivation(
  amount: number,
  reason: CultivationReason,
  reasonText: string,
  relatedPetId?: string
): Promise<number> {
  if (amount <= 0) return getCultivationBalance();

  const current = await ensureCultivation();
  const newAmount = current.amount + amount;
  const now = Date.now();

  await db.userCultivation.put({
    ...current,
    amount: newAmount,
    lifetimeEarned: current.lifetimeEarned + amount,
    lastUpdated: now
  });
  await db.cultivationLog.add({
    change: amount,
    reason,
    reasonText,
    balanceAfter: newAmount,
    createdAt: now,
    relatedPetId
  });

  eventBus.emit('cultivation:earn', { amount, reason, reasonText });
  return newAmount;
}

export interface SpendResult {
  success: boolean;
  /** 失敗原因(僅 success=false 時填) */
  reason?: 'invalid_amount' | 'insufficient';
  /** 變動後餘額(僅 success=true 時填) */
  newBalance?: number;
}

/**
 * 消耗修為(階段 4 才有 caller)。
 * 餘額不足直接回 success=false,**保證 amount 不變成負數**。
 * 同步寫 log + 更新 lifetimeSpent + emit 'cultivation:spend'。
 */
export async function spendCultivation(
  amount: number,
  reason: CultivationReason,
  reasonText: string,
  relatedPetId?: string
): Promise<SpendResult> {
  if (amount <= 0) return { success: false, reason: 'invalid_amount' };

  const current = await ensureCultivation();
  if (current.amount < amount) {
    return { success: false, reason: 'insufficient' };
  }

  const newAmount = current.amount - amount;
  const now = Date.now();

  await db.userCultivation.put({
    ...current,
    amount: newAmount,
    lifetimeSpent: current.lifetimeSpent + amount,
    lastUpdated: now
  });
  await db.cultivationLog.add({
    change: -amount,
    reason,
    reasonText,
    balanceAfter: newAmount,
    createdAt: now,
    relatedPetId
  });

  eventBus.emit('cultivation:spend', { amount, reason, reasonText });
  return { success: true, newBalance: newAmount };
}

/**
 * 取最近 N 筆變動歷史,時間倒序(最新在前)。
 * 紀錄 tab 列表用,預設 50 筆,點「載入更多」可遞增 limit。
 */
export async function getCultivationHistory(limit: number = 50): Promise<CultivationLog[]> {
  return db.cultivationLog.orderBy('createdAt').reverse().limit(limit).toArray();
}
