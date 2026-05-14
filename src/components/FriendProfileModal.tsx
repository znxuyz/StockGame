import { useEffect, useMemo, useState } from 'react';
import { useSettings } from '@/repositories/settingsRepo';
import Modal from './Modal';
import { ProfileAvatar } from './ProfileEditModal';
import FriendPortfolioView from './FriendPortfolioView';
import { petRepo } from '@/repositories/petRepo';
import { useCultivation } from '@/hooks/useCultivation';
import { formatLastSeen } from '@/hooks/useMyProfile';
import { CREATURES, getCreature } from '@/data/creatures';
import {
  getFriendFullProfile,
  getCodexComparison,
  getMyVsTheirMetrics,
  clearFriendProfileCache,
  removeFriend,
  blockUser,
  getTitle,
  realmLabel,
  type FriendFullProfile,
  type CodexEntry,
  type CodexComparisonSummary,
  type VsMetric
} from '@/services';
import type { UserMilestone, MilestoneEventType, Pet } from '@/types';

interface FriendProfileModalProps {
  open: boolean;
  onClose: () => void;
  /** 點「← 返回好友列表」時的回呼(實作上是 close 自己讓 FriendsModal 仍開) */
  onBack?: () => void;
  /** 階段 5C:點對方展示神獸 → 看自己有沒有 → 開 ShareModal 帶自己同款 */
  onShareMyPet?: (pet: Pet) => void;
  /** 移除好友 / 封鎖成功後通知 caller 重整列表 */
  onRelationChanged?: () => void;
  /** 操作完成 toast */
  onActionComplete?: (message: string) => void;
  /** 目標好友 user_id;null = 沒選 */
  friendUserId: string | null;
}

/**
 * 階段 5B:好友個人頁(取代「點 friend card 還沒實作」狀態)。
 *
 * 8 個 section:
 *  1. 頭部(頭像 / 暱稱 / 稱號 / 簽名 / 上線)
 *  2. 修仙概況(修為 / 神獸 / 連登 / 圖鑑)
 *  3. 展示神獸(對方選的 1-3 隻;沒選 fallback 等級最高 3 隻)
 *  4. 神獸圖鑑(4 色差異視覺化 grid)
 *  5. 修煉里程碑時間軸(最近 10 件 + 看更多分頁)
 *  6. 我 vs 他對比表(5 指標條狀圖)
 *  7. (成就徽章區簡版,合併到「修仙概況」內了)
 *  8. 操作:移除好友 / 封鎖
 *
 * 載入策略:打開立刻顯示骨架,並行抓 4 個資料,全 ready 才渲染。
 */
export default function FriendProfileModal({
  open,
  onClose,
  onBack,
  onShareMyPet,
  onRelationChanged,
  onActionComplete,
  friendUserId
}: FriendProfileModalProps) {
  const [data, setData] = useState<FriendFullProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  // 開時 / userId 變動時拉資料
  useEffect(() => {
    if (!open || !friendUserId) {
      setData(null);
      setNotFound(false);
      return;
    }
    setLoading(true);
    setNotFound(false);
    clearFriendProfileCache(friendUserId); // 進入頁面強制刷新一次
    getFriendFullProfile(friendUserId).then((r) => {
      setLoading(false);
      if (!r) {
        setNotFound(true);
        return;
      }
      setData(r);
    });
  }, [open, friendUserId]);

  async function handleRemove() {
    if (!data || busy) return;
    if (!confirm(`確定要移除好友「${data.profile.nickname}」?`)) return;
    setBusy(true);
    const r = await removeFriend(data.profile.userId);
    setBusy(false);
    if (!r.ok) {
      onActionComplete?.(`⚠️ 移除失敗:${r.error ?? ''}`);
      return;
    }
    onActionComplete?.('已移除好友');
    onRelationChanged?.();
    onClose();
  }

  async function handleBlock() {
    if (!data || busy) return;
    if (
      !confirm(
        `確定要封鎖「${data.profile.nickname}」?\n封鎖後對方搜尋不到你,雙方關係解除。`
      )
    )
      return;
    setBusy(true);
    const r = await blockUser(data.profile.userId);
    setBusy(false);
    if (!r.ok) {
      onActionComplete?.(`⚠️ 封鎖失敗:${r.error ?? ''}`);
      return;
    }
    onActionComplete?.('已封鎖');
    onRelationChanged?.();
    onClose();
  }

  const headerExtra = onBack ? (
    <button
      type="button"
      onClick={onBack}
      className="text-xs text-mythic-jade-500 font-bold mt-1 active:scale-95 transition-transform"
    >
      ← 返回好友列表
    </button>
  ) : undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={data?.profile.nickname ?? '好友個人頁'}
      headerExtra={headerExtra}
    >
      {loading || (!data && !notFound) ? (
        <ProfileSkeleton />
      ) : notFound || !data ? (
        <div className="text-center py-12 space-y-2">
          <div className="text-4xl">😶</div>
          <p className="text-sm text-gray-700">無法查看此用戶資料</p>
          <p className="text-xs text-gray-500">
            可能對方已刪除帳號、封鎖你,或網路暫時斷線
          </p>
        </div>
      ) : (
        <FriendProfileBody
          data={data}
          onShareMyPet={onShareMyPet}
          onRemove={handleRemove}
          onBlock={handleBlock}
          busy={busy}
        />
      )}
    </Modal>
  );
}

