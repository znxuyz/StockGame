-- 階段 4-B 緊急修復:user_creature_summary schema 重建
--
-- 部署於 stage 5B 的 `user_creature_summary` 表 schema 跟 service 預期不一致:
--   service / friendProfileService 期待:per-species 設計
--     (user_id, creature_species_id) 複合 PK + is_eternal / highest_realm /
--     highest_level / first_summoned_at 欄位
--   實際部署:per-user + `collected_species text[]` array 設計
--     → 每次 upsert 用 creature_species_id 都收 400「Could not find the
--       'creature_species_id' column ... in the schema cache」
--
-- 修法:DROP + 重建。**會清掉所有現有 user_creature_summary 資料**,但既然
-- service 一直 400 從來沒寫進去 / 寫進去也是錯 shape,沒實際資料損失。
--
-- 套用方式:Supabase Dashboard → SQL Editor 整段貼上執行(idempotent,可重跑)
--
-- 跑完之後,前端 console 跑:
--   localStorage.removeItem('stockgame.profileSync.disabled.v1')
-- 並重新整理,即可恢復 friend-profile 同步;或在 SettingsModal 點
-- 「☁⤴ 重新啟用好友同步」按鈕(階段 4-B 加,做同樣的事 + reload)。

-- ─── 1. 刪除舊 user_creature_summary(含舊 trigger / policy / index)──
drop trigger if exists trg_creature_summary_updated_at on public.user_creature_summary;
drop policy if exists "own_summary_full" on public.user_creature_summary;
drop policy if exists "read_others_summary" on public.user_creature_summary;
drop index if exists public.idx_creature_summary_user;
drop table if exists public.user_creature_summary cascade;

-- ─── 2. 重建 per-species 設計 ─────────────────────────────
create table public.user_creature_summary (
  user_id uuid references auth.users(id) on delete cascade not null,
  creature_species_id text not null,
  is_eternal boolean not null default false,
  highest_realm text not null default 'fan'
    check (highest_realm in ('fan', 'ling', 'yao', 'shen', 'sheng', 'xian')),
  highest_level int not null default 1,
  first_summoned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, creature_species_id)
);

create index idx_creature_summary_user on public.user_creature_summary(user_id);

-- ─── 3. updated_at trigger(沿用 stage 5A 的 touch_updated_at)──
create trigger trg_creature_summary_updated_at
  before update on public.user_creature_summary
  for each row execute function public.touch_updated_at();

-- ─── 4. RLS:讀放給所有登入用戶,寫只能寫自己 ────────────────
alter table public.user_creature_summary enable row level security;

create policy "own_summary_full" on public.user_creature_summary
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "read_others_summary" on public.user_creature_summary
  for select using (auth.uid() is not null);
