import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * PWA 自動更新提示。
 *
 * 流程:
 *  1. vite-plugin-pwa 註冊 Service Worker(`registerType: 'autoUpdate'`)。
 *  2. 每 30 分鐘呼叫 `swReg.update()` 檢查雲端有沒有新版 SW。
 *  3. 偵測到新版時 SW 會進 waiting 狀態,觸發 `onNeedRefresh` → 顯示提示。
 *  4. 玩家按「更新」→ `updateServiceWorker(true)`(觸發 skipWaiting + reload)。
 *     按「稍後」→ 不打擾,下次開 APP 又會跳。
 *
 * iOS Safari 特別處理:
 *  - iOS Safari 對 SW update 不一定買單,有時 `updateServiceWorker` 後仍拿舊版
 *  - 「強制重整」按鈕清掉所有 caches + unregister 全部 SW + reload
 *    當作給黏死在舊版的 iOS 玩家的最後手段
 *
 * 設計取捨:
 *  - skipWaiting=false(vite.config workbox 設定):不強制接管,等用戶按鈕
 *  - clientsClaim=true:新 SW activate 後接管所有 tab,避免雙版本並存
 *  - 30 分鐘 polling:不浪費流量(只 fetch sw.js),足夠日常使用節奏
 */
export default function PwaUpdatePrompt() {
  const [showPrompt, setShowPrompt] = useState(false);

  const {
    needRefresh: [, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onNeedRefresh() {
      setShowPrompt(true);
    },
    onOfflineReady() {
      console.log('[PWA] 已可離線使用');
    },
    onRegistered(swReg) {
      if (swReg) {
        // 每 30 分鐘檢查一次新版 SW(只 fetch sw.js,流量極低)
        setInterval(
          () => {
            swReg.update().catch(() => {
              /* offline 等 → 下次再試 */
            });
          },
          30 * 60 * 1000
        );
      }
    },
    onRegisterError(err) {
      console.warn('[PWA] SW 註冊失敗:', err);
    }
  });

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
