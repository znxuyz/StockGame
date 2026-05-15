-- 階段 3D 批 1:user_cultivation + cultivation_log + user_login_streak
--
-- 模板沿用 user_settings(階段 3B):normalized table + RLS + updated_at trigger
-- + 新用戶 auto-create trigger。多兩件:
--   1. cultivation_log 是 append-only,user_id 索引 + created_at desc 查最近 N 筆
--   2. earn_cultivation / spend_cultivation 是 atomic RPC,
--      避免兩裝置同時花修為造成餘額負數 race condition
--
-- ──────────── 範圍 ────────────
--
--  ✅ 上雲:
--     - user_cultivation:餘額 + lifetime_earned / lifetime_spent
--     - cultivation_log:每筆變動(賺/花/原因/餘額快照)— append-only
--     - user_login_streak:連登狀態(current/longest/last_login_date/today_claimed/lifetime_logins)
--
--  ❌ 不上雲(本機 Dexie 才有,階段 3D 批 2 之後再評估):
--     - milestone_rewards(連登里程碑領取紀錄)— 階段 3D 批 2 再做
--     - userTasks(每日 / 每週任務)— 階段 3D 批 2 再做
--
-- ──────────── 注意事項 ────────────
--
--  此 migration 跟 stage3b 的 user_settings 一樣:已 deployed Supabase 跑這檔
--  前須確認沒有同名 table / function。`create table if not exists` +
--  `create or replace function` 對重複跑安全。

-- ═══════════════════════════════════════════════════════════════════════
-- 1. user_cultivation 餘額表(singleton per user)
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists public.user_cultivation (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- 對應 Dexie UserCultivation
  amount integer not null default 0,
  lifetime_earned integer not null default 0,
  lifetime_spent integer not null default 0,
  last_updated bigint not null default (extract(epoch from now()) * 1000)::bigint,

  -- 同步用時間戳(trigger 自動 touch);跟 last_updated 角色不同 — last_updated 是
  -- 「修為值變動時間」,updated_at 是「row 任何欄位變動時間」
  updated_at timestamptz not null default now()
);

alter table public.user_cultivation enable row level security;

drop policy if exists "user_cultivation_select_own" on public.user_cultivation;
create policy "user_cultivation_select_own" on public.user_cultivation
  for select using (auth.uid() = user_id);

drop policy if exists "user_cultivation_insert_own" on public.user_cultivation;
create policy "user_cultivation_insert_own" on public.user_cultivation
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_cultivation_update_own" on public.user_cultivation;
create policy "user_cultivation_update_own" on public.user_cultivation
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_cultivation_delete_own" on public.user_cultivation;
create policy "user_cultivation_delete_own" on public.user_cultivation
  for delete using (auth.uid() = user_id);

create or replace function public.touch_user_cultivation_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists touch_user_cultivation_updated_at on public.user_cultivation;
create trigger touch_user_cultivation_updated_at
  before update on public.user_cultivation
  for each row execute function public.touch_user_cultivation_updated_at();

-- ═══════════════════════════════════════════════════════════════════════
-- 2. cultivation_log 變動歷史(append-only)
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists public.cultivation_log (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,

  change integer not null,                  -- 正=賺 / 負=花
  reason text not null,                      -- 對應 CultivationReason union
  reason_text text not null,                 -- 顯示用中文
  balance_after integer not null,            -- 變動後餘額(對帳用)
  related_pet_id text,                       -- nullable,關聯神獸 id

  created_at timestamptz not null default now()
);

create index if not exists cultivation_log_user_created
  on public.cultivation_log (user_id, created_at desc);

alter table public.cultivation_log enable row level security;

drop policy if exists "cultivation_log_select_own" on public.cultivation_log;
create policy "cultivation_log_select_own" on public.cultivation_log
  for select using (auth.uid() = user_id);

-- log 是 append-only by RPC,不應該讓 client 直接 insert(會繞過 balance 更新)。
-- 把 INSERT 限制只能從 RPC 內部執行(SECURITY DEFINER RPC 用 service role 級權限)。
-- 但 SECURITY INVOKER 走 RLS 也行 — 取「INSERT own row」,但繞過 balance 是業務邏輯問題,
-- 不是 security 問題,所以仍 RLS 允許 client 直接 insert,只是不建議。
drop policy if exists "cultivation_log_insert_own" on public.cultivation_log;
create policy "cultivation_log_insert_own" on public.cultivation_log
  for insert with check (auth.uid() = user_id);

drop policy if exists "cultivation_log_delete_own" on public.cultivation_log;
create policy "cultivation_log_delete_own" on public.cultivation_log
  for delete using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. user_login_streak 連登狀態(singleton per user)
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists public.user_login_streak (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- 對應 Dexie LoginStreak
  current_streak integer not null default 1,
  longest_streak integer not null default 1,
  last_login_date text not null default to_char(now(), 'YYYY-MM-DD'),
  today_claimed boolean not null default false,
  lifetime_logins integer not null default 1,

  updated_at timestamptz not null default now()
);

