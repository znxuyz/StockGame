-- ════════════════════════════════════════════════════════════════════════
-- 階段 6.X:核心 cloud-first 表的 RLS 補丁
-- ════════════════════════════════════════════════════════════════════════
--
-- 背景:STATUS.md audit 發現 7 張 cloud-first 表(holdings / pets /
-- transactions / achievements / creature_unlocks / milestone_rewards /
-- user_tasks)從未在 migration 內定義,推測是 Stage 3D 用 Supabase Dashboard
-- 手動建的。Dashboard 建表預設**不開 RLS**——意味著任何登入用戶都可能
-- 讀寫別人的 row,跨用戶資料外洩。
--
-- 本 migration 做兩件事(全 idempotent,可重跑):
--   1. `create table if not exists` 確保 schema 存在(欄位以 Repository
--      的 RemoteXxx interface 為準);若 Dashboard 已建好則跳過
--   2. 對每張表 enable RLS + 補上 SELECT/INSERT/UPDATE/DELETE 四條
--      `auth.uid() = user_id` 政策,policy 名前綴 `own_<table>_*` 避免
--      跟 Dashboard 既有政策撞名
--
-- 套用方式:Supabase Dashboard → SQL Editor 整段貼上 → Run。看不到 error
-- 即可。再跑一次也 OK(無副作用)。
--
-- 套用之後,前端 Repository / forceSync 行為不變,但跨用戶讀寫被 RLS 擋
-- 死,資料隔離正式生效。
-- ════════════════════════════════════════════════════════════════════════

-- ─── 1. holdings(每檔股票一筆,user 持倉)──────────────────
create table if not exists public.holdings (
  user_id uuid references auth.users(id) on delete cascade not null,
  code text not null,
  shares numeric not null default 0,
  avg_cost numeric not null default 0,
  total_cost numeric not null default 0,
  realized_pnl numeric not null default 0,
  first_purchased_at timestamptz not null default now(),
  last_transaction_at timestamptz not null default now(),
  primary key (user_id, code)
);
create index if not exists idx_holdings_user on public.holdings(user_id);

alter table public.holdings enable row level security;
drop policy if exists own_holdings_select on public.holdings;
create policy own_holdings_select on public.holdings for select using (auth.uid() = user_id);
drop policy if exists own_holdings_insert on public.holdings;
create policy own_holdings_insert on public.holdings for insert with check (auth.uid() = user_id);
drop policy if exists own_holdings_update on public.holdings;
create policy own_holdings_update on public.holdings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists own_holdings_delete on public.holdings;
create policy own_holdings_delete on public.holdings for delete using (auth.uid() = user_id);

-- ─── 2. pets(每隻神獸一筆;uuid PK)────────────────────────
create table if not exists public.pets (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  code text not null,
  species_id text not null,
  level int not null default 1,
  custom_name text,
  born_at timestamptz not null default now(),
  retired_at timestamptz,
  color_variant text not null default 'default',
  boosted_days int not null default 0,
  effect_boost_until timestamptz,
  is_eternal boolean not null default false,
  eternal_date timestamptz,
  final_effect text,
  last_realm_check text,
  last_effect_check text
);
create index if not exists idx_pets_user on public.pets(user_id);

alter table public.pets enable row level security;
drop policy if exists own_pets_select on public.pets;
create policy own_pets_select on public.pets for select using (auth.uid() = user_id);
drop policy if exists own_pets_insert on public.pets;
create policy own_pets_insert on public.pets for insert with check (auth.uid() = user_id);
drop policy if exists own_pets_update on public.pets;
create policy own_pets_update on public.pets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists own_pets_delete on public.pets;
create policy own_pets_delete on public.pets for delete using (auth.uid() = user_id);

-- ─── 3. transactions(交易紀錄,append-only)────────────────
create table if not exists public.transactions (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  code text not null,
  type text not null,
  shares numeric not null,
  price numeric not null,
  gross_amount numeric not null,
  fee numeric not null default 0,
  tax numeric not null default 0,
  net_amount numeric not null,
  realized_pnl numeric not null default 0,
  timestamp timestamptz not null default now(),
  note text
);
create index if not exists idx_transactions_user_time on public.transactions(user_id, timestamp desc);
create index if not exists idx_transactions_user_code on public.transactions(user_id, code);

