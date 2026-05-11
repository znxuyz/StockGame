/**
 * 圖鑑故事解鎖紀錄(階段 4C.3)。
 *
 * 每隻 creature 解鎖一次永久解鎖,即使賣光神獸再買回同 creatureId,
 * story 仍是解鎖狀態。append-only,不會 update。
 *
 * 主鍵 ++id auto-increment;creatureId 加唯一索引(`&`)防重複寫,
 * race condition 第二筆 add 會直接 throw 被 catch 跳過。
 */
export interface CreatureUnlock {
  /** Dexie auto-increment,寫入時不傳 */
  id?: number;
  /** 對應 creatures.ts 的 species id(例 'zhu-que-nie-pan') */
  creatureId: string;
  /** 解鎖時間 unix ms */
  unlockedAt: number;
}