alter table public.user_login_streak enable row level security;

drop policy if exists "user_login_streak_select_own" on public.user_login_streak;
create policy "user_login_streak_select_own" on public.user_login_streak
  for select using (auth.uid() = user_id);

drop policy if exists "user_login_streak_insert_own" on public.user_login_streak;
create policy "user_login_streak_insert_own" on public.user_login_streak
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_login_streak_update_own" on public.user_login_streak;
create policy "user_login_streak_update_own" on public.user_login_streak
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_login_streak_delete_own" on public.user_login_streak;
create policy "user_login_streak_delete_own" on public.user_login_streak
  for delete using (auth.uid() = user_id);

create or replace function public.touch_user_login_streak_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists touch_user_login_streak_updated_at on public.user_login_streak;
create trigger touch_user_login_streak_updated_at
  before update on public.user_login_streak
  for each row execute function public.touch_user_login_streak_updated_at();

-- ═══════════════════════════════════════════════════════════════════════
-- 4. earn_cultivation RPC — atomic 賺修為
-- ═══════════════════════════════════════════════════════════════════════
--
-- 用 INSERT ... ON CONFLICT 一行內 atomically upsert balance + 寫 log。
-- SECURITY INVOKER → RLS 自然把限制套上(每個玩家只能改自己的 row)。
--
-- 回傳 jsonb { ok, new_amount, log_id } 或 { ok: false, reason }。
-- 業務錯誤(amount <= 0)走 jsonb {ok:false},技術錯誤(未登入)走 RAISE。
--
create or replace function public.earn_cultivation(
  p_delta integer,
  p_reason text,
  p_reason_text text,
  p_related_pet_id text default null
) returns jsonb
  language plpgsql
  security invoker
  set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_new_amount integer;
  v_log_id bigint;
  v_now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if v_user_id is null then
    raise exception '未登入' using errcode = '28000';
  end if;
  if p_delta <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  end if;

  insert into public.user_cultivation
    (user_id, amount, lifetime_earned, lifetime_spent, last_updated)
    values (v_user_id, p_delta, p_delta, 0, v_now_ms)
    on conflict (user_id) do update
      set amount = user_cultivation.amount + p_delta,
          lifetime_earned = user_cultivation.lifetime_earned + p_delta,
          last_updated = v_now_ms
    returning amount into v_new_amount;

  insert into public.cultivation_log
    (user_id, change, reason, reason_text, balance_after, related_pet_id)
    values (v_user_id, p_delta, p_reason, p_reason_text, v_new_amount, p_related_pet_id)
    returning id into v_log_id;

  return jsonb_build_object('ok', true, 'new_amount', v_new_amount, 'log_id', v_log_id);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. spend_cultivation RPC — atomic 花修為(餘額不足 reject)
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.spend_cultivation(
  p_delta integer,
  p_reason text,
  p_reason_text text,
  p_related_pet_id text default null
) returns jsonb
  language plpgsql
  security invoker
  set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_new_amount integer;
  v_current integer;
  v_log_id bigint;
  v_now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if v_user_id is null then
    raise exception '未登入' using errcode = '28000';
  end if;
  if p_delta <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  end if;

  -- 原子扣款:WHERE amount >= p_delta 確保不會扣到負數
  update public.user_cultivation
    set amount = amount - p_delta,
        lifetime_spent = lifetime_spent + p_delta,
        last_updated = v_now_ms
    where user_id = v_user_id and amount >= p_delta
    returning amount into v_new_amount;

  if v_new_amount is null then
    -- 餘額不足 OR row 不存在
    select amount into v_current from public.user_cultivation where user_id = v_user_id;
    return jsonb_build_object(
      'ok', false,
      'reason', case when v_current is null then 'no_row' else 'insufficient' end,
      'current', coalesce(v_current, 0)
    );
  end if;

  insert into public.cultivation_log
    (user_id, change, reason, reason_text, balance_after, related_pet_id)
    values (v_user_id, -p_delta, p_reason, p_reason_text, v_new_amount, p_related_pet_id)
    returning id into v_log_id;

  return jsonb_build_object('ok', true, 'new_amount', v_new_amount, 'log_id', v_log_id);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 6. 新用戶 auto-create:cultivation 餘額 + login streak 都建預設 row
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.create_default_cultivation_and_streak() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_cultivation (user_id) values (new.id)
  on conflict (user_id) do nothing;

  insert into public.user_login_streak (user_id) values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_cultivation_streak on auth.users;
create trigger on_auth_user_created_cultivation_streak
  after insert on auth.users
  for each row execute function public.create_default_cultivation_and_streak();
