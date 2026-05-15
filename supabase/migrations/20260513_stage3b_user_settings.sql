-- 階段 3B:user_settings — 把 user_data blob 內的 settings 欄位升級成 normalized table。
-- 為什麼:settingsRepo 改成「雲端為主 + 本機快取」,需要可 query 的 normalized 表
-- (blob row 沒辦法 SELECT 單欄位、沒法部分 update、不能跨欄位 indexing)。
--
-- 過渡期(階段 3B-3D):cloudSync 仍會把整包 settings 寫進 user_data.blob,新的
-- user_settings 表並行存在。3D 完成後 cloudSync 整檔改寫,user_data 表退場。

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- 對應 Dexie Settings 的 camelCase 欄位(snake_case 對應)
  brokerage_fee_discount real not null default 1.0,
  brokerage_min_fee integer not null default 20,
  sound_enabled boolean not null default true,
  -- nullable optional 欄位(對應 Settings.lastPriceUpdateAt? 等):
  last_price_update_at bigint,
  last_snapshot_date text,
  player_name text,                                -- deprecated 但保留(types/settings.ts 註解)
  -- 帳戶建立時間(對應 Settings.createdAt,unix millis)
  created_at_ms bigint not null default (extract(epoch from now()) * 1000)::bigint,
  last_login_date text,
  consecutive_days integer not null default 0,
  max_consecutive_days integer not null default 0,

  -- 階段 4B 進階消耗管道:背景 / HUD 主題解鎖
  unlocked_backgrounds text[] not null default array['default'],
  current_background text not null default 'default',
  hud_theme text not null default 'default',
  unlocked_hud_themes text[] not null default array['default'],

  -- 同步用時間戳;trigger 自動 touch
  updated_at timestamptz not null default now()
);

-- RLS:玩家只能讀寫自己的 row
alter table public.user_settings enable row level security;

drop policy if exists "user_settings_select_own" on public.user_settings;
create policy "user_settings_select_own" on public.user_settings
  for select using (auth.uid() = user_id);

drop policy if exists "user_settings_insert_own" on public.user_settings;
create policy "user_settings_insert_own" on public.user_settings
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_settings_update_own" on public.user_settings;
create policy "user_settings_update_own" on public.user_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_settings_delete_own" on public.user_settings;
create policy "user_settings_delete_own" on public.user_settings
  for delete using (auth.uid() = user_id);

-- updated_at 自動 touch — UPDATE 觸發即可,INSERT 用 default
create or replace function public.touch_user_settings_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists touch_user_settings_updated_at on public.user_settings;
create trigger touch_user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.touch_user_settings_updated_at();

-- 新用戶註冊時自動建立預設 settings row(便利,讓 repo 不必每次先 INSERT)
-- 對舊用戶不會回填(已在 auth.users 內)— repo 端 first put 時會 upsert 處理
create or replace function public.create_default_user_settings() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_settings on auth.users;
create trigger on_auth_user_created_settings
  after insert on auth.users
  for each row execute function public.create_default_user_settings();
