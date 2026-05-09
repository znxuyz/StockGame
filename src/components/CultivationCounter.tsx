import { useEffect, useRef, useState } from 'react';
import { formatCount } from '@/utils';

/**
 * 修為數字 + count-up 動畫(階段 2.2)。
 *
 * value 變動時用 requestAnimationFrame 從 prev 漸進到 new value,800ms easeOutCubic。
 * 第一次 render 不放動畫(prev === value)。
 *
 * 連續變動(例如連 buy 連得 +5)會中斷舊動畫立刻啟動新的,
 * 用 cleanup flag 取消未完的 RAF 避免 setState race condition。
 *
 * 顯示用 formatCount: < 10K 千分位,>= 10K 用 K/M 縮寫(配合精簡 HUD 空間)。
 */

interface CultivationCounterProps {
  value: number;
  className?: string;
}

const DURATION_MS = 800;

export default function CultivationCounter({ value, className }: CultivationCounterProps) {
  const [display, setDisplay] = useState(value);
  // 上一次的 target value(動畫起點)。第一次 render = value,所以 prev === value 不會啟動動畫
  const prevTargetRef = useRef(value);

  useEffect(() => {
    const start = prevTargetRef.current;
    const end = value;
    if (start === end) return;

    let cancelled = false;
    const startTime = performance.now();
    const diff = end - start;

    const tick = (now: number) => {
      if (cancelled) return;
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / DURATION_MS);
      // easeOutCubic: 1 - (1 - t)^3 — 開頭快、收尾穩
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(start + diff * eased));
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        setDisplay(end);
      }
    };
    requestAnimationFrame(tick);

    prevTargetRef.current = end;
    return () => {
      cancelled = true;
    };
  }, [value]);

  return <span className={`tabular-nums ${className ?? ''}`}>{formatCount(display)}</span>;
}
