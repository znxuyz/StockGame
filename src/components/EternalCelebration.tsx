import { useEffect, useState } from 'react';
import { eventBus } from '@/services';

/**
 * 永恆紀念全螢幕慶祝(階段 4C.2)。
 *
 * 訂閱 eventBus 'cultivation:spend' 過濾 reason='eternal'。
 * EternalConfirmModal 確認後 spendCultivation 會 emit,
 * 這個元件 3 秒全螢幕慶祝動畫(reusing milestone 動畫 class)。
 *
 * reasonText 慣例:「永恆封印:朱雀涅槃」,split ':' 取右半當神獸名。
 */

interface CelebrationItem {
  id: number;
  petName: string;
}

const DURATION_MS = 3000;

export default function EternalCelebration() {
  const [items, setItems] = useState<CelebrationItem[]>([]);

  useEffect(() => {
    let nextId = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const off = eventBus.on('cultivation:spend', ({ reason, reasonText }) => {
      if (reason !== 'eternal') return;
      nextId += 1;
      const id = nextId;
      const petName = reasonText.split(':').pop()?.trim() || '神獸';
      setItems((prev) => [...prev, { id, petName }]);
      const t = setTimeout(() => {
        timers.delete(t);
        setItems((prev) => prev.filter((i) => i.id !== id));
      }, DURATION_MS);
      timers.add(t);
    });

    return () => {
      off();
      for (const t of timers) clearTimeout(t);
      timers.clear();
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <>
      {items.map((item) => (
        <div
          key={item.id}
          className="fixed inset-0 z-[80] pointer-events-none flex items-center justify-center"
        >
          {/* 黑幕 */}
          <div className="absolute inset-0 bg-black milestone-overlay" />
          {/* 金色光柱 */}
          <div
            className="absolute inset-x-0 bottom-0 milestone-pillar"
            style={{
              height: '70%',
              background:
                'linear-gradient(to top, rgba(251,191,36,0.85) 0%, rgba(251,191,36,0.4) 60%, transparent 100%)'
            }}
          />
          {/* 中央文字 */}
          <div className="relative text-center milestone-text">
            <div className="text-7xl mb-2">✨</div>
            <div
              className="text-3xl sm:text-4xl font-bold text-amber-300"
              style={{
                textShadow: '0 0 18px rgba(251,191,36,0.8), 0 4px 12px rgba(0,0,0,0.85)'
              }}
            >
              {item.petName}
            </div>
            <div
              className="mt-3 text-2xl font-bold text-amber-100"
              style={{ textShadow: '0 2px 8px rgba(0,0,0,0.85)' }}
            >
              已永恆封印
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
