-- ════════════════════════════════════════════════════════════════════════
-- 階段 6.Z:讓登入用戶可讀對方 user_cultivation / user_login_streak
-- ════════════════════════════════════════════════════════════════════════
--
-- 背景:階段 3D 把舊版 user_data.blob 整包同步拆成各 Repository per-table
-- 同步後,`getFriendCloudStats` 一直還在讀 user_data.blob(deprecated),
-- 所以好友個人頁的「修為 / 連登」欄位永遠是 —。要修就要兩件:
--   1. 修 client `getFriendCloudStats` 讀新表(user_cultivation /
--      user_login_streak)
--   2. 補 RLS 讓登入用戶可 SELECT 別人的 row(就跟 user_profile /
--      user_privacy_settings 一樣 — 這些都是「社交可見」資料)
--
-- 此 migration 處理 (2)。沿用既有 own-only 政策不動(寫入仍只能改自己),
-- 額外加 `read_others_*` SELECT 政策放給所有登入用戶。
--
-- ⚠️ 寫入(INSERT/UPDATE/DELETE)政策保持 own-only,別人改不到我的 row。
-- ⚠️ cultivation_log(append-only 變動歷史)不開放別人讀 — 那是更詳細的
-- 「修為帳本」,屬於更隱私的層級。
--
-- 套用方式:Supabase Dashboard → SQL Editor → 整段貼 → Run(idempotent)

-- ─── user_cultivation 開讀 ─────────────────────────────────
drop policy if exists "read_others_cultivation" on public.user_cultivation;
create policy "read_others_cultivation" on public.user_cultivation
  for select using (auth.uid() is not null);

-- ─── user_login_streak 開讀 ────────────────────────────────
drop policy if exists "read_others_login_streak" on public.user_login_streak;
create policy "read_others_login_streak" on public.user_login_streak
  for select using (auth.uid() is not null);
