import type { Tier } from './creature';

/** 正向境界（不含凶獸） */
export type NormalTier = Exclude<Tier, 'cursed1' | 'cursed2' | 'cursed3'>;

/** 寵物實例 */
export interface Pet {
  /** 唯一 id（UUID） */
  id: string;
  /** 對應股票代號（與 holding.code 一致） */
  code: string;
  /** 神獸種類 id */
  speciesId: string;
  /** 當前顯示境界（可能是 cursed1/2/3） */
  tier: Tier;
  /**
   * 已達到過的最高正向境界。
   * 用於淨化時還原（例如已成神獸後黑化，淨化會回到神獸境）。
   * 永遠是 normal-celestial 之一，不會是凶獸。
   */
  maxNormalTier: NormalTier;
  /** 修為等級 1-99（依累積投入金額計算） */
  level: number;
  /** 已突破境界的次數（含黑化進化） */
  evolutionCount: number;
  /** 首次黑化時間（成就用） */
  firstCorruptedAt?: number;
  /** 已淨化次數 */
  purificationCount: number;
  /** 出生時間（unix millis） */
  bornAt: number;
  /** 退役時間（unix millis）— 賣光股票時設定，非 null 表示已進圖鑑 */
  retiredAt?: number;
}

/** 是否處於黑化狀態（從 tier 推導） */
export function isCorrupted(pet: Pick<Pet, 'tier'>): boolean {
  return pet.tier === 'cursed1' || pet.tier === 'cursed2' || pet.tier === 'cursed3';
}
