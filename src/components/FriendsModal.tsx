import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import { ProfileAvatar } from './ProfileEditModal';
import { useAuth } from '@/lib/auth';
import { isCloudConfigured } from '@/lib/supabase';
import { formatLastSeen } from '@/hooks/useMyProfile';
import {
  searchByInviteCode,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
  removeFriend,
  blockUser,
  getFriends,
  getPendingRequests,
  getSentRequests,
  formatInviteCode,
  formatInviteCodeInput,
  getTitle,
  type SearchResult
} from '@/services';
import type { FriendEntry, FriendRequestEntry } from '@/types';

type Tab = 'friends' | 'requests' | 'search';

interface FriendsModalProps {
  open: boolean;
  onClose: () => void;
  /** 開個人檔案的 callback,讓 caller 控制(因為 App 用 ModalKind state 管所有彈窗) */
  onOpenProfile?: () => void;
  /** 沒登入時的登入入口 */
  onOpenSignIn?: () => void;
}

/**
 * 階段 5A:好友彈窗 — 3 tab 結構(好友 / 請求 / 搜尋)。
 *
 *  - 未登入雲端 → 顯示「請先登入」入口
 *  - 已登入但雲端表還沒建(migration 沒跑)→ service 內 try/catch,UI 顯示空
 *  - 各操作後重新拉資料,沒做 realtime subscribe(MVP 不上 Supabase Realtime,
 *    避免 socket 連線跟 cloudSync 打架)
 */
export default function FriendsModal({
  open,
  onClose,
  onOpenSignIn
}: FriendsModalProps) {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [tab, setTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [pending, setPending] = useState<FriendRequestEntry[]>([]);
  const [sent, setSent] = useState<FriendRequestEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [f, p, s] = await Promise.all([
        getFriends(),
        getPendingRequests(),
        getSentRequests()
      ]);
      setFriends(f);
      setPending(p);
      setSent(s);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (open && userId) {
      reload();
    }
  }, [open, userId, reload]);

  // 切回 friends tab 時自動 reload(從 search 加完好友後切回看)
  useEffect(() => {
    if (open && userId && tab === 'friends') {
      reload();
    }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isCloudConfigured) {
    return (
      <Modal open={open} onClose={onClose} title="好友">
        <div className="text-center py-8 space-y-3">
          <div className="text-5xl">☁</div>
          <p className="text-sm text-gray-700">雲端同步未啟用</p>
          <p className="text-xs text-gray-500">好友功能需要設定 Supabase 環境變數</p>
        </div>
      </Modal>
    );
  }

  if (!userId) {
    return (
      <Modal open={open} onClose={onClose} title="好友">
        <div className="text-center py-8 space-y-3">
          <div className="text-5xl">🔐</div>
          <p className="text-sm text-gray-700">請先登入雲端帳號</p>
          <p className="text-xs text-gray-500 mb-3">好友資料儲存在雲端,需要登入才能使用</p>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenSignIn?.();
            }}
            className="px-5 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold"
          >
            前往登入
          </button>
        </div>
      </Modal>
    );
  }

  const pendingBadge = pending.length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="好友"
      headerExtra={
        <div className="flex gap-1 mt-2">
          <TabBtn active={tab === 'friends'} onClick={() => setTab('friends')}>
            好友 {friends.length > 0 ? `(${friends.length})` : ''}
          </TabBtn>
          <TabBtn active={tab === 'requests'} onClick={() => setTab('requests')} badge={pendingBadge}>
            請求
          </TabBtn>
          <TabBtn active={tab === 'search'} onClick={() => setTab('search')}>
            搜尋
          </TabBtn>
        </div>
      }
    >
      {tab === 'friends' && (
        <FriendsTab friends={friends} loading={loading} onReload={reload} />
      )}
      {tab === 'requests' && (
        <RequestsTab
          pending={pending}
          sent={sent}
          loading={loading}
          onReload={reload}
        />
      )}
      {tab === 'search' && <SearchTab onReload={reload} />}
    </Modal>
  );
}

