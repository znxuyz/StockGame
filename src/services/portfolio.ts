/**
 * 三大核心動作：買入新檔 / 加碼 / 賣出。
 *
 * 設計原則：
 *  - 一律以 Dexie transaction 包起來，確保 holding/pet/transaction 三表一致
 *  - 失敗就 throw，不靜默吞
 *  - 不主動觸發 evolution；evolution 由「價格更新後」或外部呼叫 evaluatePetEvolution() 決定
 *    （理由：買入當下還沒有最新價，計算 returnRate 沒意義，等下次抓價再判定）
 *  - 不在這裡計算成就（移到 achievements.ts，外部統一觸發）
 *
 * 所有金額都是 NT$ 整數（手續費/稅 floor）；股價可以小數。
 */

import { db } from '@/db';
import type { Holding, Pet, Stock, Transaction, NormalTier } from '@/types';
import { uuid, calcFee, calcTax, type FeeConfig } from '@/utils';
import { calculateLevel } from './evolution';
import { pickRandomCreature } from '@/data/creatures';

export interface BuyParams {
  /** 已查到的股票 */
  stock: Stock;
  /** 股數（必須 > 0） */
  shares: number;
  /** 每股成本價 */
  price: number;
  /** 手續費設定 */
  feeConfig: FeeConfig;
  /** 交易時間（unix millis）；通常傳 Date.now()，測試可注入 */
  now: number;
}

export interface SellParams {
  code: string;
  shares: number;
  price: number;
  feeConfig: FeeConfig;
  now: number;
}

export interface ActionResult {
  /** 完成後的最新 holding（賣光後為 null） */
  holding: Holding | null;
  /** 完成後的最新 pet */
  pet: Pet;
  /** 寫入的 transaction 紀錄 */
  transaction: Transaction;
}

function ensureValidQty(shares: number) {
  if (!Number.isFinite(shares) || shares <= 0 || !Number.isInteger(shares)) {
    throw new Error('股數必須是正整數');
  }
}
function ensureValidPrice(price: number) {
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('價格必須大於 0');
  }
}

/**
 * 買入或加碼（自動偵測）。
 * 若該代號已有 holding 走加碼路徑、會更新平均成本；否則建新 holding + 新寵物。
 */
export async function buyOrFeed(params: BuyParams): Promise<ActionResult> {
  ensureValidQty(params.shares);
  ensureValidPrice(params.price);

  const grossAmount = Math.round(params.shares * params.price);
  const fee = calcFee(grossAmount, params.feeConfig);
  const netAmount = grossAmount + fee;

  return await db.transaction('rw', db.holdings, db.pets, db.transactions, db.stocks, async () => {
    // 確保 stocks 表有這檔
    const existingStock = await db.stocks.get(params.stock.code);
    if (!existingStock) {
      await db.stocks.put(params.stock);
    }

    const existingHolding = await db.holdings.get(params.stock.code);
    let holding: Holding;
    let pet: Pet;
    let txnType: Transaction['type'];

    if (!existingHolding) {
      // 新檔買入：建立 holding + 隨機抽神獸
      txnType = 'buy';
      const species = pickRandomCreature();
      const newPetId = uuid();
      const startTier: NormalTier = 'normal';
      pet = {
        id: newPetId,
        code: params.stock.code,
        speciesId: species.id,
        tier: startTier,
        maxNormalTier: startTier,
        level: calculateLevel(grossAmount + fee),
        evolutionCount: 0,
        purificationCount: 0,
        position: { x: 0, y: 0 }, // 由 game scene 在生成時實際派位
        territory: { x: 0, y: 0 },
        bornAt: params.now
      };
      holding = {
        code: params.stock.code,
        shares: params.shares,
        avgCost: netAmount / params.shares, // 含手續費的每股成本
        totalCost: netAmount,
        realizedPnL: 0,
        firstPurchasedAt: params.now,
        lastTransactionAt: params.now,
        petId: newPetId
      };
      await db.pets.put(pet);
      await db.holdings.put(holding);
    } else {
      // 加碼
      txnType = 'feed';
      const newShares = existingHolding.shares + params.shares;
      const newTotalCost = existingHolding.totalCost + netAmount;
      const newAvgCost = newTotalCost / newShares;
      holding = {
        ...existingHolding,
        shares: newShares,
        totalCost: newTotalCost,
        avgCost: newAvgCost,
        lastTransactionAt: params.now
      };
      await db.holdings.put(holding);

      const existingPet = await db.pets.get(existingHolding.petId);
      if (!existingPet) {
        throw new Error(`資料不一致：找不到 holding ${params.stock.code} 對應的寵物`);
      }
      pet = {
        ...existingPet,
        level: calculateLevel(holding.totalCost)
      };
      await db.pets.put(pet);
    }

    const transaction: Transaction = {
      id: uuid(),
      code: params.stock.code,
      type: txnType,
      shares: params.shares,
      price: params.price,
      grossAmount,
      fee,
      tax: 0,
      netAmount,
      realizedPnL: 0,
      timestamp: params.now
    };
    await db.transactions.put(transaction);

    return { holding, pet, transaction };
  });
}

