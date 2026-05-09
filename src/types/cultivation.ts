/**
 * 修為點數系統 types(階段 2.1)。
 *
 * 兩個 IndexedDB table:
 *   userCultivation — 玩家修為總額,單一 row(id='main')
 *   cultivationLog  — 修為變動歷史,append-only,id auto-increment
 *
 * 整套 reason 代碼分三個階段:
 *   階段 2 實作:升級 / 突破 / 特效 / 召喚 / 賣出獲利
 *   階段 3 預留:每日簽到 / 連登 / 任務 / 成就
 *   階段 4 預留:改名 / 催熟 / 淬煉 / 換皮 / 主題 / 紀念 / 故事(全消耗類)
 */

export type CultivationReason =
  // ── 賺取(階段 2 實作) ─────────
  | 'pet_level_up'
  | 'realm_breakthrough'
  | 'effect_unlock'
  | 'pet_added_codex'
  | 'sell_profit'
  // ── 賺取(階段 3 預留) ─────────
  | 'daily_login'
  | 'streak_7'
  | 'streak_30'
  | 'daily_task'
  | 'weekly_task'
  | 'achievement'
  // ── 消耗(階段 4 預留) ─────────
  | 'rename'
  | 'realm_boost'
  | 'effect_boost'
  | 'recolor'
  | 'background'
  | 'theme'
  | 'eternal'
  | 'unlock_story';

export interface UserCultivation {
  /** singleton 主鍵,固定 'main'(單一玩家) */
  id: 'main';
  /** 當前修為餘額 */
  amount: number;
  /** 歷史總獲得(只增不減) */
  lifetimeEarned: number;
  /** 歷史總消耗(只增不減) */
  lifetimeSpent: number;
  /** 最後一次變動時間(unix millis,跟 cloud sync 衝突解決用) */
  lastUpdated: number;
}

export interface CultivationLog {
  /** Dexie auto-increment,寫入時不傳,讀取時必有 */
  id?: number;
  /** 變動量,正數=賺,負數=花 */
  change: number;
  /** 變動原因代碼(reason union) */
  reason: CultivationReason;
  /** 顯示文字(中文 + 神獸名 + 數字) */
  reasonText: string;
  /** 變動後餘額(用於對帳) */
  balanceAfter: number;
  /** unix millis */
  createdAt: number;
  /** 關聯神獸 id,點紀錄可跳該 pet 詳細頁(階段 2.5 用) */
  relatedPetId?: string;
}
