-- 階段 5D:動態牆 + 點讚評論 + 修仙分享 + 上線狀態
-- 3 張新表 + 1 個 view:feed_events / feed_likes / feed_comments / friend_online_status
-- 全部 RLS 開:讀依「好友關係」限制,寫只能寫自己
--
-- 套用方式:在 Supabase Dashboard → SQL Editor 貼上整段執行
-- (idempotent — 全 `if not exists` / `drop policy if exists`)
--
-- 注意:friend_online_status 是 view 不是 table,permissions 跟著底下 table 的 RLS 走
-- (user_profile 在 5A 已開讀放給所有登入用戶,所以 view 也直接可讀)

-- ─── feed_events(動態事件,自動觸發 + 手動發文)──────────
create table if not exists public.feed_events (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  /**
   * event_type 列舉:
   *   自動:'summon' / 'creature_realm_up' / 'title_up' / 'streak_milestone' / 'eternal'
   *   手動:'cultivation_share'
   * 用 text + check 而非 enum 方便日後擴充(新增類型不用 alter type)
   */
  event_type text not null check (event_type in (
    'summon', 'creature_realm_up', 'title_up', 'streak_milestone', 'eternal', 'cultivation_share'
  )),
  event_data jsonb,
  occurred_at timestamptz not null default now(),
  /** 軟刪除:caller 不直接 delete,設 is_deleted=true,讓對方還能看到歷史評論 */
  is_deleted boolean not null default false
);

create index if not exists idx_feed_events_user_time
  on public.feed_events(user_id, occurred_at desc);
create index if not exists idx_feed_events_time
  on public.feed_events(occurred_at desc) where is_deleted = false;

-- ─── feed_likes(點讚)────────────────────────────────────
create table if not exists public.feed_likes (
  event_id bigint references public.feed_events(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists idx_feed_likes_event on public.feed_likes(event_id);

-- ─── feed_comments(評論)────────────────────────────────
create table if not exists public.feed_comments (
  id bigserial primary key,
  event_id bigint references public.feed_events(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  content text not null,
  created_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  constraint content_length check (char_length(content) between 1 and 200)
);

create index if not exists idx_feed_comments_event
  on public.feed_comments(event_id, created_at);

-- ─── friend_online_status view(從 user_profile.last_seen_at 算)─
create or replace view public.friend_online_status as
select
  user_id,
  case
    when last_seen_at > now() - interval '5 minutes' then 'online'
    when last_seen_at > now() - interval '1 hour' then 'recent'
    else 'offline'
  end as status,
  last_seen_at
from public.user_profile;

-- ─── RLS:讀依好友關係限制,寫只能寫自己 ────────────────
alter table public.feed_events enable row level security;
alter table public.feed_likes enable row level security;
alter table public.feed_comments enable row level security;

-- feed_events
-- 自己對自己的動態全權限
drop policy if exists "own_feed_full" on public.feed_events;
create policy "own_feed_full" on public.feed_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 好友可讀(透過 friends 表 join;user_a < user_b 已在 5A SQL constraint 保證)
drop policy if exists "friends_feed_read" on public.feed_events;
create policy "friends_feed_read" on public.feed_events
  for select using (
    is_deleted = false AND
    (
      auth.uid() = user_id
      OR user_id IN (
        SELECT case when user_a = auth.uid() then user_b else user_a end
        FROM public.friends
        WHERE user_a = auth.uid() OR user_b = auth.uid()
      )
    )
  );

-- feed_likes:所有登入用戶可讀(點讚數誰按過都看得到),寫只能寫自己
drop policy if exists "all_read_likes" on public.feed_likes;
create policy "all_read_likes" on public.feed_likes
  for select using (auth.uid() is not null);

drop policy if exists "own_like_insert" on public.feed_likes;
create policy "own_like_insert" on public.feed_likes
  for insert with check (auth.uid() = user_id);

drop policy if exists "own_like_delete" on public.feed_likes;
create policy "own_like_delete" on public.feed_likes
  for delete using (auth.uid() = user_id);

-- feed_comments:所有登入用戶可讀(顯示動態下方的評論),寫只能寫自己
drop policy if exists "all_read_comments" on public.feed_comments;
create policy "all_read_comments" on public.feed_comments
  for select using (is_deleted = false AND auth.uid() is not null);

drop policy if exists "own_comment_insert" on public.feed_comments;
create policy "own_comment_insert" on public.feed_comments
  for insert with check (auth.uid() = user_id);

drop policy if exists "own_comment_update" on public.feed_comments;
create policy "own_comment_update" on public.feed_comments
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_comment_delete" on public.feed_comments;
create policy "own_comment_delete" on public.feed_comments
  for delete using (auth.uid() = user_id);
