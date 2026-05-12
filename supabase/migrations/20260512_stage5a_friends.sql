-- 階段 5A:好友系統(身分層)
-- 4 張表:user_profile / friends / friend_requests / blocked_users
-- 全部 enable RLS,各自 policy 確保只能讀寫跟自己有關的 row
--
-- 套用方式:
--   1. Supabase Dashboard → SQL Editor → 貼上整段執行
--   2. 或本機跑 supabase CLI:`supabase db push`
--
-- 注意:public.user_profile.user_id 是 auth.users.id 的 FK,刪帳號時 cascade

-- ─── user_profile ─────────────────────────────────────────────
create table if not exists public.user_profile (
  user_id uuid references auth.users(id) on delete cascade primary key,
  nickname text not null default '修仙者',
  avatar_creature_id text default null,
  signature text not null default '',
  invite_code text not null unique,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nickname_length check (char_length(nickname) between 1 and 20),
  constraint signature_length check (char_length(signature) <= 150)
);

create index if not exists idx_user_profile_invite_code on public.user_profile(invite_code);

-- ─── friends(雙向,但 user_a < user_b 統一方向)──────────────
create table if not exists public.friends (
  id bigserial primary key,
  user_a uuid references auth.users(id) on delete cascade not null,
  user_b uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  constraint user_order check (user_a < user_b),
  unique (user_a, user_b)
);

create index if not exists idx_friends_user_a on public.friends(user_a);
create index if not exists idx_friends_user_b on public.friends(user_b);

-- ─── friend_requests ─────────────────────────────────────────
create table if not exists public.friend_requests (
  id bigserial primary key,
  from_user uuid references auth.users(id) on delete cascade not null,
  to_user uuid references auth.users(id) on delete cascade not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (from_user, to_user),
  constraint valid_status check (status in ('pending', 'accepted', 'rejected')),
  constraint no_self_request check (from_user != to_user)
);

create index if not exists idx_friend_requests_to_user on public.friend_requests(to_user, status);
create index if not exists idx_friend_requests_from_user on public.friend_requests(from_user, status);

-- ─── blocked_users ───────────────────────────────────────────
create table if not exists public.blocked_users (
  id bigserial primary key,
  blocker uuid references auth.users(id) on delete cascade not null,
  blocked uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  unique (blocker, blocked),
  constraint no_self_block check (blocker != blocked)
);

create index if not exists idx_blocked_users_blocker on public.blocked_users(blocker);

-- ─── updated_at trigger:寫入時自動更新 updated_at ─────────────
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_user_profile_updated_at on public.user_profile;
create trigger trg_user_profile_updated_at
  before update on public.user_profile
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_friend_requests_updated_at on public.friend_requests;
create trigger trg_friend_requests_updated_at
  before update on public.friend_requests
  for each row execute function public.touch_updated_at();

-- ─── RLS:開啟 + 政策 ─────────────────────────────────────────
alter table public.user_profile enable row level security;
alter table public.friends enable row level security;
alter table public.friend_requests enable row level security;
alter table public.blocked_users enable row level security;

-- user_profile:自己可以增刪改;所有登入用戶都能讀(找朋友需要)
drop policy if exists "own_profile_full_access" on public.user_profile;
create policy "own_profile_full_access" on public.user_profile
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "read_others_profile" on public.user_profile;
create policy "read_others_profile" on public.user_profile
  for select using (auth.uid() is not null);

-- friends:只能讀寫跟自己有關的(user_a 或 user_b 是自己)
drop policy if exists "own_friends_read" on public.friends;
create policy "own_friends_read" on public.friends
  for select using (auth.uid() in (user_a, user_b));

drop policy if exists "own_friends_insert" on public.friends;
create policy "own_friends_insert" on public.friends
  for insert with check (auth.uid() in (user_a, user_b));

drop policy if exists "own_friends_delete" on public.friends;
create policy "own_friends_delete" on public.friends
  for delete using (auth.uid() in (user_a, user_b));

-- friend_requests:只能讀寫跟自己有關的
drop policy if exists "own_requests_select" on public.friend_requests;
create policy "own_requests_select" on public.friend_requests
  for select using (auth.uid() in (from_user, to_user));

drop policy if exists "own_requests_insert" on public.friend_requests;
create policy "own_requests_insert" on public.friend_requests
  for insert with check (auth.uid() = from_user);

drop policy if exists "own_requests_update" on public.friend_requests;
create policy "own_requests_update" on public.friend_requests
  for update using (auth.uid() = to_user);

drop policy if exists "own_requests_delete" on public.friend_requests;
create policy "own_requests_delete" on public.friend_requests
  for delete using (auth.uid() in (from_user, to_user));

-- blocked_users:只能管自己的封鎖
drop policy if exists "own_blocks" on public.blocked_users;
create policy "own_blocks" on public.blocked_users
  for all using (auth.uid() = blocker) with check (auth.uid() = blocker);
