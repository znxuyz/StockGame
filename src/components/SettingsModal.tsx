import { useEffect, useState } from 'react';
import Modal from './Modal';
import { db } from '@/db';
import type { Settings } from '@/types';
import { isCloudConfigured, supabase } from '@/lib/supabase';
import { useAuth, signOut } from '@/lib/auth';
import { cancelPendingPush } from '@/services/cloudSync';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onActionComplete: (message: string) => void;
  /** 登入鈕被按下,App 端開 SignInModal */
  onOpenSignIn: () => void;
}

/**
 * 設定彈窗 — 手續費折扣 + 最低手續費 + 玩家名稱。
 * 折扣以「幾折」為單位輸入（28 折 → 0.28），UI 上更直觀。
 */
export default function SettingsModal({
  open,
  onClose,
  settings,
  onActionComplete,
  onOpenSignIn
}: SettingsModalProps) {
  const [discountTenths, setDiscountTenths] = useState('10');
  const [minFee, setMinFee] = useState('20');
  const [playerName, setPlayerName] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const { session } = useAuth();
  const userEmail = session?.user?.email ?? null;

  /** 雙擊確認刪帳號:第一擊 → confirmingDelete = true 並 5 秒後自動 reset */
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  useEffect(() => {
    if (!confirmingDelete) return;
    const id = setTimeout(() => setConfirmingDelete(false), 5000);
    return () => clearTimeout(id);
  }, [confirmingDelete]);

  // modal 關掉時重置確認狀態,避免下次打開仍是 confirming 狀態
  useEffect(() => {
    if (!open) {
      setConfirmingDelete(false);
      setDeletingAccount(false);
    }
  }, [open]);

  async function handleSignOut() {
    cancelPendingPush();
    await signOut();
    onActionComplete('已登出雲端');
  }

  async function handleDeleteAccount() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    // 第二擊 → 真的刪
    setConfirmingDelete(false);
    setDeletingAccount(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('當前未登入,無法刪除');

      const res = await fetch('/api/auth/delete-account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }

      // 成功 → 取消任何未跑的 push、清本機 IndexedDB、登出、reload
      cancelPendingPush();
      await db.delete();
      await signOut().catch(() => {});
      window.location.reload();
    } catch (e) {
      setDeletingAccount(false);
      onActionComplete(`⚠️ 刪除帳號失敗:${e instanceof Error ? e.message : String(e)}`);
    }
  }

  useEffect(() => {
    if (!open) return;
    setDiscountTenths(String(settings.brokerageFeeDiscount * 10));
    setMinFee(String(settings.brokerageMinFee));
    setPlayerName(settings.playerName ?? '');
    setSoundEnabled(settings.soundEnabled);
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
        playerName: playerName.trim() || undefined,
        soundEnabled
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
    <Modal open={open} onClose={onClose} title="設定">
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">玩家名稱（可選）</label>
          <input
            type="text"
            placeholder="無名小卒"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            className="input-field"
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
            className="input-field"
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
            className="input-field"
          />
          <p className="text-xs text-gray-500 mt-1">台新預設 NT$20。</p>
        </div>

        <label className="flex items-center justify-between gap-3 py-1 cursor-pointer">
          <span className="text-sm text-gray-700">🎵 音效 / BGM</span>
          <input
            type="checkbox"
            checked={soundEnabled}
            onChange={(e) => setSoundEnabled(e.target.checked)}
            className="w-5 h-5 accent-emerald-500"
          />
        </label>

        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="w-full py-3 bg-emerald-500 text-white rounded-lg font-bold disabled:opacity-50"
        >
          儲存設定
        </button>

        {isCloudConfigured && (
          <>
            <hr className="my-4" />
            <div>
              <div className="text-xs text-gray-500 mb-2">☁ 雲端同步</div>
              {userEmail ? (
                <div className="space-y-2">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-xs">
                    <span className="text-emerald-700">已登入</span>
                    <span className="ml-2 text-gray-700 break-all">{userEmail}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={busy || deletingAccount}
                    className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg text-sm border border-gray-200 disabled:opacity-50"
                  >
                    登出
                  </button>
                  {/* 雙擊確認的刪帳號鈕(只在已登入時顯示) */}
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    disabled={busy || deletingAccount}
                    className={`w-full py-2 rounded-lg text-sm font-bold border disabled:opacity-50 transition-colors ${
                      confirmingDelete
                        ? 'bg-red-600 text-white border-red-700 animate-pulse'
                        : 'bg-red-100 text-red-700 border-red-200'
                    }`}
                  >
                    {deletingAccount
                      ? '刪除中⋯'
                      : confirmingDelete
                        ? '⚠️ 再點一次永久刪除帳號 + 雲端資料'
                        : '🗑️ 刪除帳號 + 雲端資料'}
                  </button>
                  {confirmingDelete && (
                    <p className="text-[11px] text-red-700 leading-relaxed">
                      此操作不可逆。雲端 + 本機資料都會永久消失。5 秒內不點就取消。
                    </p>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSignIn();
                  }}
                  className="w-full py-2 bg-amber-500 text-white rounded-lg text-sm font-bold"
                >
                  登入以同步資料
                </button>
              )}
            </div>
          </>
        )}

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
