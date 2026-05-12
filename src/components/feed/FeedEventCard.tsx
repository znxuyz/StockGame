import { useEffect, useState } from 'react';
import { ProfileAvatar } from '../ProfileEditModal';
import FeedComments from './FeedComments';
import { getProfile, likeFeedEvent, unlikeFeedEvent, realmLabel } from '@/services';
import { getCreature } from '@/data/creatures';
import { relativeTime } from '@/utils';
import type { FeedEventWithMeta, UserProfile, SoulRealmId } from '@/types';

interface FeedEventCardProps {
  event: FeedEventWithMeta;
  /** 對方 profile 已 prefetch 帶進來,沒帶就自己抓(失敗顯示 fallback) */
  authorProfile?: UserProfile | null;
  /** 點頭像 / 暱稱 → 跳對方個人頁 */
  onOpenFriendProfile?: (userId: string) => void;
  /** 點神獸 → 跳對應頁(自己有就開 PetInfoModal / 否則開圖鑑) */
  onOpenCreature?: (creatureSpeciesId: string) => void;
  /** 我自己的 user id;用來判斷「自己的動態」可顯示刪除按鈕 */
  myUserId: string | null;
  /** 自己的動態刪除後通知 parent 重整 */
  onDeleted?: (eventId: number) => void;
}

/**
 * 階段 5D:動態事件卡片。
 *
 *  - 根據 event_type 渲染對應內容(6 種:summon / creature_realm_up / title_up /
 *    streak_milestone / eternal / cultivation_share)
 *  - 底部 ❤️ / 💬 計數,點 ❤️ 樂觀更新 +1/-1
 *  - 點 💬 展開評論區(FeedComments)
 *  - 自己的動態旁有「⋯」選單(目前只給刪除)
 */
export default function FeedEventCard({
  event,
  authorProfile,
  onOpenFriendProfile,
  onOpenCreature,
  myUserId,
  onDeleted
}: FeedEventCardProps) {
  const [profile, setProfile] = useState<UserProfile | null>(authorProfile ?? null);
  // 樂觀更新 like state
  const [liked, setLiked] = useState(event.likedByMe);
  const [likeCount, setLikeCount] = useState(event.likeCount);
  const [likeBouncing, setLikeBouncing] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(event.commentCount);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (authorProfile) {
      setProfile(authorProfile);
      return;
    }
    let mounted = true;
    getProfile(event.userId).then((p) => {
      if (mounted) setProfile(p);
    });
    return () => {
      mounted = false;
    };
  }, [event.userId, authorProfile]);

  // event prop 變動(下拉刷新)→ 同步 like / count
  useEffect(() => {
    setLiked(event.likedByMe);
    setLikeCount(event.likeCount);
    setCommentCount(event.commentCount);
  }, [event.likedByMe, event.likeCount, event.commentCount]);

  async function handleLike() {
    const prevLiked = liked;
    const prevCount = likeCount;
    // 樂觀更新
    setLiked(!prevLiked);
    setLikeCount(prevLiked ? prevCount - 1 : prevCount + 1);
    setLikeBouncing(true);
    setTimeout(() => setLikeBouncing(false), 350);
    const r = prevLiked ? await unlikeFeedEvent(event.id) : await likeFeedEvent(event.id);
    if (!r.ok) {
      // rollback
      setLiked(prevLiked);
      setLikeCount(prevCount);
    }
  }

  async function handleDelete() {
    if (!confirm('確定要刪除這則動態?')) return;
    const { deleteFeedEvent } = await import('@/services');
    const r = await deleteFeedEvent(event.id);
    if (r.ok) onDeleted?.(event.id);
    else alert(`刪除失敗:${r.error ?? ''}`);
  }

  const isMine = myUserId === event.userId;
  const occurredMs = new Date(event.occurredAt).getTime();
  const relTime = Number.isFinite(occurredMs) ? relativeTime(occurredMs) : '';

  return (
    <div className="item-card px-3 py-3 space-y-2 relative">
      {/* 頭部:頭像 + 暱稱 + 時間 + ⋯ */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => profile && onOpenFriendProfile?.(profile.userId)}
          disabled={!profile || isMine}
        >
          <ProfileAvatar avatarCreatureId={profile?.avatarCreatureId ?? null} size={36} />
        </button>
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => profile && onOpenFriendProfile?.(profile.userId)}
            disabled={!profile || isMine}
            className="text-sm font-bold text-gray-800 truncate text-left disabled:cursor-default"
          >
            {profile?.nickname ?? '修仙者'}
          </button>
          <div className="text-[10px] text-gray-500">{relTime}</div>
        </div>
        {isMine && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="w-6 h-6 rounded-full text-gray-400 active:bg-gray-100 text-xs"
            >
              ⋯
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-7 bg-white border border-gray-200 rounded-md shadow-md z-10 min-w-[80px]">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    handleDelete();
                  }}
                  className="block w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                >
                  刪除動態
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <hr className="border-gray-200" />

      {/* 內容(根據 event_type) */}
      <EventBody event={event} onOpenCreature={onOpenCreature} />

      <hr className="border-gray-200" />

      {/* 底部:❤️ 💬 */}
      <div className="flex items-center gap-4 text-xs">
        <button
          type="button"
          onClick={handleLike}
          className={`flex items-center gap-1 transition-transform ${
            likeBouncing ? 'scale-125' : 'scale-100'
          }`}
          aria-label={liked ? '取消讚' : '讚'}
        >
          <span className="text-base">{liked ? '❤️' : '🤍'}</span>
          <span className={liked ? 'text-red-600 font-bold' : 'text-gray-600'}>
            {likeCount}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setCommentsOpen((v) => !v)}
          className="flex items-center gap-1 text-gray-600"
          aria-label="評論"
        >
          <span className="text-base">💬</span>
          <span>{commentCount}</span>
        </button>
      </div>

      {commentsOpen && (
        <FeedComments
          eventId={event.id}
          myUserId={myUserId}
          onCountChange={setCommentCount}
        />
      )}
    </div>
  );
}

