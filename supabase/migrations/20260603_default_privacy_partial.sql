-- 階段 6.Z:把 user_privacy_settings.portfolio_amount_visibility 預設值
-- 從 'hidden' 改成 'partial'。
--
-- 原因:'hidden' 預設讓好友看玩家持倉時所有金額都是 "---",社交體驗太冷;
-- 'partial' 把 "1234567" 遮成 "1*****7",保留位數資訊但不到精確值,是
-- 隱私 vs 社交 sweet spot。app 端 DEFAULT_PRIVACY 也已同步改成 'partial'。
--
-- **只改 DB 預設值**(影響 future 新插入的 row)。
-- **不動現有 row** — 已選 'hidden' 的玩家是主動選擇,不該被覆蓋;
-- 已選 'partial' / 'full' 的也保留各自選擇。
--
-- 套用方式:Supabase Dashboard → SQL Editor → 整段貼 → Run(idempotent)

alter table public.user_privacy_settings
  alter column portfolio_amount_visibility set default 'partial';
