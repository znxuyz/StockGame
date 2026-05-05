import { useEffect, useState } from 'react';
import Modal from './Modal';
import { db } from '@/db';
import type { Settings } from '@/types';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onActionComplete: (message: string) => void;
}

/**
 * 設定彈窗 — 手續費折扣 + 最低手續費 + 玩家名稱。
 * 折扣以「幾折」為單位輸入（28 折 → 0.28），UI 上更直觀。
 */
export default function SettingsModal({
  open,
  onClose,
  settings,
  onActionComplete
}: SettingsModalProps) {
  const [discountTenths, setDiscountTenths] = useState('10');
  const [minFee, setMinFee] = useState('20');
  const [playerName, setPlayerName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDiscountTenths(String(settings.brokerageFeeDiscount * 10));
    setMinFee(String(settings.brokerageMinFee));
    setPlayerName(settings.playerName ?? '');
  }, [open, settings]);

  async function handleSave() {
    setBusy(true);
    try {
      const tenths = Number(discountTenths);
      const safeTenths = Number.isFinite(tenths) && tenths > 0 && tenths <= 10 ? tenths : 10;
      const safeMinFee = Math.max(0, Math.floor(Number(minFee) || 0));
      const next: Settings = {
        ...settings,
        brokerageFeeDiscount: safeTenths / 10,
        brokerageMinFee: safeMinFee,
        playerName: playerName.trim() || undefined
      };
      await db.settings.put(next);
      onActionComplete('⚙ 設定已儲存');
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function handleResetAll() {
    if (!confirm('確定要清除所有資料嗎？這個動作無法復原。')) return;
    setBusy(true);
    try {
      await db.delete();
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="設定" variant="center">
      <div className="p-4 space-y-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">玩家名稱（可選）</label>
          <input
            type="text"
            placeholder="無名小卒"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            className="w-full px-3 py-2 rounded border border-gray-300 text-base"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">
            手續費折扣（幾折，1-10）
          </label>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min="1"
            max="10"
            value={discountTenths}
            onChange={(e) => setDiscountTenths(e.target.value)}
            className="w-full px-3 py-2 rounded border border-gray-300 text-base"
          />
          <p className="text-xs text-gray-500 mt-1">
            台新證券預設 10 折（無折扣）。電子下單 6.5 折請填 6.5、5 折填 5、28 折填 2.8。
          </p>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">最低手續費（NT$）</label>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={minFee}
            onChange={(e) => setMinFee(e.target.value)}
            className="w-full px-3 py-2 rounded border border-gray-300 text-base"
          />
          <p className="text-xs text-gray-500 mt-1">台新預設 NT$20。</p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="w-full py-3 bg-emerald-500 text-white rounded-lg font-bold disabled:opacity-50"
        >
          儲存設定
        </button>

        <hr className="my-4" />

        <button
          type="button"
          onClick={handleResetAll}
          disabled={busy}
          className="w-full py-2 bg-red-100 text-red-700 rounded-lg text-sm border border-red-200 disabled:opacity-50"
        >
          清除所有資料
        </button>
      </div>
    </Modal>
  );
}
