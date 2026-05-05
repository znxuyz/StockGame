import type { Tier } from './creature';

/** 寵物實例 */
export interface Pet {
  /** 唯一 id（UUID） */
  id: string;
  /** 對應股票代號（與 holding.code 一致） */
  code: string;
  /** 神獸種類 id */
  speciesId: string;
  /** 當前境界 */
  tier: Tier;
  /** 修為等級 1-99 */
  level: number;
  /** 累積經驗（用於計算 level，避免直接改 level 出現浮點誤差） */
  exp: number;
  /** 是否處於黑化狀態 */
  isCorrupted: boolean;
  /** 已突破境界的次數（含黑化進化） */
  evolutionCount: number;
  /** 首次黑化時間（成就用） */
  firstCorruptedAt?: number;
  /** 已淨化次數 */
  purificationCount: number;
  /** 在地圖上的位置 */
  position: { x: number; y: number };
  /** 寵物在地圖的「領地」中心；移動以此為中心做隨機漫步 */
  territory: { x: number; y: number };
  /** 出生時間（unix millis） */
  bornAt: number;
  /** 退役時間（unix millis）— 賣光股票時設定，非 null 表示已進圖鑑 */
  retiredAt?: number;
}
