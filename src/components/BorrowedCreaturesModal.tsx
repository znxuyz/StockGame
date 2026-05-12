import { useCallback, useEffect, useState } from 'react';
import Modal from './Modal';
import { ProfileAvatar } from './ProfileEditModal';
import {
  claimBorrowerReward,
  getMyActiveLoans,
  recallLoan,
  type ActiveLoansBundle
} from '@/services';
import { LOAN_REWARD } from '@/types';
import { getCreature } from '@/data/creatures';

interface BorrowedCreaturesModalProps {
  open: boolean;
  onClose: () => void;
  onActionComplete?: (message: string) => void;
}

/**
 * 階段 5E:神獸借展總覽彈窗。
 *
 *  - 上半:我借出去的(outgoing)— 可「📥 提前收回」
 *  - 下半:我借入的(incoming)— 顯示出借人 + 剩餘時間,首次打開 claim +100 修為
 *
 * 不上 Phaser scene 渲染借入神獸(避免動 game/scene.ts 引發 sprite 系統大改),
 * 在這個 modal 內以列表形式呈現,點擊看詳細。
 */
export default function BorrowedCreaturesModal({
  open,
  onClose,
  onActionComplete
}: BorrowedCreaturesModalProps) {
  const [bundle, setBundle] = useState<ActiveLoansBundle>({ outgoing: [], incoming: [] });
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const r = await getMyActiveLoans();
    setBundle(r);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    void reload();
  }, [open, reload]);

  // 進來時自動 claim 所有未領的借入獎勵(各筆獨立 try/catch)
  useEffect(() => {
    if (!open) return;
    (async () => {
      let claimedAny = false;
      for (const inc of bundle.incoming) {
        if (!inc.loan.borrowerRewardGiven) {
          const r = await claimBorrowerReward(inc.loan.id);
          if (r.ok) claimedAny = true;
        }
      }
      if (claimedAny) {
        onActionComplete?.(`🎁 領取借展獎勵 +${LOAN_REWARD} 修為 / 隻`);
        void reload();
      }
    })();
  }, [open, bundle.incoming, onActionComplete, reload]);

  async function handleRecall(loanId: number, name: string) {
    if (!confirm(`確定要提前收回「${name}」?獎勵不退。`)) return;
    const r = await recallLoan(loanId);
    if (!r.ok) {
      onActionComplete?.(`⚠️ 收回失敗:${r.error ?? ''}`);
      return;
    }
    onActionComplete?.('📥 神獸已提前收回');
    await reload();
  }

  return (
    <Modal open={open} onClose={onClose} title="🎁 神獸借展">
      {loading ? (
        <p className="text-sm text-gray-500 text-center py-6">載入中⋯</p>
      ) : (
        <div className="space-y-4">
          {/* 我借出的 */}
          <section>
            <h4 className="text-xs font-bold text-gray-700 mb-2">
              📤 我借出的 ({bundle.outgoing.length} / 3)
            </h4>
            {bundle.outgoing.length === 0 ? (
              <p className="text-xs text-gray-400 italic text-center py-3">
                沒有借出的神獸 — 從神獸詳細頁的「🎁 借展給好友」開始
              </p>
            ) : (
              <div className="space-y-1.5">
                {bundle.outgoing.map(({ loan, counterpart }) => (
                  <LoanRow
                    key={loan.id}
                    speciesId={loan.creatureSpeciesId}
                    counterpart={counterpart}
                    counterpartLabel="借給"
                    returnsAt={loan.returnsAt}
                    actionLabel="📥 提前收回"
                    onAction={() =>
                      handleRecall(
                        loan.id,
                        getCreature(loan.creatureSpeciesId)?.name ?? loan.creatureSpeciesId
                      )
                    }
                  />
                ))}
              </div>
            )}
          </section>

          <hr className="border-gray-200" />

          {/* 我借入的 */}
          <section>
            <h4 className="text-xs font-bold text-gray-700 mb-2">
              📥 我借入的 ({bundle.incoming.length} / 3)
            </h4>
            {bundle.incoming.length === 0 ? (
              <p className="text-xs text-gray-400 italic text-center py-3">
                目前沒有借入的神獸 — 來自好友的借展會自動顯示在這裡
              </p>
            ) : (
              <div className="space-y-1.5">
                {bundle.incoming.map(({ loan, counterpart }) => (
                  <LoanRow
                    key={loan.id}
                    speciesId={loan.creatureSpeciesId}
                    counterpart={counterpart}
                    counterpartLabel="借自"
                    returnsAt={loan.returnsAt}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

// ─── 列 ───────────────────────────────────────────────────

function LoanRow({
  speciesId,
  counterpart,
  counterpartLabel,
  returnsAt,
  actionLabel,
  onAction
}: {
  speciesId: string;
  counterpart: { nickname: string; avatarCreatureId: string | null; userId: string } | null;
  counterpartLabel: string;
  returnsAt: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const c = getCreature(speciesId);
  const src = c?.art ? `/sprites/${speciesId}.png` : null;
  const returnsMs = new Date(returnsAt).getTime();
  const remaining = Math.max(0, returnsMs - Date.now());
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return (
    <div className="item-card px-3 py-2 flex items-center gap-2">
      <div className="w-12 h-12 rounded-lg overflow-hidden bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center shrink-0 ring-2 ring-amber-400">
        {src ? (
          <img src={src} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-2xl">{c?.emoji ?? '❓'}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold truncate">{c?.name ?? speciesId}</div>
        <div className="text-[11px] text-gray-600 flex items-center gap-1.5">
          <ProfileAvatar avatarCreatureId={counterpart?.avatarCreatureId ?? null} size={16} />
          <span className="truncate">
            {counterpartLabel} {counterpart?.nickname ?? '修仙者'}
          </span>
        </div>
        <div className="text-[10px] text-amber-700 mt-0.5">
          ⏰ 剩 {hours} 時 {minutes} 分 自動歸還
        </div>
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="shrink-0 px-2 py-1 text-[11px] font-bold bg-red-100 text-red-700 rounded-md border border-red-200"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
