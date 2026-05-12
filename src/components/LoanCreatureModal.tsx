import { useEffect, useState } from 'react';
import Modal from './Modal';
import { ProfileAvatar } from './ProfileEditModal';
import { getFriends, loanCreature, getTitle } from '@/services';
import { LOAN_DURATION_MS, LOAN_REWARD, type FriendEntry, type Pet } from '@/types';
import { getCreature, getPetDisplayName } from '@/data/creatures';

interface LoanCreatureModalProps {
  open: boolean;
  onClose: () => void;
  pet: Pet | null;
  onActionComplete?: (message: string) => void;
}

/**
 * 階段 5E:借展神獸給好友彈窗。
 *
 *  - 只有 isEternal=true 的 pet 才能進這裡(caller 在 PetInfoModal 已過濾)
 *  - 列出好友清單,點選後確認借出
 *  - 24 小時自動歸還(由 App.tsx 全域 checkExpiredLoans 處理)
 *  - 雙方領 100 修為(出借人立刻領,借入人下次打開借展頁時 claim)
 */
export default function LoanCreatureModal({
  open,
  onClose,
  pet,
  onActionComplete
}: LoanCreatureModalProps) {
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setError(null);
      return;
    }
    setLoading(true);
    getFriends().then((r) => {
      setFriends(r);
      setLoading(false);
    });
  }, [open]);

  if (!pet) return null;
  const species = getCreature(pet.speciesId);
  if (!species) return null;

  async function handleConfirm() {
    if (!selectedId || busy || !pet) return;
    setBusy(true);
    setError(null);
    const r = await loanCreature(selectedId, pet.speciesId);
    setBusy(false);
    if (!r.ok) {
      const map: Record<string, string> = {
        self_loan: '不能借給自己',
        not_eternal: '此神獸非永恆紀念,無法借展',
        already_loaned: '此神獸已借出中,請先收回',
        lender_limit: `你最多同時借出 3 隻神獸,先收回一隻再試`,
        borrower_limit: '對方已借入 3 隻神獸,空間不足',
        not_signed_in: '尚未登入',
        unknown: r.error ?? '操作失敗,請稍後再試'
      };
      setError(map[r.reason] ?? '操作失敗');
      return;
    }
    onActionComplete?.(`🎁 已借展給好友 +${LOAN_REWARD} 修為`);
    onClose();
  }

  const src = species.art ? `/sprites/${species.id}.png` : null;
  const hours = Math.floor(LOAN_DURATION_MS / 3_600_000);

  return (
    <Modal open={open} onClose={onClose} title="🎁 借展神獸給好友">
      <div className="space-y-3">
        {/* 神獸卡 */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <div className="w-16 h-16 rounded-lg overflow-hidden bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center shrink-0 ring-2 ring-amber-400">
            {src ? (
              <img src={src} alt={species.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl">{species.emoji}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-base font-bold text-gray-800 truncate">
              {getPetDisplayName(pet, species)}
            </div>
            <div className="text-xs text-amber-700">💎 永恆紀念</div>
          </div>
        </div>

        <div className="text-xs text-gray-600 space-y-1">
          <p>⏰ 借展期間:{hours} 小時(自動歸還)</p>
          <p>💎 雙方各獲得 {LOAN_REWARD} 修為</p>
          <p>📥 你可隨時提前收回,獎勵不退</p>
        </div>

        {/* 好友清單 */}
        <div>
          <div className="text-xs text-gray-500 mb-2">選擇借展對象</div>
          {loading ? (
            <p className="text-xs text-gray-400 italic text-center py-4">載入好友⋯</p>
          ) : friends.length === 0 ? (
            <p className="text-xs text-gray-500 italic text-center py-4">
              還沒有好友 — 先去加好友吧
            </p>
          ) : (
            <div className="space-y-1.5">
              {friends.map((f) => {
                const title = getTitle(f.cultivation ?? 0);
                const selected = selectedId === f.userId;
                return (
                  <button
                    key={f.userId}
                    type="button"
                    onClick={() => setSelectedId(f.userId)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left ${
                      selected
                        ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400'
                        : 'bg-white/60 border-gray-200'
                    } active:scale-[0.99] transition-transform`}
                  >
                    <ProfileAvatar
                      avatarCreatureId={f.profile.avatarCreatureId}
                      size={36}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-gray-800 truncate">
                        {f.profile.nickname}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {title.emoji} {title.name}
                      </div>
                    </div>
                    {selected && <span className="text-emerald-600 font-bold">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleConfirm}
          disabled={!selectedId || busy}
          className="w-full py-3 bg-amber-500 text-white rounded-lg font-bold disabled:opacity-50 active:scale-[0.99] transition-transform"
        >
          {busy ? '借展中⋯' : '確認借展'}
        </button>
      </div>
    </Modal>
  );
}
