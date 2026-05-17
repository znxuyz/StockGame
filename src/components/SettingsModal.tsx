import { useEffect, useState } from 'react';
import Modal from './Modal';
import { db } from '@/db';
import { settingsRepo } from '@/repositories/settingsRepo';
import type { Settings } from '@/types';
import { isCloudConfigured, supabase } from '@/lib/supabase';
import { useAuth, signOut } from '@/lib/auth';
import HudThemeSection from './HudThemeSection';
import BackgroundSection from './BackgroundSection';
import { BACKGROUNDS } from '@/services';
import { forceSyncAllToCloud } from '@/repositories/syncAll';
import { clearProfileSyncDisabled } from '@/services/profileSyncService';

/**
 * 設定彈窗 sub-view 切換。
 * 'main' = 設定主頁(玩家名、手續費、雲端同步等);
 * 'hudTheme' / 'background' 是子頁。
 *
 * 不用 nested Modal 因為 iOS Safari 的 backdrop-filter 包含區塊 bug
 * 會讓 nested .glass-popup 鎖進 outer popup 範圍,出現「子頁底部沒貼齊
 * BottomBar」(同 BestiaryPetDetail 之前的 bug)。改 state 切換,sub-view
 * 直接取代 main 渲染在同一個 .glass-popup-content 內。
 */
type SubView = 'main' | 'hudTheme' | 'background';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onActionComplete: (message: string) => void;
  /** 登入鈕被按下,App 端開 SignInModal */
  onOpenSignIn: () => void;
  /** 階段 5C:點「📜 月度回顧」入口,關掉設定讓 App 開 MonthlyReviewModal */
  onOpenMonthlyReview?: () => void;
  /** 階段 5E:點「🔒 隱私設定」入口,關掉設定讓 App 開 PrivacySettingsModal */
  onOpenPrivacy?: () => void;
  /** 階段 5G:點「📊 Excel 批次匯入」入口 */
  onOpenExcelImport?: () => void;
}

/**
 * 設定彈窗 — 手續費折扣 + 最低手續費 + 音效 + HUD 主題 + 家園背景 + 月度回顧 + 雲端同步。
 */
