import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { bootProgress } from '@/services/bootProgress';

/**
 * PWA 自動更新提示 + 啟動階段 SW 狀態 gate(階段 6.Y 補)。
 *
 * 兩種模式由 `splashActive` 切換:
 *
 *  1. **啟動階段(`splashActive=true`)**:不顯示提示卡。
 *     - 若偵測到新版 SW(`onNeedRefresh`)→ 立刻 `updateServiceWorker(true)`
 *       觸發 skipWaiting + reload,**頁面重整後新 bundle 直接接手**,玩家
 *       不會在主畫面看到「新版可用」打擾
 *     - `bootProgress.setUpdating()` 讓 splash 顯示「正在更新到最新版本…」
 *       而非進度條(reload 前的 1-2 秒過渡)
 *     - 第一次 update check 結束(無論有無新版)→ `bootProgress.markStep
 *       ('pwa-ready')` unblock splash 進度
 *
 *  2. **遊戲中(`splashActive=false`)**:沿用原本 PrePrompt 行為。
 *     - 30 分鐘 polling 抓到新版 → 顯示提示卡,玩家點「更新」/「強制」/「稍後」
 *
 * iOS Safari 特別處理(沿用):
 *  - `updateServiceWorker` 後 iOS 偶爾仍拿舊版 → 「強制重整」按鈕清掉
 *    所有 caches + unregister SW + reload
 *
 * 設計取捨:
 *  - skipWaiting=false(vite.config workbox):一般 in-session 不強制接管
 *  - 但啟動階段 splash 在跑,**自動 apply 更新對玩家無感**,所以這時候 OK
 *    主動觸發接管 + reload
 *  - clientsClaim=true:新 SW activate 後接管所有 tab,避免雙版本並存
 *  - 30 分鐘 polling:不浪費流量(只 fetch sw.js),足夠日常使用節奏
 */
export default function PwaUpdatePrompt({ splashActive }: { splashActive: boolean }) {
  const [showPrompt, setShowPrompt] = useState(false);
  /** 用 ref 鎖最新 splashActive,給 `onNeedRefresh` callback 看到 */
  const splashActiveRef = useRef(splashActive);
  useEffect(() => {
    splashActiveRef.current = splashActive;
  }, [splashActive]);

  const {
    needRefresh: [, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onNeedRefresh() {
      if (splashActiveRef.current) {
        // 啟動階段:無感套用,reload 後新 bundle 接手
        bootProgress.setUpdating();
        void updateServiceWorker(true).catch((e) => {
          console.warn('[PWA] silent update failed during splash:', e);
          // fallback:讓 splash 還是 unblock,玩家進遊戲再看提示
          bootProgress.markStep('pwa-ready');
          setShowPrompt(true);
        });
        return;
      }
      // 遊戲中:沿用提示卡
      setShowPrompt(true);
    },
    onOfflineReady() {
      console.info('[PWA] 已可離線使用');
      bootProgress.markStep('pwa-ready');
    },
    onRegistered(swReg) {
      if (swReg) {
        // 第一次 update check:結果決定後才 unblock splash
        // (有新版 → onNeedRefresh 先觸發 → reload;無新版 → finally 跑 markStep)
        swReg
          .update()
          .catch(() => {
            /* offline / 4xx 等 → 下次再試 */
          })
          .finally(() => {
            bootProgress.markStep('pwa-ready');
          });
        // 每 30 分鐘檢查一次新版 SW(流量極低)
        setInterval(
          () => {
            swReg.update().catch(() => {
              /* offline 等 → 下次再試 */
            });
          },
          30 * 60 * 1000
        );
      } else {
        // 不支援 / dev 模式 → 直接 unblock,別卡住 splash
        bootProgress.markStep('pwa-ready');
      }
    },
    onRegisterError(err) {
      console.warn('[PWA] SW 註冊失敗:', err);
      bootProgress.markStep('pwa-ready');
    }
  });

  // **dev / 不支援 SW 的瀏覽器** safety net:3 秒沒任何 callback 觸發 →
  // 假設 SW 機制不運作,unblock splash 別卡住玩家
  useEffect(() => {
    const t = setTimeout(() => bootProgress.markStep('pwa-ready'), 3000);
    return () => clearTimeout(t);
  }, []);

  if (!showPrompt) return null;

  async function handleUpdate() {
    setShowPrompt(false);
    await updateServiceWorker(true);
  }

  function handleLater() {
    setNeedRefresh(false);
    setShowPrompt(false);
  }

  /** iOS Safari 黏死舊版時的最後手段:清 caches + unregister SW + reload */
  async function handleHardRefresh() {
    setShowPrompt(false);
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch (e) {
      console.warn('[PWA] 強制清快取失敗:', e);
    }
    window.location.reload();
  }

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[9999] glass-popup-update
                 px-4 py-3 rounded-2xl flex items-center gap-3 shadow-lg"
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        maxWidth: 'calc(100vw - 24px)'
      }}
      role="alert"
    >
      <span className="text-2xl select-none">✨</span>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm">新版本可用</div>
        <div className="text-xs opacity-70">點擊立即更新</div>
      </div>
      <div className="flex gap-1.5 shrink-0">
        <button
          type="button"
          onClick={handleUpdate}
          className="px-3 py-1.5 bg-amber-500 text-white rounded-lg font-bold text-sm
                     active:scale-95 transition-transform"
        >
          更新
        </button>
        <button
          type="button"
          onClick={handleHardRefresh}
          className="px-2 py-1.5 text-gray-500 text-xs underline"
          title="iOS Safari 拿到舊版時用這個清快取重整"
        >
          強制
        </button>
        <button
          type="button"
          onClick={handleLater}
          className="px-2 py-1.5 text-gray-500 text-xs"
        >
          稍後
        </button>
      </div>
    </div>
  );
}