// ─── 主 body ────────────────────────────────────────────

function FriendProfileBody({
  data,
  onShareMyPet,
  onRemove,
  onBlock,
  busy
}: {
  data: FriendFullProfile;
  onShareMyPet?: (pet: Pet) => void;
  onRemove: () => void;
  onBlock: () => void;
  busy: boolean;
}) {
  const { profile, showcase, creatures, milestones, cloudStats } = data;
  const title = getTitle(cloudStats.lifetimeEarned ?? 0);
  const seen = formatLastSeen(profile.lastSeenAt);

  // 我自己的 lifetime / streak / 神獸 — 給「我 vs 他」用
  const myCult = useCultivation();
  const settings = useSettings();
  const myConsecutiveDays = settings?.consecutiveDays ?? 0;

  // 展示神獸:對方有自選 → 用它;沒選 → fallback 對方等級最高 3 隻
  const showcaseIds = useMemo(() => {
    if (showcase?.showcaseCreatureIds.length) return showcase.showcaseCreatureIds.slice(0, 3);
    return [...creatures]
      .sort((a, b) => b.highestLevel - a.highestLevel)
      .slice(0, 3)
      .map((c) => c.creatureSpeciesId);
  }, [showcase, creatures]);

  const showcaseFallback =
    !showcase?.showcaseCreatureIds.length && showcaseIds.length > 0;

  // 圖鑑對比 + 我 vs 他
  const [codex, setCodex] = useState<{
    entries: CodexEntry[];
    summary: CodexComparisonSummary;
  } | null>(null);
  const [metrics, setMetrics] = useState<VsMetric[]>([]);

  useEffect(() => {
    const allIds = CREATURES.map((c) => c.id);
    getCodexComparison(creatures, allIds).then(setCodex);
    getMyVsTheirMetrics(
      data,
      myCult.lifetimeEarned,
      myCult.amount,
      myConsecutiveDays,
      allIds.length,
      allIds
    ).then(setMetrics);
  }, [creatures, data, myCult.lifetimeEarned, myCult.amount, myConsecutiveDays]);

  return (
    <div className="space-y-4">
      {/* §1 頭部 */}
      <section className="flex items-start gap-3">
        <ProfileAvatar avatarCreatureId={profile.avatarCreatureId} size={64} />
        <div className="flex-1 min-w-0">
          <div className="text-lg font-bold text-gray-800 truncate">{profile.nickname}</div>
          <div className="text-xs text-amber-700 mt-0.5">
            {title.emoji} {title.name}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">
            {seen.dot} {seen.text}
          </div>
        </div>
      </section>
      {profile.signature && (
        <p className="text-xs text-gray-700 italic bg-amber-50 border border-amber-100 rounded-lg p-2 leading-relaxed">
          「{profile.signature}」
        </p>
      )}

      {/* §2 修仙概況 */}
      <section>
        <h4 className="text-xs text-gray-500 mb-2 font-bold">📊 修仙概況</h4>
        <div className="grid grid-cols-2 gap-2">
          <ConciseStat
            label="💎 修為"
            value={cloudStats.cultivation !== null ? cloudStats.cultivation.toLocaleString() : '—'}
          />
          <ConciseStat label="🐾 神獸" value={`${creatures.length} 隻`} />
          <ConciseStat
            label="🔥 連登"
            value={cloudStats.consecutiveDays !== null ? `${cloudStats.consecutiveDays} 天` : '—'}
          />
          <ConciseStat label="📚 圖鑑" value={`${creatures.length} / ${CREATURES.length}`} />
        </div>
      </section>

      {/* §3 展示神獸 */}
      <section>
        <h4 className="text-xs text-gray-500 mb-2 font-bold">🏆 展示神獸</h4>
        {showcaseFallback && (
          <p className="text-[11px] text-gray-400 italic mb-1">
            此玩家尚未自選展示,顯示對方等級最高 3 隻
          </p>
        )}
        {showcaseIds.length === 0 ? (
          <p className="text-xs text-gray-400 italic text-center py-3">尚未召喚任何神獸</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-2 px-2">
            {showcaseIds.map((id) => {
              const c = getCreature(id);
              const summary = creatures.find((cr) => cr.creatureSpeciesId === id);
              const src = c?.art ? `/sprites/${id}.png` : null;
              return (
                <ShowcaseTile
                  key={id}
                  creatureName={c?.name ?? id}
                  emoji={c?.emoji ?? '❓'}
                  src={src}
                  realm={summary?.highestRealm}
                  level={summary?.highestLevel ?? 1}
                  isEternal={summary?.isEternal ?? false}
                  onMyShareClick={
                    onShareMyPet
                      ? async () => {
                          // 找自己對應 species 的 pet,有就帶過去開 ShareModal
                          const myPets = await petRepo.list();
                          const mine = myPets.find((p) => p.speciesId === id);
                          if (mine) onShareMyPet(mine);
                        }
                      : undefined
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      {/* §4 神獸圖鑑差異 */}
      <section>
        <h4 className="text-xs text-gray-500 mb-2 font-bold">📚 神獸圖鑑</h4>
        {codex ? (
          <CodexComparisonView entries={codex.entries} summary={codex.summary} />
        ) : (
          <p className="text-xs text-gray-400 italic text-center py-3">載入中⋯</p>
        )}
      </section>

      {/* §5 修煉里程碑時間軸 */}
      <section>
        <h4 className="text-xs text-gray-500 mb-2 font-bold">⏳ 修煉里程碑</h4>
        <MilestoneTimeline initial={milestones} userId={profile.userId} />
      </section>

      {/* §6 我 vs 他對比表 */}
      <section>
        <h4 className="text-xs text-gray-500 mb-2 font-bold">⚔ 我 vs 他</h4>
        <MeVsThemList metrics={metrics} />
      </section>

      {/* §6.5 持倉組合(階段 5E) */}
      <section>
        <h4 className="text-xs text-gray-500 mb-2 font-bold">💼 持倉組合</h4>
        <FriendPortfolioView friendUserId={profile.userId} />
      </section>

      {/* §6.6 修煉排行榜 — 5E.x 改版 2:搬到 FriendsModal「排行」tab,
          這裡不再 inline section,避免重複(對方個人頁本來就比不了好友圈) */}

      {/* §8 操作 */}
      <hr className="border-gray-200" />
      <section className="space-y-2">
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="w-full py-2 bg-red-100 text-red-700 rounded-lg text-sm font-bold border border-red-200 disabled:opacity-50"
        >
          移除好友
        </button>
        <button
          type="button"
          onClick={onBlock}
          disabled={busy}
          className="w-full py-2 bg-gray-200 text-gray-700 rounded-lg text-sm border border-gray-300 disabled:opacity-50"
        >
          封鎖此用戶
        </button>
      </section>
    </div>
  );
}

// ─── 小元件:統計格 ─────────────────────────────────────

function ConciseStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="item-card px-3 py-2">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="text-base font-bold text-gray-800 tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

// ─── 展示神獸格 ───────────────────────────────────────────

function ShowcaseTile({
  creatureName,
  emoji,
  src,
  realm,
  level,
  isEternal,
  onMyShareClick
}: {
  creatureName: string;
  emoji: string;
  src: string | null;
  realm?: string;
  level: number;
  isEternal: boolean;
  onMyShareClick?: () => void;
}) {
  return (
    <div className="shrink-0 w-28 item-card p-2 text-center">
      <div className="w-full aspect-square rounded-md bg-gradient-to-br from-amber-50 to-amber-100 flex items-center justify-center overflow-hidden relative">
        {src ? (
          <img src={src} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-4xl">{emoji}</span>
        )}
        {isEternal && (
          <span className="absolute top-0.5 right-0.5 text-amber-500 text-base" title="永恆紀念">
            ✨
          </span>
        )}
      </div>
      <div className="text-[11px] font-bold mt-1 truncate">{creatureName}</div>
      <div className="text-[10px] text-gray-500">
        {realm ? realmLabel(realm as Parameters<typeof realmLabel>[0]) : '—'} · Lv.{level}
      </div>
      {onMyShareClick && (
        <button
          type="button"
          onClick={onMyShareClick}
          className="mt-1 text-[10px] text-amber-700 font-bold underline-offset-2 hover:underline"
          title="我也有這隻 → 開分享卡"
        >
          我也有 ›
        </button>
      )}
    </div>
  );
}

// ─── 圖鑑對比 ────────────────────────────────────────────

const CODEX_COLOR: Record<CodexEntry['status'], string> = {
  both: 'bg-emerald-100 border-emerald-300',
  me_only: 'bg-blue-100 border-blue-300',
  them_only: 'bg-orange-100 border-orange-300',
  neither: 'bg-gray-100 border-gray-300 opacity-60'
};

function CodexComparisonView({
  entries,
  summary
}: {
  entries: CodexEntry[];
  summary: CodexComparisonSummary;
}) {
  return (
    <div>
      <div className="text-[11px] text-gray-600 mb-2 flex flex-wrap gap-x-3 gap-y-1">
        <span>
          我 <b>{summary.myOwned}</b> / {summary.total}
        </span>
        <span>
          他 <b>{summary.theirOwned}</b> / {summary.total}
        </span>
        <span>
          共同 <b className="text-emerald-700">{summary.bothOwned}</b>
        </span>
      </div>
      {/* 圖例 */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-500 mb-2">
        <Legend color="bg-emerald-200" label="共有" />
        <Legend color="bg-blue-200" label="只我有" />
        <Legend color="bg-orange-200" label="只他有" />
        <Legend color="bg-gray-200" label="都沒有" />
      </div>
      <div className="grid grid-cols-6 gap-1">
        {entries.map((e) => {
          const c = getCreature(e.creatureSpeciesId);
          const src = c?.art ? `/sprites/${e.creatureSpeciesId}.png` : null;
          const isDark = e.status === 'neither';
          return (
            <div
              key={e.creatureSpeciesId}
              className={`aspect-square rounded-md border ${CODEX_COLOR[e.status]} relative overflow-hidden`}
              title={`${c?.name ?? e.creatureSpeciesId}${e.theirRealm ? ` · ${realmLabel(e.theirRealm)}` : ''}`}
            >
              {isDark ? (
                <span className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
                  ?
                </span>
              ) : src ? (
                <img
                  src={src}
                  alt=""
                  className={`w-full h-full object-cover ${e.status === 'them_only' ? 'opacity-80' : ''}`}
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-xl">
                  {c?.emoji}
                </span>
              )}
              {(e.myEternal || e.theirEternal) && (
                <span className="absolute top-0 right-0 text-[8px] text-amber-500">✨</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block w-3 h-3 rounded ${color} border border-gray-300`} />
      {label}
    </span>
  );
}

// ─── 里程碑時間軸 ──────────────────────────────────────

const MS_EMOJI: Record<MilestoneEventType, string> = {
  summon: '🐉',
  realm_up: '✨',
  title_up: '⭐',
  streak: '🔥',
  eternal: '💎'
};

function MilestoneText(m: UserMilestone): string {
  const d = m.eventData;
  switch (m.eventType) {
    case 'summon':
      return `召喚 ${d.creatureName ?? d.creatureId ?? ''}`;
    case 'realm_up':
      return `${d.creatureName ?? d.creatureId ?? ''} 突破 ${d.realmLabel ?? d.realm ?? ''}`;
    case 'title_up':
      return `晉升 ${d.titleName ?? `稱號 ${d.titleId}`}`;
    case 'streak':
      return `連登 ${d.streakDays ?? '?'} 天里程碑`;
    case 'eternal':
      return `${d.creatureName ?? d.creatureId ?? ''} 進入永恆`;
  }
}

function formatMilestoneDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function MilestoneTimeline({
  initial,
  userId
}: {
  initial: UserMilestone[];
  userId: string;
}) {
  const [items, setItems] = useState<UserMilestone[]>(initial);
  const [loading, setLoading] = useState(false);
  const [exhausted, setExhausted] = useState(initial.length < 10);

  useEffect(() => {
    setItems(initial);
    setExhausted(initial.length < 10);
  }, [initial]);

  async function loadMore() {
    if (loading || exhausted) return;
    setLoading(true);
    const { getFriendMilestones } = await import('@/services/friendProfileService');
    const more = await getFriendMilestones(userId, 10, items.length);
    setLoading(false);
    if (more.length === 0) {
      setExhausted(true);
      return;
    }
    setItems((prev) => [...prev, ...more]);
    if (more.length < 10) setExhausted(true);
  }

  if (items.length === 0) {
    return <p className="text-xs text-gray-400 italic text-center py-3">尚無修煉紀錄</p>;
  }
  return (
    <div className="space-y-1.5">
      {items.map((m) => (
        <div
          key={m.id}
          className="flex items-baseline gap-2 text-xs px-1 py-1 border-l-2 border-amber-200"
        >
          <span className="text-gray-500 tabular-nums shrink-0 w-[80px]">
            {formatMilestoneDate(m.occurredAt)}
          </span>
          <span className="text-base shrink-0">{MS_EMOJI[m.eventType]}</span>
          <span className="text-gray-700 break-words">{MilestoneText(m)}</span>
        </div>
      ))}
      {!exhausted && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          className="w-full py-1.5 text-xs text-mythic-jade-500 disabled:opacity-50"
        >
          {loading ? '載入中⋯' : '── 載入更多 ──'}
        </button>
      )}
    </div>
  );
}

// ─── 我 vs 他對比表 ─────────────────────────────────────

function MeVsThemList({ metrics }: { metrics: VsMetric[] }) {
  if (metrics.length === 0) {
    return <p className="text-xs text-gray-400 italic text-center py-3">載入中⋯</p>;
  }
  return (
    <div className="space-y-2">
      {metrics.map((m) => {
        const max = Math.max(m.me, m.them, 1);
        const mePct = (m.me / max) * 100;
        const themPct = (m.them / max) * 100;
        const fmt = m.format ?? ((n: number) => n.toLocaleString());
        const meWin = m.me > m.them;
        const themWin = m.them > m.me;
        return (
          <div key={m.label} className="item-card px-3 py-2">
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-gray-600">{m.label}</span>
              <span className="text-gray-500">
                <span className={meWin ? 'text-blue-600 font-bold' : ''}>我 {fmt(m.me)}</span>
                <span className="mx-1 text-gray-400">vs</span>
                <span className={themWin ? 'text-orange-600 font-bold' : ''}>他 {fmt(m.them)}</span>
              </span>
            </div>
            <div className="flex gap-1 items-stretch h-2">
              <div className="flex-1 bg-blue-100 rounded overflow-hidden">
                <div
                  className="bg-blue-500 h-full"
                  style={{ width: `${mePct}%`, transition: 'width 300ms' }}
                />
              </div>
              <div className="flex-1 bg-orange-100 rounded overflow-hidden">
                <div
                  className="bg-orange-500 h-full"
                  style={{ width: `${themPct}%`, transition: 'width 300ms' }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── 骨架屏 ─────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-16 h-16 rounded-full bg-gray-200" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-3 bg-gray-200 rounded w-1/3" />
          <div className="h-3 bg-gray-200 rounded w-1/4" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-gray-100 rounded" />
        ))}
      </div>
      <div className="h-20 bg-gray-100 rounded" />
      <div className="h-32 bg-gray-100 rounded" />
    </div>
  );
}
