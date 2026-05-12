/**
 * 階段 5B:好友展示神獸 + 公開神獸 summary + 修煉里程碑。
 *
 * 對應三張新 Supabase 表(見 `supabase/migrations/20260512_stage5b_friends_profile.sql`)。
 * 全部讀放給所有登入用戶,寫只能寫自己 — 好友個人頁需要讀對方資料才能展示。
 *
 * 設計取捨:
 *  - `user_creature_summary` 不存金額(只存境界 / 等級 / 永恆 / 召喚時間)
 *    所以對方能看你「擁有什麼神獸」但不知道「投入多少錢」
 *  - `user_milestones` 是 append-only event log;退役不寫紀念,因為退役不算正面事件
 */

export type SoulRealmId = 'fan' | 'ling' | 'yao' | 'shen' | 'sheng' | 'xian';

export interface UserShowcase {
  userId: string;
  /** 1-3 個 creature species id;玩家還沒選時為空 array,UI 自動 fallback 預設 */
  showcaseCreatureIds: string[];
  updatedAt: string;
}

export interface CreatureSummary {
  userId: string;
  creatureSpeciesId: string;
  isEternal: boolean;
  highestRealm: SoulRealmId;
  highestLevel: number;
  firstSummonedAt: string;
  updatedAt: string;
}

export type MilestoneEventType = 'summon' | 'realm_up' | 'title_up' | 'streak' | 'eternal';

export interface MilestoneEventData {
  /** summon / realm_up / eternal 用:神獸 species id */
  creatureId?: string;
  /** summon / realm_up / eternal 用:神獸顯示名(可帶玩家自訂名) */
  creatureName?: string;
  /** realm_up 用:升到的境界 */
  realm?: SoulRealmId;
  realmLabel?: string;
  /** title_up 用:稱號 id(練氣 → 渡劫,1-8) */
  titleId?: number;
  titleName?: string;
  /** streak 用:里程碑天數(7/14/30/60/100) */
  streakDays?: number;
}

export interface UserMilestone {
  id: number;
  userId: string;
  eventType: MilestoneEventType;
  eventData: MilestoneEventData;
  occurredAt: string;
}
