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
import type { Holding, Pet, Stock, Transaction } from '@/types';
import { uuid, calcFee, calcTax, type FeeConfig } from '@/utils';
import { calculateLevel } from './evolution';
import { earnCultivation } from './cultivationService';
import { emitTaskTrigger } from './taskService';
import { pickRandomCreature, getCreature } from '@/data/creatures';
import { getRingEffect } from './petTier';

/** 修為獎勵金額(階段 2.3),改數字直接從這調 */
const CULTIVATION_REWARD = {
  /** 每升 1 級 */
  perLevelUp: 5,
  /** 第一次召喚某神獸種類進圖鑑 */
  firstSummon: 20,
  /** 賣出獲利,每 NT$1,000 利潤 = 1 點 */
  perThousandProfit: 1
} as const;

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

  /**
   * 階段 2.3 獎勵收集:transaction 結束後一次發 earnCultivation,
   * 避免在交易 tx 內 await 外部 service(會卡住 Dexie tx,且 service 自己也寫 db)。
   */
  const cultivationRewards: Array<{
    amount: number;
    reason: 'pet_level_up' | 'pet_added_codex';
    reasonText: string;
    petId: string;
  }> = [];

  const result = await db.transaction('rw', db.holdings, db.pets, db.transactions, db.stocks, async () => {
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
      const newLevel = calculateLevel(grossAmount + fee);
      pet = {
        id: newPetId,
        code: params.stock.code,
        speciesId: species.id,
        level: newLevel,
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

      // 第一次召喚此 species(包含已退役的舊 pet 也算)→ +20 修為
      const existingSameSpeciesCount = await db.pets
        .where('speciesId')
        .equals(species.id)
        .count();
      if (existingSameSpeciesCount === 0) {
        cultivationRewards.push({
          amount: CULTIVATION_REWARD.firstSummon,
          reason: 'pet_added_codex',
          reasonText: `召喚新神獸:${species.name}`,
          petId: newPetId
        });
      }

      // 新檔買入也算「從 0 升到 newLevel」→ 每級 +5
      if (newLevel > 0) {
        cultivationRewards.push({
          amount: newLevel * CULTIVATION_REWARD.perLevelUp,
          reason: 'pet_level_up',
          reasonText: `${species.name} 達 Lv.${newLevel}`,
          petId: newPetId
        });
      }

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
      const oldLevel = existingPet.level;
      const newLevel = calculateLevel(holding.totalCost);
      pet = {
        ...existingPet,
        level: newLevel
      };
      await db.pets.put(pet);

      // 加碼後升級 → 每升 1 級 +5 修為
      if (newLevel > oldLevel) {
        const species = getCreature(pet.speciesId);
        cultivationRewards.push({
          amount: (newLevel - oldLevel) * CULTIVATION_REWARD.perLevelUp,
          reason: 'pet_level_up',
          reasonText: `${species?.name ?? '神獸'} 升至 Lv.${newLevel}`,
          petId: pet.id
        });
      }
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

  // tx 結束後發修為獎勵(每筆獨立寫 db,飄字事件也按順序 emit)
  for (const r of cultivationRewards) {
    await earnCultivation(r.amount, r.reason, r.reasonText, r.petId);
  }

  // 階段 3.7:任務 trigger emit(放最後,跟修為獎勵同樣 tx 完才出)
  // - 新檔買入 → pet_buy_new + pet_buy_amount(amount = netAmount,跟買入花費同基準)
  // - 加碼     → pet_feed   + pet_buy_amount + pet_level_up(if 升級)
  if (result.transaction.type === 'buy') {
    emitTaskTrigger('pet_buy_new', 1);
  } else if (result.transaction.type === 'feed') {
    emitTaskTrigger('pet_feed', 1);
  }
  emitTaskTrigger('pet_buy_amount', netAmount);
  // levelGained:同 cultivationRewards 已收集 pet_level_up 獎勵,這裡再從 reward 推回
  const levelUpReward = cultivationRewards.find((r) => r.reason === 'pet_level_up');
  if (levelUpReward) {
    // amount = (newLv - oldLv) * 5 → levelsGained = amount / 5
    const levelsGained = Math.round(levelUpReward.amount / 5);
    if (levelsGained > 0) emitTaskTrigger('pet_level_up', levelsGained);
  }

  return result;
}

/**
 * 賣出（部分或全部）。
 * 賣光時刪除 holding、寵物標記 retiredAt 進圖鑑。
 */
export async function sell(params: SellParams): Promise<ActionResult> {
  ensureValidQty(params.shares);
  ensureValidPrice(params.price);

  /**
   * 賣出獲利的修為獎勵 — tx 內計算好 realizedPnL 後 push,tx 完跑 earnCultivation。
   * 設計:**每次** sell 都按該次 realizedPnL > 0 給,部分賣 / 全賣都算。
   * 這樣賣高位部分減倉也有獎勵,不只 settle 全部時。
   */
  interface SellReward {
    amount: number;
    reasonText: string;
    petId: string;
  }
  const sellRewards: SellReward[] = [];

  const result = await db.transaction('rw', db.holdings, db.pets, db.transactions, db.stocks, async () => {
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
      // 階段 4C.2:退役當下的魂環特效快照,圖鑑卡用這個還原動態效果
      // (退役後沒持倉/價格資料即時算了)。按賣出時的市價 / 累積投入算 returnRate。
      const finalReturnRate =
        holding.totalCost > 0
          ? (params.price * params.shares - holding.totalCost) / holding.totalCost
          : 0;
      pet = {
        ...existingPet,
        retiredAt: params.now,
        finalEffect: getRingEffect(finalReturnRate)
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

    // 階段 2.3:該次賣出有獲利 → floor(realizedPnL / 1000) 修為(tx 完才發)
    if (realizedPnL > 0) {
      const earned = Math.floor(realizedPnL * CULTIVATION_REWARD.perThousandProfit / 1000);
      if (earned > 0) {
        const species = getCreature(pet.speciesId);
        sellRewards.push({
          amount: earned,
          reasonText: `賣出 ${species?.name ?? '神獸'} 獲利 NT$${realizedPnL.toLocaleString('en-US')}`,
          petId: pet.id
        });
      }
    }

    return { holding: updatedHolding, pet, transaction };
  });

  for (const r of sellRewards) {
    await earnCultivation(r.amount, 'sell_profit', r.reasonText, r.petId);
  }

  // 階段 3.7:該次賣出有獲利 → 觸發 pet_sell_profit task trigger(計次任務)
  if (sellRewards.length > 0) {
    emitTaskTrigger('pet_sell_profit', 1);
  }

  return result;
}
