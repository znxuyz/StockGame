-- 階段 5F:通知中心 + 推播
-- 2 張新表 + 5E 的 user_privacy_settings 加 9 個欄位
-- 全 RLS:寫只能寫自己,讀只能讀自己
--
-- 套用方式:Supabase Dashboard → SQL Editor 貼上整段執行
-- (idempotent — `if not exists` / `drop policy if exists` / `add column if not exists`)
--
-- VAPID Keys 設定(僅推播功能需要,不影響站內通知):
--   1. 本機跑:`npx web-push generate-vapid-keys`
--   2. 拿到 Public Key + Private Key
--   3. Public Key 加進 Cloudflare Pages env vars:VITE_VAPID_PUBLIC_KEY=BNxxx...
--   4. Supabase secrets:
--        supabase secrets set VAPID_PUBLIC_KEY=BNxxx...
--        supabase secrets set VAPID_PRIVATE_KEY=xxxxx
--        supabase secrets set VAPID_SUBJECT=mailto:你的@email
--   5. 部署 Edge Function:`supabase functions deploy send-push`
-- 詳見 SETUP.md「Push 設定」段落

-- ─── notifications(站內通知)──────────────────────────
create table if not exists public.notifications (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  /**
   * notification_type 列舉:
   *   'friend_request'   = 收到好友請求
   *   'friend_accepted'  = 對方接受了你的好友請求
   *   'feed_like'        = 你的動態收到讚
   *   'feed_comment'     = 你的動態收到評論
   *   'loan_received'    = 收到神獸借展
   *   'loan_returning'   = 借展即將到期(1 小時前)
   *   'loan_returned'    = 借展已歸還
   *   'rank_changed'     = 排行變動
   *   'achievement'      = 成就解鎖
   *   'system'           = 系統通知
   */
  notification_type text not null check (notification_type in (
    'friend_request', 'friend_accepted',
    'feed_like', 'feed_comment',
    'loan_received', 'loan_returning', 'loan_returned',
    'rank_changed', 'achievement', 'system'
  )),
  title text not null,
  message text not null,
  from_user_id uuid references auth.users(id) on delete set null,
  related_data jsonb,
  is_read boolean not null default false,
  is_pushed boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists idx_notifications_user_unread
  on public.notifications(user_id, is_read, created_at desc);
create index if not exists idx_notifications_user_time
  on public.notifications(user_id, created_at desc);

-- ─── push_subscriptions(每台裝置一筆)──────────────────
create table if not exists public.push_subscriptions (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  endpoint text not null,
  p256dh_key text not null,
  auth_key text not null,
  user_agent text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists idx_push_subs_user
  on public.push_subscriptions(user_id) where is_active = true;

-- ─── user_privacy_settings 擴充(階段 5E 已建)──────────
alter table public.user_privacy_settings
  add column if not exists push_enabled boolean not null default true,
  add column if not exists notify_friend_request boolean not null default true,
  add column if not exists notify_feed_like boolean not null default true,
  add column if not exists notify_feed_comment boolean not null default true,
  add column if not exists notify_loan boolean not null default true,
  add column if not exists notify_rank boolean not null default false,
  add column if not exists notify_achievement boolean not null default true,
  add column if not exists quiet_hours_start time not null default '22:00',
  add column if not exists quiet_hours_end time not null default '08:00';

-- ─── RLS:讀寫只能自己 ───────────────────────────────
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "own_notifications" on public.notifications;
create policy "own_notifications" on public.notifications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 開放 service_role 從 Edge Function 寫入別人的 notifications(by-pass RLS)— 不需 policy
-- 因為 service_role 會用 admin client。client 端只能讀寫自己。

drop policy if exists "own_push_subs" on public.push_subscriptions;
create policy "own_push_subs" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── 自動清理 90 天前的舊通知(可選 cron job)──────────
-- 沒用 Supabase scheduled function,改在 client App 啟動時跑一次
-- 此 SQL 留 docstring 給 maintainers:
--   delete from notifications where created_at < now() - interval '90 days';
