/**
 * 神獸境界（六階正向 + 三階凶獸）。
 * 升降轉換規則由 evolution 模組統一處理。
 */
export type Tier =
  | 'normal' // 凡獸
  | 'spirit' // 靈獸
  | 'demon' // 妖獸
  | 'god' // 神獸
  | 'saint' // 聖獸
  | 'celestial' // 仙獸
  | 'cursed1' // 凶獸一階
  | 'cursed2' // 凶獸二階
  | 'cursed3'; // 凶獸三階

export const TIER_ORDER: Tier[] = [
  'normal',
  'spirit',
  'demon',
  'god',
  'saint',
  'celestial'
];

export const CURSED_ORDER: Tier[] = ['cursed1', 'cursed2', 'cursed3'];

/** 神獸種類定義（靜態資料） */
export interface CreatureSpecies {
  /** 唯一 id（英文 slug，方便日後加圖檔） */
  id: string;
  /** 顯示名稱 */
  name: string;
  /** 山海經分類（純語意，不影響邏輯） */
  category:
    | 'four-symbols' // 四象
    | 'dragon' // 龍族
    | 'bird' // 鳥族
    | 'lucky' // 招財類
    | 'beast' // 異獸
    | 'aquatic' // 水族
    | 'spirit' // 靈體
    | 'cursed'; // 四凶（黑化專用）
  /** 簡短描述（彈窗用） */
  description: string;
  /** placeholder emoji（沒立繪 / 立繪載入失敗時顯示） */
  emoji: string;
  /**
   * 是否有對應立繪檔。設 true 時 Phaser 會嘗試載入
   * `public/sprites/<id>.png`,載得到顯示圖、載不到 fallback 用 emoji。
   * 不設或 false → 永遠顯示 emoji。
   */
  art?: boolean;
  /** 是否凶獸專用（不會在隨機池裡） */
  cursedOnly?: boolean;
}
