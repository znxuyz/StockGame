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
  /**
   * 陣營分類(用中文 name 直接當值,方便 UI 直接顯示)。
   * 例:'天界' / '魔界' / '自然界' / '冥界' / '佛界' 等等。
   * 用 string 而非固定 enum,新增陣營不用改型別。
   */
  category: string;
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