export default function SettingsModal({
  open,
  onClose,
  settings,
  onActionComplete,
  onOpenSignIn,
  onOpenMonthlyReview,
  onOpenPrivacy,
  onOpenExcelImport
}: SettingsModalProps) {
  const [discountTenths, setDiscountTenths] = useState('10');
  const [minFee, setMinFee] = useState('20');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const { session } = useAuth();
  const userEmail = session?.user?.email ?? null;

  /** 雙擊確認刪帳號:第一擊 → confirmingDelete = true 並 5 秒後自動 reset */
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  /** 強制同步進行中(防重複點) */
  const [forceSyncing, setForceSyncing] = useState(false);
  /** 雙擊確認清快取 */
  const [confirmingClearCache, setConfirmingClearCache] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  useEffect(() => {
    if (!confirmingClearCache) return;
    const id = setTimeout(() => setConfirmingClearCache(false), 5000);
    return () => clearTimeout(id);
  }, [confirmingClearCache]);
  /** 子頁切換(取代之前的 nested Modal) */
  const [subView, setSubView] = useState<SubView>('main');
  useEffect(() => {
    if (!confirmingDelete) return;
    const id = setTimeout(() => setConfirmingDelete(false), 5000);
    return () => clearTimeout(id);
  }, [confirmingDelete]);

  // modal 關掉時重置確認狀態 + sub-view,避免下次打開仍是 confirming / 子頁狀態
  useEffect(() => {
    if (!open) {
      setConfirmingDelete(false);
      setDeletingAccount(false);
      setConfirmingClearCache(false);
      setClearingCache(false);
      setSubView('main');
    }
  }, [open]);

  async function handleSignOut() {
    await signOut();
    onActionComplete('已登出雲端');
  }

  /**
   * 階段 6:清除本機 Dexie 快取 + 重新整理。
   *
   * 「雲端為主、本機只是快取」原則的萬用解 — 使用者發現本機資料異常
   * (顯示對不上 / Dexie 卡住)時點此,把本機 IndexedDB 整個刪掉,reload
   * 後 App boot 路徑會走 seedIfEmpty → forceFetchAllFromCloud →
   * ensureStocksForHoldings → 完整重建 UI。
   *
   * 雙擊確認(同刪帳號模式),5 秒沒按取消。
   *
   * 副作用:本機-only 資料會一起被清(可接受):
   *  - cultivationLog 歷史時間軸(雲端 schema 未對齊不上雲)
   *  - lastRealmCheck / lastEffectCheck UI 防抖旗標(rebuild 後不會誤觸動畫)
   *  - prices / snapshots / historicalPrices(可重新抓 / 重算)
   *  - localStorage 內 pendingSync flag / profileSync disabled flag 一起清
   */
  async function handleClearCache() {
    if (!confirmingClearCache) {
      setConfirmingClearCache(true);
      return;
    }
    setConfirmingClearCache(false);
    setClearingCache(true);
    try {
      await db.delete();
      // 順手把本檔範圍內的 localStorage flag 也清,讓 boot 全新狀態
      try {
        localStorage.removeItem('stockgame.pendingSync.v1');
        localStorage.removeItem('stockgame.profileSync.disabled.v1');
      } catch {
        /* ignore */
      }
      // 不 toast(reload 太快看不到),直接 reload 讓 boot path 接手
      window.location.reload();
    } catch (e) {
      setClearingCache(false);
      onActionComplete(
        `⚠️ 清快取失敗:${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  /**
   * 階段 4-B 緊急救援:把本機所有 Repository 的資料**強推**到雲端,
   * 修復 self-heal 靜默失敗造成的雲端資料缺失。
   * 跑完看 console「[forceSync]」log 詳細逐 table 報告。
   */
  async function handleForceSync() {
    if (forceSyncing) return;
    setForceSyncing(true);
    try {
      const result = await forceSyncAllToCloud();
      if (!result.userId) {
        onActionComplete('⚠️ 強制同步失敗:未登入雲端');
        return;
      }
      if (result.ok) {
        onActionComplete(
          `☁ 強制同步完成:推 ${result.totalSucceeded}/${result.totalAttempted} 筆(${result.durationMs}ms)`
        );
      } else {
        onActionComplete(
          `⚠️ 強制同步部分失敗:成功 ${result.totalSucceeded}/${result.totalAttempted},失敗 ${result.totalFailed} 筆(看 console)`
        );
      }
    } catch (e) {
      console.error('[forceSync] handler threw:', e);
      onActionComplete(
        `⚠️ 強制同步出錯:${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setForceSyncing(false);
    }
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

      // 成功 → 清本機 IndexedDB、登出、reload
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
        soundEnabled
      };
      try {
        await settingsRepo.put(next);
        onActionComplete('⚙ 設定已儲存');
        onClose();
      } catch (e) {
        console.error('[SettingsModal] save failed:', e);
        onActionComplete('⚠️ 設定同步失敗,本機已還原');
      }
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

  // 子頁:沒有自己的 Modal 殼,直接 render 進 SettingsModal 的 .glass-popup-content
  if (subView === 'hudTheme') {
    return (
      <Modal open={open} onClose={onClose} title="設定">
        <HudThemeSection onBack={() => setSubView('main')} />
      </Modal>
    );
  }
  if (subView === 'background') {
    return (
      <Modal open={open} onClose={onClose} title="設定">
        <BackgroundSection onBack={() => setSubView('main')} />
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="設定">
      <div className="space-y-3">
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

        {/* 階段 4B.3:HUD 主題色入口。state 切換到 'hudTheme' sub-view */}
        <button
          type="button"
          onClick={() => setSubView('hudTheme')}
          className="w-full flex items-center justify-between py-2 px-3 rounded-lg border border-gray-200 bg-white/40 active:scale-[0.99] transition-transform"
        >
          <span className="text-sm text-gray-700">🎨 HUD 主題色</span>
          <span className="text-xs text-gray-500">
            {hudThemeLabel(settings.hudTheme ?? 'default')} ›
          </span>
        </button>

        {/* 階段 4B.4:家園背景入口。state 切換到 'background' sub-view */}
        <button
          type="button"
          onClick={() => setSubView('background')}
          className="w-full flex items-center justify-between py-2 px-3 rounded-lg border border-gray-200 bg-white/40 active:scale-[0.99] transition-transform"
        >
          <span className="text-sm text-gray-700">🖼️ 家園背景</span>
          <span className="text-xs text-gray-500">
            {bgLabel(settings.currentBackground ?? 'default')} ›
          </span>
        </button>

        {/* 階段 5C:月度回顧入口。關掉設定彈窗讓 App 開 MonthlyReviewModal */}
        {onOpenMonthlyReview && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenMonthlyReview();
            }}
            className="w-full flex items-center justify-between py-2 px-3 rounded-lg border border-gray-200 bg-white/40 active:scale-[0.99] transition-transform"
          >
            <span className="text-sm text-gray-700">📜 月度回顧</span>
            <span className="text-xs text-gray-500">查看每月修煉錄 ›</span>
          </button>
        )}

        {/* 階段 5E:隱私設定入口 */}
        {onOpenPrivacy && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenPrivacy();
            }}
            className="w-full flex items-center justify-between py-2 px-3 rounded-lg border border-gray-200 bg-white/40 active:scale-[0.99] transition-transform"
          >
            <span className="text-sm text-gray-700">🔒 隱私設定</span>
            <span className="text-xs text-gray-500">持倉 / 排行榜 / 動態分享 ›</span>
          </button>
        )}

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
                  {/* 階段 4-B 緊急救援:強制同步本機資料到雲端
                      (self-heal 失敗時手動觸發,跑完看 console [forceSync] log) */}
                  <button
                    type="button"
                    onClick={handleForceSync}
                    disabled={busy || deletingAccount || forceSyncing}
                    className="w-full py-2 bg-amber-100 text-amber-800 rounded-lg text-sm border border-amber-300 disabled:opacity-50"
                  >
                    {forceSyncing ? '同步中⋯' : '☁⤴ 強制同步全部資料到雲端'}
                  </button>
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    若發現雲端資料缺失(換裝置看不到神獸 / 修為),
                    手動強推一次。跑完看瀏覽器 console 詳細報告。
                  </p>
                  {/* 階段 4-B:部署 user_creature_summary 修復 SQL 後,
                      點此按鈕清掉 localStorage flag 並重新整理,啟用好友同步 */}
                  <button
                    type="button"
                    onClick={() => {
                      clearProfileSyncDisabled();
                      onActionComplete('已重新啟用好友同步,3 秒後重新載入');
                      setTimeout(() => window.location.reload(), 3000);
                    }}
                    disabled={busy || deletingAccount || forceSyncing}
                    className="w-full py-2 bg-sky-100 text-sky-800 rounded-lg text-sm border border-sky-300 disabled:opacity-50"
                  >
                    🔄 重新啟用好友同步
                  </button>
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    僅在你部署 supabase/migrations/20260516_stage4b_creature_summary_repair.sql
                    後才需要點(本機因 schema 不一致已停用好友 profileSync)。
                  </p>
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

        {/* 階段 5G:Excel 批次匯入(放在「清除所有資料」之上) */}
        {onOpenExcelImport && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenExcelImport();
            }}
            className="w-full flex items-center justify-between py-2 px-3 rounded-lg border border-gray-200 bg-white/40 active:scale-[0.99] transition-transform mb-2"
          >
            <span className="text-sm text-gray-700">📊 Excel 批次匯入</span>
            <span className="text-xs text-gray-500">一次匯入多筆歷史交易 ›</span>
          </button>
        )}

        {/* 階段 6:清除本機 IndexedDB 快取(雙擊確認)。
            雲端資料不動,reload 後從雲端重新拉。萬用 self-service 解。 */}
        {isCloudConfigured && (
          <>
            <button
              type="button"
              onClick={handleClearCache}
              disabled={busy || clearingCache}
              className={`w-full py-2 rounded-lg text-sm border disabled:opacity-50 transition-colors ${
                confirmingClearCache
                  ? 'bg-amber-500 text-white border-amber-600 animate-pulse font-bold'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              {clearingCache
                ? '清理中,即將重新載入⋯'
                : confirmingClearCache
                  ? '⚠️ 再點一次:清除本機快取並重新載入'
                  : '🧹 清除本機快取(資料保留雲端)'}
            </button>
            <p className="text-[11px] text-gray-500 leading-relaxed mt-1 mb-2">
              清完後從雲端重新拉。神獸 / 持倉 / 交易 / 成就 / 修為餘額都會回來。
              修為時間軸(本機獨有)會清空,之後再 earn 重新累積。
            </p>
          </>
        )}

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

/** 設定頁右側顯示「米粉 ›」用,跟 HudThemeModal 內的 THEMES 表保持一致 */
function hudThemeLabel(id: string): string {
  switch (id) {
    case 'jade':
      return '玉藍';
    case 'purple':
      return '紫金';
    case 'red':
      return '朱紅';
    default:
      return '米粉';
  }
}

/** 設定頁右側顯示「粉紅雲紋 ›」用,從 BACKGROUNDS catalog 拿 label */
function bgLabel(id: string): string {
  return BACKGROUNDS.find((b) => b.id === id)?.label ?? '粉紅雲紋';
}
