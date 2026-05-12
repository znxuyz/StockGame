/**
 * 階段 5A:好友系統身分層 — 個人檔案(Supabase 雲端 row,不存本地 IndexedDB)。
 *
 * 由 Supabase `public.user_profile` 表回傳。註冊 / 第一次登入時自動建立。
 * 對應 SQL schema 見 `supabase/migrations/20260512_stage5a_friends.sql`。
 */
export interface UserProfile {
  /** Supabase auth.users.id */
  userId: string;
  /** 1-20 字暱稱。預設「修仙者#XXXX」(隨機 4 位數字) */
  nickname: string;
  /** 頭像神獸 id(對應 creatures.ts 內 id),null = 用預設灰圈頭像 */
  avatarCreatureId: string | null;
  /** 個人簽名,最多 150 字。空字串 = 未設定 */
  signature: string;
  /** 8 碼邀請碼(顯示時 XXXX-XXXX) */
  inviteCode: string;
  /** 最後一次「打開 app + 5 分鐘心跳」的時間(ISO timestamp) */
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}
