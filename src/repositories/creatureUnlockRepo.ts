/**
 * 階段 2 批次 B — `creatureUnlockRepo`:Dexie `creatureUnlocks` 表的 Repository 抽象。
 *
 * 階段 4C.3「圖鑑故事解鎖」,主鍵 ++id,`&creatureId` 唯一索引防 race。
 * 用途:玩家花 100 修為解鎖某 creatureId 的圖鑑故事,append 一筆 → 永久解鎖
 *      (即使該神獸退役)。
 *
 * 防呆:v12 → v13 過渡期間表可能還沒就緒,caller 用 `.toArray().catch(() => [])` 兜底。
 * Repository 不主動兜底,由 caller 視情境決定(cloudSync 兜,其他不兜)。
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import type { CreatureUnlock } from '@/types';

export interface CreatureUnlockRepository {
  list(): Promise<CreatureUnlock[]>;
  count(): Promise<number>;
  /** &creatureId 唯一索引 query — 階段 4C.3 BestiaryPetDetail 判定「已解鎖」 */
  getByCreatureId(creatureId: string): Promise<CreatureUnlock | undefined>;
  add(u: Omit<CreatureUnlock, 'id'>): Promise<number>;
  bulkPut(u: CreatureUnlock[]): Promise<void>;
  clear(): Promise<void>;
}

class DexieCreatureUnlockRepo implements CreatureUnlockRepository {
  list(): Promise<CreatureUnlock[]> {
    return db.creatureUnlocks.toArray();
  }
  count(): Promise<number> {
    return db.creatureUnlocks.count();
  }
  getByCreatureId(creatureId: string): Promise<CreatureUnlock | undefined> {
    return db.creatureUnlocks.where('creatureId').equals(creatureId).first();
  }
  async add(u: Omit<CreatureUnlock, 'id'>): Promise<number> {
    return db.creatureUnlocks.add(u as CreatureUnlock);
  }
  async bulkPut(u: CreatureUnlock[]): Promise<void> {
    await db.creatureUnlocks.bulkPut(u);
  }
  async clear(): Promise<void> {
    await db.creatureUnlocks.clear();
  }
}

export const creatureUnlockRepo: CreatureUnlockRepository = new DexieCreatureUnlockRepo();

export function useCreatureUnlocks(): CreatureUnlock[] | undefined {
  return useLiveQuery(() => creatureUnlockRepo.list(), []);
}

export const dexieCreatureUnlocksTable = db.creatureUnlocks;
