import { useEffect, useRef, useState } from 'react';
import { useBootProgress } from '@/services/bootProgress';

/**
 * 全螢幕封面 splash(階段 6.Y)。
 *
 * 流程:
 *  1. App mount 立刻 render(z-[9000] 蓋住底下任何 UI,避免「閃舊畫面」)
 *  2. 訂閱 `bootProgress` — 6 個 step 完成情況反映進度條
 *  3. progress=100 且 ready=true → 進度條換成「點擊任意處開始遊戲」
 *  4. 玩家點任意處 → onStart() → App 把 splash 從 tree 拿掉,fade out 200ms
 *  5. PWA 偵測新版進入「更新中」階段 → 顯示「正在更新到最新版本…」(不可點擊)
 *     reload 後 splash 重新跑一輪,新 bundle 直接接手
 *
 * 封面圖 `public/cover.png`(816×1456 直式),`object-cover` 全螢幕填滿
 * (寬螢幕 / 橫向時兩側裁掉)。底部 1/4 區域漸層黑色遮罩 + 進度條 / 文字,
 * 確保任何封面色調下都看得清楚。
 */

interface Props {
  /** 玩家點擊「點擊任意處開始遊戲」時呼叫 */
  onStart: () => void;
}

export default function SplashScreen({ onStart }: Props) {
  const { progress, ready, updating } = useBootProgress();
  const [fadingOut, setFadingOut] = useState(false);
  const startedRef = useRef(false);

  /** 點擊處理:必須 ready 且不在更新中才生效;觸發 fade-out 動畫 */
  function handleClick() {
    if (!ready || updating || fadingOut) return;
    if (startedRef.current) return;
    startedRef.current = true;
    setFadingOut(true);
  }

  /** fade-out 動畫結束後通知父層拿掉 splash */
  useEffect(() => {
    if (!fadingOut) return;
    const timer = setTimeout(() => onStart(), 260);
    return () => clearTimeout(timer);
  }, [fadingOut, onStart]);

  const showStartText = ready && !updating;

  return (
    <div
      className="fixed z-[9000] bg-black select-none cursor-pointer overflow-hidden"
      style={{
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        width: '100vw',
        height: '100dvh',
        minHeight: '100vh',
        opacity: fadingOut ? 0 : 1,
        transition: 'opacity 240ms ease-out',
        pointerEvents: fadingOut ? 'none' : 'auto'
      }}
      onClick={handleClick}
      role="button"
      aria-label={showStartText ? '點擊開始遊戲' : '載入中'}
    >
      {/* 封面圖滿版填 viewport。在正確安裝的 PWA(black-translucent + viewport-fit
          =cover)會直接延伸進瀏海 / home indicator 區,玩家看到的就是滿版封面。
          舊安裝 PWA / Safari 等 iOS 沒延伸的情境下,封面圖只填可見 viewport,
          上方瀏海區用動態 theme-color = 封面頂緣實際 RGB 顏色 fallback(`App.tsx`
          載入時用 canvas 取樣),視覺接近封面延續到瀏海。
          object-position 'center top' 鎖封面源圖頂緣,確保延伸時上半部是天空。 */}
      <img
        src="/cover.png"
        alt=""
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        style={{ objectPosition: 'center top' }}
        draggable={false}
      />

      {/* 底部漸層遮罩:確保進度條 / 文字在任何封面色調下都看得清楚 */}
      <div
        className="absolute left-0 right-0 bottom-0 pointer-events-none"
        style={{
          height: '32%',
          background:
            'linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.35) 50%, rgba(0,0,0,0) 100%)'
        }}
      />

      {/* 進度條 / start 文字 區塊 — bottom 含 safe-area-inset-bottom 避開 home indicator */}
      <div
        className="absolute left-0 right-0 px-8"
        style={{
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + clamp(32px, 8vh, 64px))',
          paddingLeft: 'calc(2rem + env(safe-area-inset-left, 0px))',
          paddingRight: 'calc(2rem + env(safe-area-inset-right, 0px))'
        }}
      >
        {updating ? (
          <UpdatingState />
        ) : showStartText ? (
          <StartText />
        ) : (
          <ProgressBar progress={progress} />
        )}
      </div>
    </div>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="w-full max-w-md mx-auto">
      <div
        className="h-2.5 rounded-full overflow-hidden"
        style={{
          background: 'rgba(255, 255, 255, 0.25)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)'
        }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${progress}%`,
            background: 'linear-gradient(to right, #fbbf24, #f59e0b)',
            transition: 'width 280ms ease-out',
            boxShadow: '0 0 8px rgba(251, 191, 36, 0.6)'
          }}
        />
      </div>
      <div
        className="mt-3 text-center text-sm text-white/90 font-medium tracking-wide"
        style={{ textShadow: '0 1px 3px rgba(0, 0, 0, 0.5)' }}
      >
        載入中 {progress}%
      </div>
    </div>
  );
}

function StartText() {
  return (
    <div className="w-full text-center">
      <div
        className="inline-block text-white font-bold text-xl tracking-wider splash-pulse"
        style={{
          textShadow: '0 2px 6px rgba(0, 0, 0, 0.7), 0 0 16px rgba(251, 191, 36, 0.5)'
        }}
      >
        點擊任意處開始遊戲
      </div>
    </div>
  );
}

function UpdatingState() {
  return (
    <div className="w-full text-center">
      <div
        className="inline-flex items-center gap-2 text-white font-semibold text-base"
        style={{ textShadow: '0 1px 3px rgba(0, 0, 0, 0.6)' }}
      >
        <span className="inline-block w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
        正在更新到最新版本…
      </div>
    </div>
  );
}
