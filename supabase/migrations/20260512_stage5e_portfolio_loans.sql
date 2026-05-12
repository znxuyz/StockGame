-- 階段 5E:持倉隱私 + 好友排行榜 + 神獸借展
-- 4 張新表:user_privacy_settings / user_portfolio_summary / leaderboard_snapshots / creature_loans
-- 全部 RLS 開,讀依好友 / 自己關係限制,寫只能寫自己
--
-- 套用方式:Supabase Dashboard → SQL Editor 貼上整段執行
-- (idempotent — `if not exists` / `drop policy if exists`)

-- ─── user_privacy_settings(分享給好友看什麼)──────────────
create table if not exists public.user_privacy_settings (
  user_id uuid references auth.users(id) on delete cascade primary key,
  /**
   * 持倉分享層級:
   *   'hidden'  = 完全不顯示金額(預設,只看比例)
   *   'partial' = 部分遮罩(1*****7 格式)
   *   'full'    = 完全顯示
   */
  portfolio_amount_visibility text not null default 'hidden'
    check (portfolio_amount_visibility in ('hidden', 'partial', 'full')),
  show_daily_return boolean not null default true,
  show_total_return boolean not null default true,
  join_leaderboard boolean not null default true,
  auto_publish_summon boolean not null default true,
  auto_publish_realm_up boolean not null default true,
  auto_publish_title_up boolean not null default true,
  auto_publish_streak boolean not null default true,
  auto_publish_eternal boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ─── user_portfolio_summary(公開持倉概況;由 client sync 寫入)──
create table if not exists public.user_portfolio_summary (
  user_id uuid references auth.users(id) on delete cascade not null,
  stock_code text not null,
  stock_name text not null,
  portfolio_weight numeric(5,2) not null default 0,
  invested_amount numeric not null default 0,
  current_value numeric not null default 0,
  unrealized_pnl numeric not null default 0,
  return_percent numeric(8,4) not null default 0,
  daily_return_percent numeric(8,4) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, stock_code)
);

create index if not exists idx_portfolio_summary_user on public.user_portfolio_summary(user_id);

-- ─── leaderboard_snapshots(每日報酬率快照)────────────────
create table if not exists public.leaderboard_snapshots (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  snapshot_date date not null,
  total_return_percent numeric(8,4) not null default 0,
  daily_return_percent numeric(8,4) not null default 0,
  total_value numeric not null default 0,
  total_invested numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, snapshot_date)
);

create index if not exists idx_leaderboard_date_return
  on public.leaderboard_snapshots(snapshot_date, total_return_percent desc);
create index if not exists idx_leaderboard_user_date
  on public.leaderboard_snapshots(user_id, snapshot_date desc);

-- ─── creature_loans(神獸借展)──────────────────────────
create table if not exists public.creature_loans (
  id bigserial primary key,
  lender_user_id uuid references auth.users(id) on delete cascade not null,
  borrower_user_id uuid references auth.users(id) on delete cascade not null,
  creature_species_id text not null,
  status text not null default 'active'
    check (status in ('active', 'returned', 'cancelled')),
  loaned_at timestamptz not null default now(),
  returns_at timestamptz not null,
  returned_at timestamptz,
  lender_reward_given boolean not null default false,
  borrower_reward_given boolean not null default false,
  constraint no_self_loan check (lender_user_id != borrower_user_id)
);

create index if not exists idx_loans_lender on public.creature_loans(lender_user_id, status);
create index if not exists idx_loans_borrower on public.creature_loans(borrower_user_id, status);
create index if not exists idx_loans_returns_at
  on public.creature_loans(returns_at) where status = 'active';

-- ─── updated_at trigger 共用 ─────────────────────────────
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_privacy_updated_at on public.user_privacy_settings;
create trigger trg_privacy_updated_at
  before update on public.user_privacy_settings
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_portfolio_summary_updated_at on public.user_portfolio_summary;
create trigger trg_portfolio_summary_updated_at
  before update on public.user_portfolio_summary
  for each row execute function public.touch_updated_at();

-- ─── RLS:讀依好友 / 自己關係限制,寫只能寫自己 ──────────
alter table public.user_privacy_settings enable row level security;
alter table public.user_portfolio_summary enable row level security;
alter table public.leaderboard_snapshots enable row level security;
alter table public.creature_loans enable row level security;

-- user_privacy_settings
drop policy if exists "own_privacy_full" on public.user_privacy_settings;
create policy "own_privacy_full" on public.user_privacy_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 所有登入用戶可讀對方隱私設定(client 需要知道對方 portfolio_amount_visibility 才能決定 UI 渲染)
drop policy if exists "read_others_privacy" on public.user_privacy_settings;
create policy "read_others_privacy" on public.user_privacy_settings
  for select using (auth.uid() is not null);

-- user_portfolio_summary
drop policy if exists "own_portfolio_full" on public.user_portfolio_summary;
create policy "own_portfolio_full" on public.user_portfolio_summary
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 好友可讀(透過 friends 表 join;user_a < user_b 已在 5A 確保)
drop policy if exists "friends_portfolio_read" on public.user_portfolio_summary;
create policy "friends_portfolio_read" on public.user_portfolio_summary
  for select using (
    auth.uid() = user_id
    OR user_id IN (
      SELECT case when user_a = auth.uid() then user_b else user_a end
      FROM public.friends
      WHERE user_a = auth.uid() OR user_b = auth.uid()
    )
  );

-- leaderboard_snapshots:自己可全權限,好友可讀
drop policy if exists "own_snapshot_full" on public.leaderboard_snapshots;
create policy "own_snapshot_full" on public.leaderboard_snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "friends_snapshot_read" on public.leaderboard_snapshots;
create policy "friends_snapshot_read" on public.leaderboard_snapshots
  for select using (
    auth.uid() = user_id
    OR user_id IN (
      SELECT case when user_a = auth.uid() then user_b else user_a end
      FROM public.friends
      WHERE user_a = auth.uid() OR user_b = auth.uid()
    )
  );

-- creature_loans:出借人 / 借入人都可讀寫
drop policy if exists "loan_participants_full" on public.creature_loans;
create policy "loan_participants_full" on public.creature_loans
  for all using (auth.uid() in (lender_user_id, borrower_user_id))
  with check (auth.uid() = lender_user_id);
-- 注意 with check 只允許 lender 寫入(insert);update 仍依 using 條件,雙方都能改
-- 借入人不該能新建借展 row(必須由出借人發起)

-- 好友可讀(看好友家園的借展神獸,即使自己沒參與也能看)
drop policy if exists "friends_loan_read" on public.creature_loans;
create policy "friends_loan_read" on public.creature_loans
  for select using (
    auth.uid() in (lender_user_id, borrower_user_id)
    OR borrower_user_id IN (
      SELECT case when user_a = auth.uid() then user_b else user_a end
      FROM public.friends
      WHERE user_a = auth.uid() OR user_b = auth.uid()
    )
  );
