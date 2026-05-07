import { useEffect, useState } from 'react';

/**
 * 引導使用者把 PWA 加到手機桌面。
 *
 * 兩條路徑:
 *  - Android Chrome / Edge:走 beforeinstallprompt event,顯示「立即安裝」按鈕,
 *    按下觸發瀏覽器原生 install dialog
 *  - iOS Safari:沒有 beforeinstallprompt event,改顯示「點分享 → 加到主畫面」
 *    的圖文提示
 *
 * 不打擾原則:
 *  - standalone 模式(已裝桌面)→ 完全不顯示
 *  - 使用者按 X 關掉 → localStorage 記下 7 天內不再顯示
 *  - App 啟動 30 秒後才浮出(不打擾首次操作)
 */

const DISMISS_KEY = 'install-prompt-dismissed-until';
const DISMISS_DAYS = 7;
const APPEAR_DELAY_MS = 30_000;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  // iOS Safari 用 navigator.standalone,其他瀏覽器用 display-mode
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOSSafari(): boolean {
  const ua = navigator.userAgent;
  // iPad 在 iPadOS 13+ 偽裝成 macOS,要看 maxTouchPoints
  const isIOS =
    /iPhone|iPod/.test(ua) ||
    (/Mac/.test(ua) && navigator.maxTouchPoints > 1);
  // 排除 Chrome / Firefox on iOS(它們不能裝桌面)
  const isSafari = /^((?!chrome|crios|fxios).)*safari/i.test(ua);
  return isIOS && isSafari;
}

function isDismissed(): boolean {
  const until = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
  return until > Date.now();
}

function setDismissed(): void {
  const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
  localStorage.setItem(DISMISS_KEY, String(until));
}

export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [iosMode, setIosMode] = useState(false);
  const [bipEvent, setBipEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone() || isDismissed()) return;

    let timeoutId: number | undefined;

    // Android / Chrome 路徑:beforeinstallprompt
    const onBip = (e: Event) => {
      e.preventDefault();
      setBipEvent(e as BeforeInstallPromptEvent);
      timeoutId = window.setTimeout(() => setShow(true), APPEAR_DELAY_MS);
    };
    window.addEventListener('beforeinstallprompt', onBip);

    // iOS Safari 路徑:沒 event 可訂,30 秒後直接判斷
    if (isIOSSafari()) {
      timeoutId = window.setTimeout(() => {
        setIosMode(true);
        setShow(true);
      }, APPEAR_DELAY_MS);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBip);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, []);

  if (!show) return null;

  const handleDismiss = () => {
    setDismissed();
    setShow(false);
  };

  const handleInstall = async () => {
    if (!bipEvent) return;
    await bipEvent.prompt();
    const choice = await bipEvent.userChoice;
    if (choice.outcome === 'accepted') {
      setShow(false); // 安裝成功不寫 dismiss(不需要,標記 standalone 後不會再顯示)
    } else {
      handleDismiss();
    }
  };

  return (
    <div className="fixed bottom-20 left-3 right-3 z-50 bg-white shadow-lg rounded-2xl border border-amber-200 p-3 text-sm flex items-start gap-3">
      <div className="text-2xl shrink-0" aria-hidden>📲</div>
      <div className="flex-1 min-w-0">
        {iosMode ? (
          <>
            <p className="font-bold text-gray-800">裝到桌面更順手</p>
            <p className="text-xs text-gray-600 mt-0.5">
              Safari 點下方 <span className="font-bold">「分享」</span> 鈕 → 拉到{' '}
              <span className="font-bold">「加入主畫面」</span>,就能像 app 一樣全螢幕開啟。
            </p>
          </>
        ) : (
          <>
            <p className="font-bold text-gray-800">裝到桌面更順手</p>
            <p className="text-xs text-gray-600 mt-0.5">全螢幕、離線可用、開啟更快。</p>
            <button
              type="button"
              onClick={handleInstall}
              className="mt-2 px-3 py-1 rounded-lg bg-amber-500 text-white text-xs font-bold active:scale-95 transition-transform"
            >
              立即安裝
            </button>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="關閉提示"
        className="text-gray-400 hover:text-gray-700 text-lg leading-none px-1 -mt-1"
      >
        ×
      </button>
    </div>
  );
}
