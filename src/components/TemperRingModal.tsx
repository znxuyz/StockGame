import { useEffect, useState } from 'react';
import Modal from './Modal';
import { db } from '@/db';
import {
  spendCultivation,
  effectLabel,
  upgradeEffect,
  type PetStatus,
  type RingEffect
} from '@/services';
import { useCultivation } from '@/hooks/useCultivation';
import { getCreature, getPetDisplayName } from '@/data/creatures';
import { formatPercent } from '@/utils';
import type { Pet } from '@/types';

interface TemperRingModalProps {
  open: boolean;
  onClose: () => void;
  pet: Pet | null;
  /** 父層算好的當前 status(內含 naturalEffect / returnRate),null 表示資料還沒載完 */
  status: PetStatus | null;
}

const COST = 500;
const DURATION_DAYS = 7;
const MS_PER_DAY = 86_400_000;

const EFFECT_EMOJI: Record<RingEffect, string> = {
  dim: '💤',
  normal: '⚪',
  pulsing: '💓',
  rotating: '🔄',
  erupting: '✨'
};

/**
 * 魂環淬煉(階段 4A.4)。
 *
 *  - 500 修為 / 次,pet.effectBoostUntil = now + 7 天
 *  - getPetStatus 在 effectBoostUntil > now 時把 naturalEffect 升一階,
 *    傳給 SoulRingRenderer 變淬煉後的視覺效果
 *  - 7 天後 effectBoostUntil <= now,自動回到自然狀態(沒倒數機制,純比較時間)
 *  - 重複淬煉 = 重設新的 7 天到期(舊到期被覆蓋,不疊加)
 *  - naturalEffect === 'erupting' 已最高 → 淬煉無效,按鈕禁用
 *
 * cultivation reward:
 *  - PhaserMap 用 naturalEffect 比對 lastEffectCheck,所以淬煉本身不會
 *    觸發 effect_unlock 修為獎勵(避免玩家花 500 拿回 +50)
 */
export default function TemperRingModal({ open, onClose, pet, status }: TemperRingModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cultivation = useCultivation();
  const balance = cultivation.amount;
  const insufficient = balance < COST;

  const species = pet ? getCreature(pet.speciesId) : undefined;
  const displayName = pet ? getPetDisplayName(pet, species) : '';

  const naturalEff = status?.naturalEffect ?? 'normal';
  const upgradedEff = upgradeEffect(naturalEff);
  const atMax = naturalEff === 'erupting';

  const now = Date.now();
  const currentlyTempering = pet?.effectBoostUntil != null && pet.effectBoostUntil > now;
  const daysRemaining = currentlyTempering
    ? Math.ceil((pet!.effectBoostUntil! - now) / MS_PER_DAY)
    : 0;

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

    const r = await spendCultivation(
      COST,
      'effect_boost',
      `${displayName} 魂環淬煉 ${DURATION_DAYS} 天`,
      pet.id
    );
    if (!r.success) {
      setBusy(false);
      setError(r.reason === 'insufficient' ? '修為不足' : '操作失敗,請稍後再試');
      return;
    }

    const expiresAt = now + DURATION_DAYS * MS_PER_DAY;
    await db.pets.update(pet.id, { effectBoostUntil: expiresAt });

    setBusy(false);
    onClose();
  }

  if (!pet) return null;

  const buttonLabel = atMax
    ? '已是最高特效'
    : insufficient
      ? `修為不足(差 ${COST - balance})`
      : busy
        ? '淬煉中⋯'
        : currentlyTempering
          ? '重新淬煉(重置 7 天)'
          : '確認淬煉';

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title="魂環淬煉" hideClose={busy}>
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
                <span className="text-gray-500">當前報酬率</span>
                <span
                  className={
                    status.returnRate >= 0 ? 'text-tw-up font-bold' : 'text-tw-down font-bold'
                  }
                >
                  {formatPercent(status.returnRate)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">當前特效</span>
                <span className="font-bold">
                  {EFFECT_EMOJI[naturalEff]} {effectLabel(naturalEff)}
                </span>
              </div>
              {currentlyTempering && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">淬煉狀態</span>
                  <span className="font-bold text-amber-600">
                    淬煉中(剩 {daysRemaining} 天)
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs space-y-1 leading-relaxed">
          {atMax ? (
            <p className="text-gray-600">
              ✨ 神獸魂環已達 <b>噴光</b>(最高特效),淬煉無法再升級。
              <br />
              這已是金光萬丈的最終形態。
            </p>
          ) : (
            <>
              <p>
                ✨ 強制升級魂環特效一階:
                <span className="ml-1 font-bold">
                  {EFFECT_EMOJI[naturalEff]} {effectLabel(naturalEff)} →{' '}
                  {EFFECT_EMOJI[upgradedEff]} {effectLabel(upgradedEff)}
                </span>
              </p>
              <p>
                ✨ 持續 <b>{DURATION_DAYS} 天</b>
                {currentlyTempering && '(舊到期被覆蓋,不疊加)'}
              </p>
              <p>✨ 7 天後自動回到自然狀態(由實際報酬率決定)</p>
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
