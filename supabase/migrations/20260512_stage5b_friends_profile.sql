-- 階段 5B:好友個人頁 + 圖鑑互看
-- 3 張新表:user_showcase / user_creature_summary / user_milestones
-- 全部 RLS 開:讀放給所有登入用戶(找朋友需要),寫只能寫自己
--
-- 套用方式:在 Supabase Dashboard → SQL Editor 貼上整段執行
-- (idempotent — 全 `if not exists` / `drop policy if exists`)

-- ─── user_showcase(玩家自選展示神獸,1-3 隻)──────────────
create table if not exists public.user_showcase (
  user_id uuid references auth.users(id) on delete cascade primary key,
  /** 1-3 個 creature species id;array_length null 視同 0,所以 NULL 不計入 max 3 */
  showcase_creature_ids text[] not null default '{}'::text[],
  updated_at timestamptz not null default now(),
  constraint max_3_creatures check (
    coalesce(array_length(showcase_creature_ids, 1), 0) <= 3
  )
);

-- ─── user_creature_summary(公開可看的神獸清單,不存金額)─────
-- (user_id, creature_species_id) 複合主鍵,確保每個玩家每隻 species 一筆
create table if not exists public.user_creature_summary (
  user_id uuid references auth.users(id) on delete cascade not null,
  creature_species_id text not null,
  is_eternal boolean not null default false,
  highest_realm text not null default 'fan' check (highest_realm in ('fan', 'ling', 'yao', 'shen', 'sheng', 'xian')),
  highest_level int not null default 1,
  first_summoned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, creature_species_id)
);

create index if not exists idx_creature_summary_user on public.user_creature_summary(user_id);

-- ─── user_milestones(修煉里程碑事件)─────────────────────
create table if not exists public.user_milestones (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  event_type text not null check (event_type in ('summon', 'realm_up', 'title_up', 'streak', 'eternal')),
  event_data jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_milestones_user_time on public.user_milestones(user_id, occurred_at desc);

-- ─── updated_at trigger 共用 ─────────────────────────────
-- public.touch_updated_at 在階段 5A 的 migration 已建,這裡再 create or replace 一次保險
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_user_showcase_updated_at on public.user_showcase;
create trigger trg_user_showcase_updated_at
  before update on public.user_showcase
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_creature_summary_updated_at on public.user_creature_summary;
create trigger trg_creature_summary_updated_at
  before update on public.user_creature_summary
  for each row execute function public.touch_updated_at();

-- ─── RLS:讀放給所有登入用戶,寫只能寫自己 ────────────────
alter table public.user_showcase enable row level security;
alter table public.user_creature_summary enable row level security;
alter table public.user_milestones enable row level security;

-- user_showcase
drop policy if exists "own_showcase_full" on public.user_showcase;
create policy "own_showcase_full" on public.user_showcase
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "read_others_showcase" on public.user_showcase;
create policy "read_others_showcase" on public.user_showcase
  for select using (auth.uid() is not null);

-- user_creature_summary
drop policy if exists "own_summary_full" on public.user_creature_summary;
create policy "own_summary_full" on public.user_creature_summary
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "read_others_summary" on public.user_creature_summary;
create policy "read_others_summary" on public.user_creature_summary
  for select using (auth.uid() is not null);

-- user_milestones
drop policy if exists "own_milestones_select" on public.user_milestones;
create policy "own_milestones_select" on public.user_milestones
  for select using (auth.uid() is not null);

drop policy if exists "insert_own_milestones" on public.user_milestones;
create policy "insert_own_milestones" on public.user_milestones
  for insert with check (auth.uid() = user_id);

drop policy if exists "delete_own_milestones" on public.user_milestones;
create policy "delete_own_milestones" on public.user_milestones
  for delete using (auth.uid() = user_id);