function TabBtn({
  active,
  onClick,
  children,
  badge
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex-1 py-1.5 px-2 rounded-md text-xs font-bold transition-colors ${
        active ? 'bg-mythic-jade-100 text-mythic-jade-700' : 'bg-white/40 text-gray-500'
      }`}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1 shadow">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

// ─── 好友 tab ────────────────────────────────────────────

function FriendsTab({
  friends,
  loading,
  onReload
}: {
  friends: FriendEntry[];
  loading: boolean;
  onReload: () => Promise<void>;
}) {
  const [actionOn, setActionOn] = useState<string | null>(null);

  async function handleRemove(userId: string, nickname: string) {
    if (!confirm(`確定要移除好友「${nickname}」?`)) return;
    const r = await removeFriend(userId);
    if (!r.ok && r.error) {
      alert(`移除失敗:${r.error}`);
    }
    setActionOn(null);
    await onReload();
  }

  async function handleBlock(userId: string, nickname: string) {
    if (!confirm(`確定要封鎖「${nickname}」?\n封鎖後對方搜尋不到你,雙方關係解除。`)) return;
    const r = await blockUser(userId);
    if (!r.ok && r.error) {
      alert(`封鎖失敗:${r.error}`);
    }
    setActionOn(null);
    await onReload();
  }

  if (loading && friends.length === 0) {
    return <p className="text-xs text-gray-500 text-center py-6">載入中⋯</p>;
  }
  if (friends.length === 0) {
    return (
      <div className="text-center py-8 space-y-2">
        <div className="text-4xl">👥</div>
        <p className="text-sm text-gray-700">還沒有好友</p>
        <p className="text-xs text-gray-500">用「搜尋」tab 輸入邀請碼加好友</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">我的好友 ({friends.length})</p>
      {friends.map((f) => (
        <FriendCard
          key={f.friendshipId}
          entry={f}
          actionOpen={actionOn === f.userId}
          onActionToggle={() => setActionOn((cur) => (cur === f.userId ? null : f.userId))}
          onRemove={() => handleRemove(f.userId, f.profile.nickname)}
          onBlock={() => handleBlock(f.userId, f.profile.nickname)}
        />
      ))}
    </div>
  );
}

function FriendCard({
  entry,
  actionOpen,
  onActionToggle,
  onRemove,
  onBlock
}: {
  entry: FriendEntry;
  actionOpen: boolean;
  onActionToggle: () => void;
  onRemove: () => void;
  onBlock: () => void;
}) {
  const seen = formatLastSeen(entry.profile.lastSeenAt);
  const title = getTitle(entry.cultivation ?? 0);
  return (
    <div className="item-card px-3 py-2 relative">
      <button
        type="button"
        onClick={onActionToggle}
        className="w-full flex items-center gap-3 text-left active:bg-white/30 transition-colors rounded"
      >
        <ProfileAvatar avatarCreatureId={entry.profile.avatarCreatureId} size={44} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-gray-800 truncate">{entry.profile.nickname}</div>
          <div className="text-[11px] text-gray-600 flex items-center gap-2 mt-0.5">
            <span>
              {title.emoji} {title.name}
            </span>
            {entry.cultivation !== null && (
              <span className="text-gray-500">💎 {entry.cultivation.toLocaleString()}</span>
            )}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">
            {seen.dot} {seen.text}
          </div>
        </div>
        <span className="text-gray-400 text-xs">⋯</span>
      </button>
      {actionOpen && (
        <div className="mt-2 pt-2 border-t border-gray-200 flex gap-2">
          <button
            type="button"
            onClick={onRemove}
            className="flex-1 py-1.5 text-xs font-bold bg-red-100 text-red-700 rounded border border-red-200"
          >
            移除好友
          </button>
          <button
            type="button"
            onClick={onBlock}
            className="flex-1 py-1.5 text-xs font-bold bg-gray-200 text-gray-700 rounded border border-gray-300"
          >
            封鎖
          </button>
        </div>
      )}
    </div>
  );
}

// ─── 請求 tab ────────────────────────────────────────────

function RequestsTab({
  pending,
  sent,
  loading,
  onReload
}: {
  pending: FriendRequestEntry[];
  sent: FriendRequestEntry[];
  loading: boolean;
  onReload: () => Promise<void>;
}) {
  async function handleAccept(id: number) {
    const r = await acceptFriendRequest(id);
    if (!r.ok && r.error) alert(`接受失敗:${r.error}`);
    await onReload();
  }
  async function handleReject(id: number) {
    const r = await rejectFriendRequest(id);
    if (!r.ok && r.error) alert(`拒絕失敗:${r.error}`);
    await onReload();
  }
  async function handleCancel(id: number) {
    const r = await cancelFriendRequest(id);
    if (!r.ok && r.error) alert(`取消失敗:${r.error}`);
    await onReload();
  }

  if (loading && pending.length === 0 && sent.length === 0) {
    return <p className="text-xs text-gray-500 text-center py-6">載入中⋯</p>;
  }
  return (
    <div className="space-y-4">
      <section>
        <p className="text-xs text-gray-500 mb-2">收到的請求 ({pending.length})</p>
        {pending.length === 0 ? (
          <p className="text-xs text-gray-400 italic text-center py-3">目前沒有新的好友請求</p>
        ) : (
          <div className="space-y-2">
            {pending.map((r) => (
              <RequestCard
                key={r.id}
                entry={r}
                actions={
                  <>
                    <button
                      type="button"
                      onClick={() => handleAccept(r.id)}
                      className="flex-1 py-1.5 text-xs font-bold bg-emerald-500 text-white rounded"
                    >
                      接受
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReject(r.id)}
                      className="flex-1 py-1.5 text-xs font-bold bg-gray-200 text-gray-700 rounded border border-gray-300"
                    >
                      拒絕
                    </button>
                  </>
                }
              />
            ))}
          </div>
        )}
      </section>
      <section>
        <p className="text-xs text-gray-500 mb-2">已發送 ({sent.length})</p>
        {sent.length === 0 ? (
          <p className="text-xs text-gray-400 italic text-center py-3">沒有等待回應的請求</p>
        ) : (
          <div className="space-y-2">
            {sent.map((r) => (
              <RequestCard
                key={r.id}
                entry={r}
                hint="等待回應⋯"
                actions={
                  <button
                    type="button"
                    onClick={() => handleCancel(r.id)}
                    className="flex-1 py-1.5 text-xs font-bold bg-gray-200 text-gray-700 rounded border border-gray-300"
                  >
                    取消請求
                  </button>
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function RequestCard({
  entry,
  actions,
  hint
}: {
  entry: FriendRequestEntry;
  actions: React.ReactNode;
  hint?: string;
}) {
  const title = getTitle(entry.cultivation ?? 0);
  return (
    <div className="item-card px-3 py-2">
      <div className="flex items-center gap-3">
        <ProfileAvatar avatarCreatureId={entry.otherProfile.avatarCreatureId} size={40} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-gray-800 truncate">
            {entry.otherProfile.nickname}
          </div>
          <div className="text-[11px] text-gray-600 flex items-center gap-2 mt-0.5">
            <span>
              {title.emoji} {title.name}
            </span>
            {entry.cultivation !== null && (
              <span className="text-gray-500">💎 {entry.cultivation.toLocaleString()}</span>
            )}
          </div>
          {hint && <div className="text-[11px] text-gray-400 italic mt-0.5">{hint}</div>}
        </div>
      </div>
      <div className="mt-2 flex gap-2">{actions}</div>
    </div>
  );
}

// ─── 搜尋 tab ────────────────────────────────────────────

function SearchTab({ onReload }: { onReload: () => Promise<void> }) {
  const [input, setInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cleanLen = useMemo(() => input.replace(/[\s-]/g, '').length, [input]);

  async function handleSearch() {
    if (cleanLen !== 8) {
      setError('邀請碼需 8 碼');
      return;
    }
    setSearching(true);
    setError(null);
    setResult(null);
    setNotFound(false);
    const r = await searchByInviteCode(input);
    setSearching(false);
    if (!r) {
      setNotFound(true);
      return;
    }
    setResult(r);
  }

  async function handleAdd() {
    if (!result || result.relation !== 'none') return;
    setBusy(true);
    const r = await sendFriendRequest(result.profile.userId);
    setBusy(false);
    if (!r.ok) {
      if (r.reason === 'already_friend') {
        setResult({ ...result, relation: 'friend' });
      } else if (r.reason === 'already_sent') {
        setResult({ ...result, relation: 'request_sent' });
      } else {
        setError(r.error ?? '操作失敗');
      }
      return;
    }
    setResult({ ...result, relation: 'request_sent' });
    await onReload();
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-600">
        輸入對方的 8 碼邀請碼,例如 <span className="font-mono">STK7-A9B2</span>。
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(formatInviteCodeInput(e.target.value))}
          className="input-field flex-1 font-mono tracking-widest text-center uppercase"
          placeholder="XXXX-XXXX"
          maxLength={9}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={searching || cleanLen !== 8}
          className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold disabled:opacity-50"
        >
          {searching ? '⋯' : '搜尋'}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </p>
      )}

      {notFound && (
        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded p-3 text-center">
          找不到此用戶
        </p>
      )}

      {result && <SearchResultCard result={result} busy={busy} onAdd={handleAdd} />}
    </div>
  );
}

function SearchResultCard({
  result,
  busy,
  onAdd
}: {
  result: SearchResult;
  busy: boolean;
  onAdd: () => void;
}) {
  const title = getTitle(result.cultivation ?? 0);
  const profile = result.profile;
  return (
    <div className="item-card px-3 py-3 space-y-2">
      <div className="flex items-center gap-3">
        <ProfileAvatar avatarCreatureId={profile.avatarCreatureId} size={48} />
        <div className="flex-1 min-w-0">
          <div className="text-base font-bold text-gray-800 truncate">{profile.nickname}</div>
          <div className="text-xs text-gray-600 flex items-center gap-2 mt-0.5">
            <span>
              {title.emoji} {title.name}
            </span>
            {result.cultivation !== null && (
              <span className="text-gray-500">💎 {result.cultivation.toLocaleString()}</span>
            )}
          </div>
          <div className="text-[11px] text-gray-500 font-mono mt-0.5">
            {formatInviteCode(profile.inviteCode)}
          </div>
        </div>
      </div>
      {profile.signature && (
        <p className="text-xs text-gray-600 bg-amber-50 border border-amber-100 rounded p-2 leading-relaxed">
          「{profile.signature}」
        </p>
      )}
      <RelationButton relation={result.relation} busy={busy} onAdd={onAdd} />
    </div>
  );
}

function RelationButton({
  relation,
  busy,
  onAdd
}: {
  relation: SearchResult['relation'];
  busy: boolean;
  onAdd: () => void;
}) {
  if (relation === 'self') {
    return (
      <div className="text-center text-xs text-gray-500 italic py-2">這是你自己的邀請碼</div>
    );
  }
  if (relation === 'friend') {
    return (
      <div className="text-center text-xs text-emerald-700 font-bold py-2">已是好友 ✓</div>
    );
  }
  if (relation === 'request_sent') {
    return (
      <div className="text-center text-xs text-amber-700 py-2">請求發送中,等待對方回應⋯</div>
    );
  }
  if (relation === 'request_received') {
    return (
      <div className="text-center text-xs text-amber-700 py-2">
        對方已邀請你 → 到「請求」tab 接受
      </div>
    );
  }
  if (relation === 'blocked') {
    return (
      <div className="text-center text-xs text-gray-500 italic py-2">你已封鎖此用戶</div>
    );
  }
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={busy}
      className="w-full py-2 bg-emerald-500 text-white rounded-lg text-sm font-bold disabled:opacity-50 active:scale-[0.99] transition-transform"
    >
      {busy ? '發送中⋯' : '加為好友'}
    </button>
  );
}
