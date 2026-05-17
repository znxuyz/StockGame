import { useState } from 'react';
import Modal from './Modal';
import { isCloudConfigured } from '@/lib/supabase';
import { forceSyncAllToCloud } from '@/repositories/syncAll';
import { clearProfileSyncDisabled } from '@/services/profileSyncService';

interface ToolsModalProps {
  open: boolean;
  onClose: () => void;
  onActionComplete: (message: string) => void;
  /** 階段 5G:Excel 批次匯入入口(可選) */
  onOpenExcelImport?: () => void;
}

/**
 * 工具彈窗(階段 6.X)。
 *
 * 把舊 SettingsModal 內混在一起的「進階 / 排錯 / 大批次」操作拉出來,
 * 從主畫面右上角刷新鈕下方的「🛠 工具」按鈕進入。SettingsModal 改回單純
 * 「玩家偏好設定」(玩家名、手續費、音效、HUD 主題、家園背景等)。
 *
 * 包含:
 *  - ☁⤴ 強制同步全部資料到雲端
 *  - 🔄 重新啟用好友同步(清 profileSync localStorage flag + reload)
 *  - 📊 重試大盤指數同步(清 marketIndex localStorage flag + reload)
 *  - 📊 Excel 批次匯入(可選,caller 沒傳就不顯示)
 *
 * 不包含「刪帳號 / 清快取 / 清除所有資料」— 那三個有「破壞性」屬性,
 * 仍留在 SettingsModal 內,跟「登出」放一起。
 */
export default function ToolsModal({
  open,
  onClose,
  onActionComplete,
  onOpenExcelImport
}: ToolsModalProps) {
  const [forceSyncing, setForceSyncing] = useState(false);

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

  function handleReenableFriendSync() {
    clearProfileSyncDisabled();
    onActionComplete('已重新啟用好友同步,3 秒後重新載入');
    setTimeout(() => window.location.reload(), 3000);
  }

  function handleRetryMarketIndex() {
    try {
      localStorage.removeItem('stockgame.marketIndex.disabled.v1');
      localStorage.removeItem('stockgame.marketIndex.disabled.v2');
      localStorage.removeItem('stockgame.marketIndex.disabled.v3');
    } catch {
      /* ignore */
    }
    onActionComplete('已重試大盤指數同步,3 秒後重新載入');
    setTimeout(() => window.location.reload(), 3000);
  }

  function handleExcelImport() {
    if (!onOpenExcelImport) return;
    onClose();
    onOpenExcelImport();
  }

  return (
    <Modal open={open} onClose={onClose} title="🛠 工具">
      <div className="space-y-3 font-zh">
        {/* 雲端強推 */}
        {isCloudConfigured && (
          <div>
            <button
              type="button"
              onClick={handleForceSync}
              disabled={forceSyncing}
              className="w-full py-2.5 bg-amber-100 text-amber-800 rounded-lg text-sm border border-amber-300 disabled:opacity-50 font-bold"
            >
              {forceSyncing ? '同步中⋯' : '☁⤴ 強制同步全部資料到雲端'}
            </button>
            <p className="text-[11px] text-gray-500 leading-relaxed mt-1">
              若發現雲端資料缺失(換裝置看不到神獸 / 修為),手動強推一次。
              跑完看瀏覽器 console 詳細報告。
            </p>
          </div>
        )}

        {/* 好友同步 */}
        {isCloudConfigured && (
          <div>
            <button
              type="button"
              onClick={handleReenableFriendSync}
              disabled={forceSyncing}
              className="w-full py-2.5 bg-sky-100 text-sky-800 rounded-lg text-sm border border-sky-300 disabled:opacity-50 font-bold"
            >
              🔄 重新啟用好友同步
            </button>
            <p className="text-[11px] text-gray-500 leading-relaxed mt-1">
              僅在你部署 supabase/migrations/20260516_stage4b_creature_summary_repair.sql
              後才需要點(本機因 schema 不一致已停用好友 profileSync)。
            </p>
          </div>
        )}

        {/* 大盤指數重試 */}
        {isCloudConfigured && (
          <div>
            <button
              type="button"
              onClick={handleRetryMarketIndex}
              disabled={forceSyncing}
              className="w-full py-2.5 bg-sky-100 text-sky-800 rounded-lg text-sm border border-sky-300 disabled:opacity-50 font-bold"
            >
              📊 重試大盤指數同步
            </button>
            <p className="text-[11px] text-gray-500 leading-relaxed mt-1">
              對比 tab「加權指數」顯示 -、Alpha 不出來時點此。
              清掉 24h 失敗 flag,重整後再試一次 TWSE OpenAPI proxy。
            </p>
          </div>
        )}

        {/* Excel 匯入 */}
        {onOpenExcelImport && (
          <div>
            <button
              type="button"
              onClick={handleExcelImport}
              className="w-full flex items-center justify-between py-2.5 px-3 rounded-lg border border-gray-200 bg-white/40 active:scale-[0.99] transition-transform"
            >
              <span className="text-sm text-gray-700 font-bold">📊 Excel 批次匯入</span>
              <span className="text-xs text-gray-500">一次匯入多筆歷史交易 ›</span>
            </button>
            <p className="text-[11px] text-gray-500 leading-relaxed mt-1">
              從 Excel / CSV 一次匯入歷史交易,系統會重新計算累積報酬率 / 月度損益等指標。
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