/**
 * 賣出（部分或全部）。
 * 賣光時刪除 holding、寵物標記 retiredAt 進圖鑑。
 */
export async function sell(params: SellParams): Promise<ActionResult> {
  ensureValidQty(params.shares);
  ensureValidPrice(params.price);

  return await db.transaction('rw', db.holdings, db.pets, db.transactions, db.stocks, async () => {
    const holding = await db.holdings.get(params.code);
    if (!holding) {
      throw new Error(`沒有持有 ${params.code}，無法賣出`);
    }
    if (params.shares > holding.shares) {
      throw new Error(`持有 ${holding.shares} 股，無法賣出 ${params.shares} 股`);
    }

    const stock = await db.stocks.get(params.code);
    if (!stock) {
      throw new Error(`股票主檔遺失：${params.code}`);
    }

    const grossAmount = Math.round(params.shares * params.price);
    const fee = calcFee(grossAmount, params.feeConfig);
    const tax = calcTax(grossAmount, stock.market, true);
    const netAmount = grossAmount - fee - tax;

    // 已實現損益 = 賣出實收 - 賣出股數對應的成本（avgCost 含先前手續費）
    const costOfSoldShares = holding.avgCost * params.shares;
    const realizedPnL = Math.round(netAmount - costOfSoldShares);

    const remainingShares = holding.shares - params.shares;
    let updatedHolding: Holding | null;
    let pet: Pet;

    if (remainingShares === 0) {
      // 全部賣完：刪 holding、寵物退役進圖鑑
      const existingPet = await db.pets.get(holding.petId);
      if (!existingPet) throw new Error(`資料不一致：找不到 ${params.code} 的寵物`);
      pet = {
        ...existingPet,
        retiredAt: params.now
      };
      await db.pets.put(pet);
      await db.holdings.delete(params.code);
      updatedHolding = null;
    } else {
      // 部分賣出：減股數、平均成本不變（會計實務）
      // totalCost 同比例縮減，realizedPnL 累積
      const remainingCost = holding.totalCost - costOfSoldShares;
      updatedHolding = {
        ...holding,
        shares: remainingShares,
        totalCost: Math.round(remainingCost),
        // avgCost 維持不變（部分賣出不影響每股成本）
        realizedPnL: holding.realizedPnL + realizedPnL,
        lastTransactionAt: params.now
      };
      await db.holdings.put(updatedHolding);

      const existingPet = await db.pets.get(holding.petId);
      if (!existingPet) throw new Error(`資料不一致：找不到 ${params.code} 的寵物`);
      pet = {
        ...existingPet,
        level: calculateLevel(updatedHolding.totalCost)
      };
      await db.pets.put(pet);
    }

    const transaction: Transaction = {
      id: uuid(),
      code: params.code,
      type: 'sell',
      shares: params.shares,
      price: params.price,
      grossAmount,
      fee,
      tax,
      netAmount,
      realizedPnL,
      timestamp: params.now
    };
    await db.transactions.put(transaction);

    return { holding: updatedHolding, pet, transaction };
  });
}
