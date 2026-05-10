import { useEffect, useState } from 'react';
import Modal from './Modal';
import { db } from '@/db';
import { spendCultivation } from '@/services';
import { useCultivation } from '@/hooks/useCultivation';
import { getCreature } from '@/data/creatures';
import type { Pet } from '@/types';

interface RenameModalProps {
  open: boolean;
  onClose: () => void;
  pet: Pet | null;
  /** 改名成功後 caller 可選實作(顯示 toast 等),不傳就只關 modal */
  onSuccess?: (newName: string) => void;
}

const COST = 50;
const MIN_LEN = 1;
const MAX_LEN = 10;
/** 限中文(漢字)/ 英文 / 數字。不允許空白、emoji、標點符號(避免顯示破版) */
const VALID_PATTERN = /^[\p{Script=Han}A-Za-z0-9]+$/u;

/**
 * 神獸改名儀式(階段 4A.2)。
 *
 *  - 50 修為 / 次,寫入 pet.customName + cultivationLog
 *  - 同隻神獸可以多次改名(每次都要花 50)
 *  - 驗證:1-10 字元,中英數字限定,不能跟原名(species.name)相同
 *  - 修為不足 → 確認鈕禁用 + 顯示「修為不足,還差 N」
 *
 * 流程:
 *   1. 用戶輸入名稱 → 即時驗證(輸入時 inline error)
 *   2. 按確認 → spendCultivation(50, 'rename', `改名為「X」`, petId)
 *   3. 成功 → db.pets.update(id, { customName }) → onSuccess() → 關 modal
 *   4. 失敗(insufficient)→ inline error,不關 modal
 */
export default function RenameModal({ open, onClose, pet, onSuccess }: RenameModalProps) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cultivation = useCultivation();
  const balance = cultivation.amount;
  const insufficient = balance < COST;
  const species = pet ? getCreature(pet.speciesId) : undefined;
  const originalName = species?.name ?? '神獸';

  // 開啟 modal 時把現有 customName 帶進輸入框,沒則空白
  useEffect(() => {
    if (open && pet) {
      setName(pet.customName?.trim() ?? '');
      setError(null);
      setBusy(false);
    }
  }, [open, pet?.id]);

  function validate(candidate: string): string | null {
    const trimmed = candidate.trim();
    if (trimmed.length < MIN_LEN) return '名稱不能空白';
    if (trimmed.length > MAX_LEN) return `名稱最多 ${MAX_LEN} 個字元`;
    if (!VALID_PATTERN.test(trimmed)) return '只能用中文 / 英文 / 數字';
    if (trimmed === originalName) return '新名稱不能跟原名相同';
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !pet) return;

    const trimmed = name.trim();
    const v = validate(trimmed);
    if (v) {
      setError(v);
      return;
    }
    if (insufficient) {
      setError(`修為不足,還差 ${COST - balance}`);
      return;
    }

    setBusy(true);
    setError(null);

    const r = await spendCultivation(
      COST,
      'rename',
      `改名為「${trimmed}」`,
      pet.id
    );
    if (!r.success) {
      setBusy(false);
      setError(r.reason === 'insufficient' ? '修為不足' : '操作失敗,請稍後再試');
      return;
    }

    await db.pets.update(pet.id, { customName: trimmed });
    setBusy(false);
    onSuccess?.(trimmed);
    onClose();
  }

  if (!pet) return null;

  // 即時驗證:輸入中即時顯示提示(不阻擋送出,送出時還會再 validate 一次)
  const trimmed = name.trim();
  const liveError = trimmed && trimmed !== pet.customName ? validate(trimmed) : null;

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title="改名儀式" hideClose={busy}>
      <form onSubmit={handleSubmit} className="space-y-3 text-sm">
        <p className="text-gray-600 leading-relaxed">為你的神獸取一個獨特的名字。</p>

        <div className="data-card p-3 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">神獸</span>
            <span className="font-bold">{pet.code}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">原名</span>
            <span>{originalName}(預設名稱)</span>
          </div>
        </div>

        <label className="block">
          <span className="text-xs text-gray-600 mb-1 block">新名稱</span>
          <input
            type="text"
            required
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder="例:小朱朱"
            maxLength={MAX_LEN}
            className="input-field w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-amber-300 focus:outline-none"
            disabled={busy}
          />
          <p className={`text-[11px] mt-1 ${liveError ? 'text-red-600' : 'text-gray-400'}`}>
            {liveError ?? `字數限制:${MIN_LEN}-${MAX_LEN} 個字元(中英數字)`}
          </p>
        </label>

        <div className="data-card p-3 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">消耗</span>
            <span className="font-bold text-mythic-gold-500">💎 {COST} 修為</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">你目前持有</span>
            <span className={insufficient ? 'text-red-600 font-bold' : 'font-bold'}>
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
            disabled={busy || insufficient || !!liveError || !trimmed}
            className="flex-1 bg-amber-500 text-white font-bold py-2.5 rounded-lg active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100"
          >
            {busy
              ? '改名中⋯'
              : insufficient
                ? `修為不足(差 ${COST - balance})`
                : '確認改名'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