// ─── 內容 body(每種 event_type 不同樣式)──────────────────

function EventBody({
  event,
  onOpenCreature
}: {
  event: FeedEventWithMeta;
  onOpenCreature?: (id: string) => void;
}) {
  const d = event.eventData;
  switch (event.eventType) {
    case 'summon':
      return <SummonBody data={d} onOpen={onOpenCreature} />;
    case 'creature_realm_up':
      return <RealmUpBody data={d} onOpen={onOpenCreature} />;
    case 'title_up':
      return <TitleUpBody data={d} />;
    case 'streak_milestone':
      return <StreakBody data={d} />;
    case 'eternal':
      return <EternalBody data={d} onOpen={onOpenCreature} />;
    case 'cultivation_share':
      return <ShareBody data={d} onOpen={onOpenCreature} />;
  }
}

function CreatureThumb({
  speciesId,
  onClick,
  size = 80,
  golden = false
}: {
  speciesId: string;
  onClick?: () => void;
  size?: number;
  golden?: boolean;
}) {
  const c = getCreature(speciesId);
  const src = c?.art ? `/sprites/${speciesId}.png` : null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`rounded-lg overflow-hidden shrink-0 ${
        golden
          ? 'ring-2 ring-amber-400 shadow-[0_0_16px_rgba(212,175,55,0.5)]'
          : 'border border-amber-200'
      } bg-gradient-to-br from-amber-50 to-amber-100 flex items-center justify-center`}
      style={{ width: size, height: size }}
    >
      {src ? (
        <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" />
      ) : (
        <span style={{ fontSize: size * 0.5 }}>{c?.emoji ?? '❓'}</span>
      )}
    </button>
  );
}

function SummonBody({
  data,
  onOpen
}: {
  data: FeedEventWithMeta['eventData'];
  onOpen?: (id: string) => void;
}) {
  const id = data.creatureSpeciesId;
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-amber-700">🐉 召喚了新神獸</p>
        <p className="text-xs text-gray-700 truncate">「{data.creatureName ?? id ?? '?'}」</p>
      </div>
      {id && <CreatureThumb speciesId={id} onClick={() => onOpen?.(id)} size={80} />}
    </div>
  );
}

function RealmUpBody({
  data,
  onOpen
}: {
  data: FeedEventWithMeta['eventData'];
  onOpen?: (id: string) => void;
}) {
  const id = data.creatureSpeciesId;
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-purple-700">
          ✨ 突破了{' '}
          {data.toRealmLabel ?? (data.toRealm ? realmLabel(data.toRealm as SoulRealmId) : '?')}
        </p>
        <p className="text-xs text-gray-700 truncate">「{data.creatureName ?? id ?? '?'}」</p>
      </div>
      {id && <CreatureThumb speciesId={id} onClick={() => onOpen?.(id)} size={80} />}
    </div>
  );
}

function TitleUpBody({ data }: { data: FeedEventWithMeta['eventData'] }) {
  return (
    <div className="py-2 text-center">
      <p className="text-sm font-bold text-amber-700">⭐ 修為境界提升</p>
      <p className="text-sm text-gray-700 mt-1">
        <span className="text-gray-500">{data.fromTitle ?? '?'}</span>
        <span className="mx-2 text-amber-500">→</span>
        <span className="font-bold">{data.toTitle ?? '?'}</span>
      </p>
    </div>
  );
}

function StreakBody({ data }: { data: FeedEventWithMeta['eventData'] }) {
  return (
    <div className="py-2 text-center">
      <p className="text-sm font-bold text-red-600">🔥 連登 {data.days ?? '?'} 天里程碑</p>
      <p className="text-xs text-gray-600 mt-1">持續修煉,日日精進!</p>
    </div>
  );
}

function EternalBody({
  data,
  onOpen
}: {
  data: FeedEventWithMeta['eventData'];
  onOpen?: (id: string) => void;
}) {
  const id = data.creatureSpeciesId;
  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <p className="text-sm font-bold text-amber-700">💎 神獸永恆紀念</p>
      <p className="text-xs text-gray-700">「{data.creatureName ?? id ?? '?'}」</p>
      {id && <CreatureThumb speciesId={id} onClick={() => onOpen?.(id)} size={120} golden />}
      <p className="text-[11px] text-gray-500 italic">此神獸已退役,但永恆紀念</p>
    </div>
  );
}

function ShareBody({
  data,
  onOpen
}: {
  data: FeedEventWithMeta['eventData'];
  onOpen?: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-mythic-jade-500">📝 神獸修仙分享</p>
      <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
        「{data.content ?? ''}」
      </p>
      {(data.taggedCreatures?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1">
          {(data.taggedCreatures ?? []).map((id) => {
            const c = getCreature(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => onOpen?.(id)}
                className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] border border-amber-200"
              >
                # {c?.name ?? id}
              </button>
            );
          })}
        </div>
      )}
      {(data.taggedStocks?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1">
          {(data.taggedStocks ?? []).map((sym) => (
            <span
              key={sym}
              className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[11px] border border-blue-200"
            >
              # {sym}
            </span>
          ))}
        </div>
      )}
      <p className="text-[10px] text-gray-500 italic border-t border-gray-200 pt-1">
        ⚠️ 此為遊戲體驗分享,非投資建議
      </p>
    </div>
  );
}

