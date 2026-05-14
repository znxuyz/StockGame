/**
 * 階段 2 批次 B — `petRepo`:Dexie `pets` 表的 Repository 抽象。
 *
 * 49 個 call site,大宗包括:
 *  - `get(id)`(PetInfoModal / portfolio.ts feed/sell pet lookup / profileSync)
 *  - `patch(id, partial)`(RenameModal / BoostRealmModal / TemperRingModal /
 *    ColorVariantModal / BestiaryPetDetail / PhaserMap.lastRealmCheck etc — 全
 *    `db.pets.update(id, partial)` pattern)
 *  - `listActive`(filter retiredAt 為 falsy — Phaser 場景 / 持倉 / 成就)
 *  - `countBySpecies`(portfolio.ts buyOrFeed 判定「第一次召喚」+20 修為,v14
 *    speciesId 索引)
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import type { Pet } from '@/types';

export interface PetRepository {
  count(): Promise<number>;
  countBySpecies(speciesId: string): Promise<number>;
  get(id: string): Promise<Pet | undefined>;
  /** 全部(含已退役) */
  list(): Promise<Pet[]>;
  /** 仍在世(`retiredAt` falsy) */
  listActive(): Promise<Pet[]>;
  put(pet: Pet): Promise<void>;
  bulkPut(pets: Pet[]): Promise<void>;
  /** 等同 `db.pets.update(id, partial)` */
  patch(id: string, partial: Partial<Pet>): Promise<void>;
  clear(): Promise<void>;
}

class DexiePetRepo implements PetRepository {
  count(): Promise<number> {
    return db.pets.count();
  }
  countBySpecies(speciesId: string): Promise<number> {
    return db.pets.where('speciesId').equals(speciesId).count();
  }
  get(id: string): Promise<Pet | undefined> {
    return db.pets.get(id);
  }
  list(): Promise<Pet[]> {
    return db.pets.toArray();
  }
  listActive(): Promise<Pet[]> {
    return db.pets.filter((p) => !p.retiredAt).toArray();
  }
  async put(pet: Pet): Promise<void> {
    await db.pets.put(pet);
  }
  async bulkPut(pets: Pet[]): Promise<void> {
    await db.pets.bulkPut(pets);
  }
  async patch(id: string, partial: Partial<Pet>): Promise<void> {
    await db.pets.update(id, partial);
  }
  async clear(): Promise<void> {
    await db.pets.clear();
  }
}

export const petRepo: PetRepository = new DexiePetRepo();

/** 全部神獸(含已退役) */
export function useAllPets(): Pet[] | undefined {
  return useLiveQuery(() => petRepo.list(), []);
}

/** 仍在世神獸(`retiredAt` falsy)— Phaser / 持倉用 */
export function useActivePets(): Pet[] | undefined {
  return useLiveQuery(() => petRepo.listActive(), []);
}

export const dexiePetsTable = db.pets;
