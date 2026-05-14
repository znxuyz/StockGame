import { useEffect, useState } from 'react';
import Modal from './Modal';
import { petRepo } from '@/repositories/petRepo';
import {
  spendCultivation,
  realmLabel,
  realmProgress,
  type SoulRealm,
  type PetStatus
} from '@/services';
import { useCultivation } from '@/hooks/useCultivation';
import { getCreature, getPetDisplayName } from '@/data/creatures';
import type { Pet } from '@/types';

interface BoostRealmModalProps {
  open: boolean;
  onClose: () => void;
  pet: Pet | null;
  /** 父層算好的當前 status(內含 monthsHeld / realm),null 表示資料還沒載完 */
  status: PetStatus | null;
}

const COST = 100;
const BOOST_DAYS = 30;

const REALM_EMOJI: Record<SoulRealm, string> = {
  fan: '⚪',
  ling: '🟡',
  yao: '🟣',
  shen: '⚫',
  sheng: '🔴',
  xian: '🌈'
};

/**
 * 境界催熟(階段 4A.3)。
 *
 *  - 100 修為 / 次,pet.boostedDays += 30(等同神獸提早 30 天出生)
 *  - 寫入後 PhaserMap 的 useEffect 會 re-run getPetStatus → 新 monthsHeld →
 *    新 realm,跟 lastRealmCheck 比 → 自動觸發升境慶祝動畫 + 200 修為獎勵
 *    (跟自然進度走同一條 codepath)
 *  - 同隻可連續催熟,直到 status.realm === 'xian'(仙境上限)
 *
 * Disabled:
 *  - 仙境神獸 → 「已達最高境界」
 *  - 修為不足 → 「修為不足(差 N)」
 */
export default function BoostRealmModal({ open, onClose, pet, status }: BoostRealmModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cultivation = useCultivation();
  const balance = cultivation.amount;
  const insufficient = balance < COST;
  const species = pet ? getCreature(pet.speciesId) : undefined;
  const displayName = pet ? getPetDisplayName(pet, species) : '';
  const atMax = status?.realm === 'xian';

  useEffect(() => {
    if (open) {
      setError(null);
      setBusy(false);
    }
  }, [open, pet?.id]);

  async function handleConfirm() {
    if (busy || !pet || !status || atMax) return;
    if (insufficient) {
      setError(`修為不足,還差 ${COST - balance}`);
      return;
    }

    setBusy(true);
    setError(null);

    // 先 spend(餘額不夠 race 也 fail-safe),再更新 boostedDays
    const r = await spendCultivation(
      COST,
      'realm_boost',
      `${displayName} 催熟 +${BOOST_DAYS} 天`,
      pet.id
    );
    if (!r.success) {
      setBusy(false);
      setError(r.reason === 'insufficient' ? '修為不足' : '操作失敗,請稍後再試');
      return;
    }

    const newBoosted = (pet.boostedDays ?? 0) + BOOST_DAYS;
    await petRepo.patch(pet.id, { boostedDays: newBoosted });

    setBusy(false);
    onClose();
    // 升境動畫由 PhaserMap useEffect 偵測 status.realm vs lastRealmCheck 自動觸發
  }

  if (!pet) return null;

  // 預覽:催熟後等同幾個月 + 是否會突破
  const newMonths = status ? status.monthsHeld + BOOST_DAYS / 30 : 0;
  const newProg = status ? realmProgress(newMonths) : null;
  const willBreakthrough =
    status && newProg && newProg.current !== status.realm;

  const buttonLabel = atMax
    ? '已達最高境界'
    : insufficient
      ? `修為不足(差 ${COST - balance})`
      : busy
        ? '催熟中⋯'
        : '確認催熟';

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title="境界催熟" hideClose={busy}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleConfirm();
        }}
        className="space-y-3 text-sm"
      >
        <div className="data-card p-3 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">神獸</span>
            <span className="font-bold">{displayName}</span>
          </div>
          {status && (
            <>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">當前</span>
                <span className="font-bold">
                  {REALM_EMOJI[status.realm]} {realmLabel(status.realm)}境
                  <span className="text-gray-500 font-normal ml-2">
                    持有 {status.monthsHeld.toFixed(1)} 個月
                  </span>
                </span>
              </div>
              {status.realm !== 'xian' &&
                (() => {
                  const prog = realmProgress(status.monthsHeld);
                  if (!prog.next) return null;
                  return (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">距 {realmLabel(prog.next)}境</span>
                      <span>還需 {prog.monthsToNext.toFixed(1)} 個月</span>
                    </div>
                  );
                })()}
            </>
          )}
        </div>

        {/* 催熟效果說明 */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs space-y-1 leading-relaxed">
          {atMax ? (
            <p className="text-gray-600">
              ✨ 神獸已達 <b>仙境</b>(最高境界),無法再催熟。
              <br />
              已超越時間,讓他自由翱翔吧。
            </p>
          ) : (
            <>
              <p>
                ✨ 加速 {BOOST_DAYS} 個天,等同持有 <b>{newMonths.toFixed(1)} 個月</b>
              </p>
              <p>✨ 立刻檢查境界突破,若達門檻會自動觸發升境慶祝動畫</p>
              {willBreakthrough && newProg && (
                <p className="text-amber-700 font-bold">
                  🎉 本次催熟會直接突破到 {realmLabel(newProg.current)}境!
                </p>
              )}
            </>
          )}
        </div>

        <div className="data-card p-3 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">消耗</span>
            <span className="font-bold text-mythic-gold-500">💎 {COST} 修為</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">你目前持有</span>
            <span className={insufficient && !atMax ? 'text-red-600 font-bold' : 'font-bold'}>
              💎 {balance} 修為
            </span>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 border border-gray-300 text-gray-600 font-bold py-2.5 rounded-lg active:scale-95 transition-transform disabled:opacity-50 bg-white/40"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={busy || atMax || insufficient}
            className="flex-1 bg-amber-500 text-white font-bold py-2.5 rounded-lg active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100"
          >
            {buttonLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
