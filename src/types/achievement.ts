/** 成就分類 */
export type AchievementCategory =
  | 'collection' // 收集類
  | 'profit' // 獲利類
  | 'loss' // 虧損類
  | 'evolution' // 進化類
  | 'long-term' // 長期類
  | 'operation' // 操作類
  | 'social'; // 社交類（單機階段隱藏）

/** 成就靜態定義 */
export interface AchievementDef {
  id: string;
  category: AchievementCategory;
  name: string;
  description: string;
  /** 達成所需數值（用於進度條顯示；無數值的成就此欄為 1） */
  target: number;
  /** 隱藏成就（解鎖前不顯示描述） */
  hidden?: boolean;
}

/** 玩家成就進度（DB 記錄；未開始的成就不存在於表中，初次更新進度時建立） */
export interface AchievementProgress {
  /** 成就 id */
  id: string;
  /** 目前進度 */
  current: number;
  /** 解鎖時間（達成時填上 unix millis；未解鎖為 undefined） */
  unlockedAt?: number;
}
