import { useEffect, useState } from 'react';
import Modal from './Modal';
import { petRepo } from '@/repositories/petRepo';
import {
  spendCultivation,
  COLOR_VARIANT_LABEL,
  COLOR_VARIANT_ORDER,
  COLOR_VARIANT_CSS
} from '@/services';
import { useCultivation } from '@/hooks/useCultivation';
import { getCreature, getPetDisplayName } from '@/data/creatures';
import type { Pet, PetColorVariant } from '@/types';

interface ColorVariantModalProps {
  open: boolean;
  onClose: () => void;
  pet: Pet | null;
}

const COST = 300;

/**
 * 配色淬煉(階段 4B.2)。
 *
 *  - 300 修為 / 次,寫 pet.colorVariant(5 選 1)
 *  - Phaser PetSprite.applyData 會偵測 prev.colorVariant !== data.colorVariant
 *    自動重新套 tint,modal 關掉就看到神獸顏色變
 *  - 同神獸可以反覆換色,每次都要 -300(同色亦同;但 confirm 鈕對「相同色」disable
 *    避免誤點空消費)
 *  - 修為不足 → 按鈕禁用「修為不足(差 N)」
 */
export default function ColorVariantModal({ open, onClose, pet }: ColorVariantModalProps) {
  const [selected, setSelected] = useState<PetColorVariant>('default');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cultivation = useCultivation();
  const balance = cultivation.amount;
  const insufficient = balance < COST;

  const species = pet ? getCreature(pet.speciesId) : undefined;
  const displayName = pet ? getPetDisplayName(pet, species) : '';
  const current: PetColorVariant = pet?.colorVariant ?? 'default';
  const sameAsCurrent = selected === current;

  // 開啟 modal 時把預選值對齊當前配色
  useEffect(() => {
    if (open && pet) {
      setSelected(current);
      setError(null);
      setBusy(false);
    }
  }, [open, pet?.id, current]);

  async function handleConfirm() {
    if (busy || !pet || sameAsCurrent) return;
    if (insufficient) {
      setError(`修為不足,還差 ${COST - balance}`);
      return;
    }

    setBusy(true);
    setError(null);

    const r = await spendCultivation(
      COST,
      'recolor',
      `${displayName} 配色 ${COLOR_VARIANT_LABEL[selected]}`,
      pet.id
    );
    if (!r.success) {
      setBusy(false);
      setError(r.reason === 'insufficient' ? '修為不足' : '操作失敗,請稍後再試');
      return;
    }

    await petRepo.patch(pet.id, { colorVariant: selected });
    setBusy(false);
    onClose();
  }

  if (!pet) return null;

  const buttonLabel = sameAsCurrent
    ? '已是該配色'
    : insufficient
      ? `修為不足(差 ${COST - balance})`
      : busy
        ? '淬煉中⋯'
        : '確認換色';

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title="配色淬煉" hideClose={busy}>
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
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">當前配色</span>
            <span className="font-bold flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-3 rounded-full border border-gray-300"
                style={{ background: COLOR_VARIANT_CSS[current] }}
              />
              {COLOR_VARIANT_LABEL[current]}
            </span>
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-600 mb-2">選擇配色</p>
          <div className="grid grid-cols-2 gap-2">
            {COLOR_VARIANT_ORDER.map((v) => {
              const isSelected = selected === v;
              const isCurrent = current === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSelected(v)}
                  disabled={busy}
                  className={`relative item-card flex items-center gap-2 px-3 py-2 transition-all ${
                    isSelected
                      ? 'ring-2 ring-amber-500 bg-amber-50'
                      : 'hover:bg-white/60'
                  }`}
                >
                  <span
                    className="inline-block w-5 h-5 rounded-full border border-gray-300 shrink-0"
                    style={{ background: COLOR_VARIANT_CSS[v] }}
                  />
                  <span className="text-sm font-bold">{COLOR_VARIANT_LABEL[v]}</span>
                  {isCurrent && (
                    <span className="ml-auto text-[10px] text-emerald-600 font-bold">目前</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="data-card p-3 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">消耗</span>
            <span className="font-bold text-mythic-gold-500">💎 {COST} 修為</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">你目前持有</span>
            <span
              className={
                insufficient && !sameAsCurrent ? 'text-red-600 font-bold' : 'font-bold'
              }
            >
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
            disabled={busy || sameAsCurrent || insufficient}
            className="flex-1 bg-amber-500 text-white font-bold py-2.5 rounded-lg active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100"
          >
            {buttonLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
