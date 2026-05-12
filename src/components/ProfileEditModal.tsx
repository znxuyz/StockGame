import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import AvatarSelectorModal from './AvatarSelectorModal';
import { useMyProfile } from '@/hooks/useMyProfile';
import { useCultivation } from '@/hooks/useCultivation';
import {
  updateProfile,
  formatInviteCode,
  getTitle
} from '@/services';
import { getCreature } from '@/data/creatures';

interface ProfileEditModalProps {
  open: boolean;
  onClose: () => void;
  /** 操作完成回拋訊息給 caller(顯示 toast) */
  onActionComplete?: (message: string) => void;
}

const NICKNAME_MAX = 20;
const SIGNATURE_MAX = 150;

/**
 * 階段 5A:個人檔案編輯彈窗。
 *
 *  - 頭像 / 暱稱 / 簽名 可改
 *  - 稱號自動依累積修為顯示(讀 useCultivation.lifetimeEarned)
 *  - 加入日期 / 修煉天數 顯示
 *  - 邀請碼複製 + 系統分享面板(navigator.share 不支援時隱藏分享鈕)
 *  - dirty 狀態:有未儲存變更時關 modal 提示確認
 *
 * 未登入雲端 → 顯示提示「請先登入雲端帳號」(其實沒入口會走到這,防呆)
 */