alter table public.transactions enable row level security;
drop policy if exists own_transactions_select on public.transactions;
create policy own_transactions_select on public.transactions for select using (auth.uid() = user_id);
drop policy if exists own_transactions_insert on public.transactions;
create policy own_transactions_insert on public.transactions for insert with check (auth.uid() = user_id);
drop policy if exists own_transactions_update on public.transactions;
create policy own_transactions_update on public.transactions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists own_transactions_delete on public.transactions;
create policy own_transactions_delete on public.transactions for delete using (auth.uid() = user_id);

-- ─── 4. achievements(成就進度)─────────────────────────────
create table if not exists public.achievements (
  user_id uuid references auth.users(id) on delete cascade not null,
  achievement_id text not null,
  progress int not null default 0,
  unlocked_at timestamptz,
  primary key (user_id, achievement_id)
);

alter table public.achievements enable row level security;
drop policy if exists own_achievements_select on public.achievements;
create policy own_achievements_select on public.achievements for select using (auth.uid() = user_id);
drop policy if exists own_achievements_insert on public.achievements;
create policy own_achievements_insert on public.achievements for insert with check (auth.uid() = user_id);
drop policy if exists own_achievements_update on public.achievements;
create policy own_achievements_update on public.achievements for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists own_achievements_delete on public.achievements;
create policy own_achievements_delete on public.achievements for delete using (auth.uid() = user_id);

-- ─── 5. creature_unlocks(階段 4C.3 圖鑑故事解鎖)────────────
create table if not exists public.creature_unlocks (
  user_id uuid references auth.users(id) on delete cascade not null,
  creature_id text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, creature_id)
);

alter table public.creature_unlocks enable row level security;
drop policy if exists own_creature_unlocks_select on public.creature_unlocks;
create policy own_creature_unlocks_select on public.creature_unlocks for select using (auth.uid() = user_id);
drop policy if exists own_creature_unlocks_insert on public.creature_unlocks;
create policy own_creature_unlocks_insert on public.creature_unlocks for insert with check (auth.uid() = user_id);
drop policy if exists own_creature_unlocks_update on public.creature_unlocks;
create policy own_creature_unlocks_update on public.creature_unlocks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists own_creature_unlocks_delete on public.creature_unlocks;
create policy own_creature_unlocks_delete on public.creature_unlocks for delete using (auth.uid() = user_id);

-- ─── 6. milestone_rewards(連登里程碑領取紀錄)──────────────
create table if not exists public.milestone_rewards (
  user_id uuid references auth.users(id) on delete cascade not null,
  milestone_day int not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, milestone_day)
);

alter table public.milestone_rewards enable row level security;
drop policy if exists own_milestone_rewards_select on public.milestone_rewards;
create policy own_milestone_rewards_select on public.milestone_rewards for select using (auth.uid() = user_id);
drop policy if exists own_milestone_rewards_insert on public.milestone_rewards;
create policy own_milestone_rewards_insert on public.milestone_rewards for insert with check (auth.uid() = user_id);
drop policy if exists own_milestone_rewards_update on public.milestone_rewards;
create policy own_milestone_rewards_update on public.milestone_rewards for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists own_milestone_rewards_delete on public.milestone_rewards;
create policy own_milestone_rewards_delete on public.milestone_rewards for delete using (auth.uid() = user_id);

-- ─── 7. user_tasks(每日/週任務進度)────────────────────────
create table if not exists public.user_tasks (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  task_key text not null,
  task_type text not null,
  progress int not null default 0,
  completed boolean not null default false,
  claimed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_user_tasks_user on public.user_tasks(user_id);
create index if not exists idx_user_tasks_user_type on public.user_tasks(user_id, task_type);

alter table public.user_tasks enable row level security;
drop policy if exists own_user_tasks_select on public.user_tasks;
create policy own_user_tasks_select on public.user_tasks for select using (auth.uid() = user_id);
drop policy if exists own_user_tasks_insert on public.user_tasks;
create policy own_user_tasks_insert on public.user_tasks for insert with check (auth.uid() = user_id);
drop policy if exists own_user_tasks_update on public.user_tasks;
create policy own_user_tasks_update on public.user_tasks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists own_user_tasks_delete on public.user_tasks;
create policy own_user_tasks_delete on public.user_tasks for delete using (auth.uid() = user_id);