export default function ProfileEditModal({ open, onClose, onActionComplete }: ProfileEditModalProps) {
  const { profile, loading, reload } = useMyProfile();
  const cultivation = useCultivation();
  const title = getTitle(cultivation.lifetimeEarned);

  const [nickname, setNickname] = useState('');
  const [signature, setSignature] = useState('');
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [copyFlash, setCopyFlash] = useState(false);

  useEffect(() => {
    if (open && profile) {
      setNickname(profile.nickname);
      setSignature(profile.signature ?? '');
      setAvatarId(profile.avatarCreatureId);
      setError(null);
    }
  }, [open, profile?.userId]);

  const dirty = useMemo(() => {
    if (!profile) return false;
    return (
      nickname.trim() !== profile.nickname.trim() ||
      signature !== (profile.signature ?? '') ||
      avatarId !== profile.avatarCreatureId
    );
  }, [nickname, signature, avatarId, profile]);

  const cultivationDays = useMemo(() => {
    if (!profile?.createdAt) return 0;
    const created = new Date(profile.createdAt).getTime();
    if (!Number.isFinite(created)) return 0;
    return Math.max(1, Math.floor((Date.now() - created) / (24 * 60 * 60 * 1000)));
  }, [profile?.createdAt]);

  async function handleSave() {
    if (busy || !profile) return;
    const trimmed = nickname.trim();
    if (trimmed.length < 1 || trimmed.length > NICKNAME_MAX) {
      setError(`暱稱需為 1-${NICKNAME_MAX} 字`);
      return;
    }
    if (signature.length > SIGNATURE_MAX) {
      setError(`簽名最多 ${SIGNATURE_MAX} 字`);
      return;
    }
    setBusy(true);
    setError(null);
    const r = await updateProfile({
      nickname: trimmed,
      signature,
      avatarCreatureId: avatarId
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    await reload();
    onActionComplete?.('✨ 個人檔案已更新');
    onClose();
  }

  function handleClose() {
    if (dirty) {
      if (!confirm('有未儲存的變更,確定要離開?')) return;
    }
    onClose();
  }

  async function handleCopy() {
    if (!profile?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(formatInviteCode(profile.inviteCode));
      setCopyFlash(true);
      setTimeout(() => setCopyFlash(false), 1500);
    } catch {
      // clipboard 權限被拒,選 fallback select + execCommand 太醜了直接放棄
      onActionComplete?.('⚠️ 無法複製到剪貼簿');
    }
  }

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function handleShare() {
    if (!profile?.inviteCode) return;
    const url = window.location.origin;
    const text = `來玩神獸股市!用我的邀請碼 ${formatInviteCode(profile.inviteCode)} 加我好友\n👉 ${url}`;
    try {
      await navigator.share({ title: '神獸股市', text, url });
    } catch {
      // user cancel / 不支援 → 靜默
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="個人檔案">
      {loading ? (
        <p className="text-sm text-gray-500 text-center py-6">載入中⋯</p>
      ) : !profile ? (
        <div className="text-center py-6 space-y-2">
          <p className="text-sm text-gray-700">尚未登入雲端帳號</p>
          <p className="text-xs text-gray-500">登入後即可設定個人檔案</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* 頭像 */}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => setAvatarOpen(true)}
              className="w-24 h-24 rounded-full border-4 border-amber-300 overflow-hidden bg-gradient-to-br from-amber-50 to-amber-100 active:scale-95 transition-transform shadow-md"
              aria-label="更換頭像"
            >
              {avatarId ? (
                (() => {
                  const c = getCreature(avatarId);
                  const src = c?.art ? `/sprites/${avatarId}.png` : null;
                  return src ? (
                    <img
                      src={src}
                      alt={c?.name ?? ''}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <span className="w-full h-full flex items-center justify-center text-5xl">
                      {c?.emoji ?? '❓'}
                    </span>
                  );
                })()
              ) : (
                <span className="w-full h-full flex items-center justify-center text-4xl text-gray-400 bg-gray-200">?</span>
              )}
            </button>
            <span className="text-[11px] text-gray-500">點頭像更換</span>
          </div>

          {/* 暱稱 */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              暱稱
              <span className="float-right text-[11px] text-gray-400">
                {nickname.trim().length} / {NICKNAME_MAX}
              </span>
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value.slice(0, NICKNAME_MAX))}
              className="input-field"
              maxLength={NICKNAME_MAX}
              placeholder="修仙者#1234"
            />
            <p className="text-[11px] text-gray-500 mt-1">1-{NICKNAME_MAX} 字</p>
          </div>

          {/* 稱號(自動,不可改) */}
          <div className="rounded-lg p-2 bg-amber-50 border border-amber-200 text-center">
            <span className="text-xs text-gray-600">稱號:</span>{' '}
            <span className="font-bold text-amber-700">
              {title.emoji} {title.name}
            </span>
            <p className="text-[11px] text-gray-500 mt-0.5">依累積修為自動升級</p>
          </div>

          {/* 簽名 */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              個人簽名
              <span className="float-right text-[11px] text-gray-400">
                {signature.length} / {SIGNATURE_MAX}
              </span>
            </label>
            <textarea
              value={signature}
              onChange={(e) => setSignature(e.target.value.slice(0, SIGNATURE_MAX))}
              className="input-field min-h-[60px] resize-none"
              maxLength={SIGNATURE_MAX}
              placeholder="但行好事,莫問前程⋯"
            />
          </div>

          <hr className="border-gray-200" />

          {/* 元資料 */}
          <div className="text-xs text-gray-600 space-y-1">
            <div className="flex justify-between">
              <span>加入日期</span>
              <span>{new Date(profile.createdAt).toLocaleDateString('zh-TW')}</span>
            </div>
            <div className="flex justify-between">
              <span>修煉天數</span>
              <span>{cultivationDays} 天</span>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* 邀請碼 */}
          <div>
            <p className="text-xs text-gray-500 mb-1">我的邀請碼</p>
            <div className="bg-gradient-to-r from-amber-100 to-amber-200 border border-amber-300 rounded-lg py-3 text-center">
              <span className="text-2xl font-mono font-bold tracking-widest text-amber-900">
                {formatInviteCode(profile.inviteCode)}
              </span>
            </div>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={handleCopy}
                className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors ${
                  copyFlash
                    ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                    : 'bg-white/60 border-gray-300 text-gray-700'
                }`}
              >
                {copyFlash ? '✓ 已複製' : '📋 複製'}
              </button>
              {canShare && (
                <button
                  type="button"
                  onClick={handleShare}
                  className="flex-1 py-2 rounded-lg text-sm font-bold border bg-white/60 border-gray-300 text-gray-700"
                >
                  📤 分享
                </button>
              )}
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={busy || !dirty}
            className="w-full py-3 bg-emerald-500 text-white rounded-lg font-bold disabled:opacity-50 active:scale-[0.99] transition-transform"
          >
            {busy ? '儲存中⋯' : dirty ? '儲存變更' : '無變更'}
          </button>
        </div>
      )}

      {/* 頭像選擇器(state-based 子彈窗 — 是 nested Modal,但這個 modal 結構簡單沒踩 iOS bug
          因為 selector 開時可關掉再開個人檔案,玩家不會同時看到兩層) */}
      <AvatarSelectorModal
        open={avatarOpen}
        onClose={() => setAvatarOpen(false)}
        currentAvatarId={avatarId}
        onSelect={(id) => setAvatarId(id)}
      />
    </Modal>
  );
}

/** 給其他元件想 inline 顯示頭像時呼叫(好友卡片用) */
export function ProfileAvatar({
  avatarCreatureId,
  size = 40
}: {
  avatarCreatureId: string | null;
  size?: number;
}) {
  if (!avatarCreatureId) {
    return (
      <div
        className="rounded-full bg-gray-300 flex items-center justify-center text-gray-500 shrink-0"
        style={{ width: size, height: size, fontSize: size * 0.45 }}
        aria-hidden
      >
        ?
      </div>
    );
  }
  const c = getCreature(avatarCreatureId);
  const src = c?.art ? `/sprites/${avatarCreatureId}.png` : null;
  if (src) {
    return (
      <div
        className="rounded-full overflow-hidden border border-amber-200 bg-amber-50 shrink-0"
        style={{ width: size, height: size }}
      >
        <img
          src={src}
          alt={c?.name ?? ''}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>
    );
  }
  return (
    <div
      className="rounded-full bg-amber-100 flex items-center justify-center shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.55 }}
      aria-hidden
    >
      {c?.emoji ?? '❓'}
    </div>
  );
}
