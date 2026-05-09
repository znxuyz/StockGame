import { useEffect, useState } from 'react';
import { eventBus } from '@/services';
import { formatInt } from '@/utils';

/**
 * 連登里程碑全螢幕慶祝(階段 3.3)。
 *
 * 訂閱 eventBus 'cultivation:earn' 過濾 reason='streak_milestone'。
 * 任何 caller 觸發 milestone earn(目前只有 loginStreakService.claimTodayLogin)
 * 都會顯示 3 秒全螢幕慶祝動畫。
 *
 * 視覺(z-80,蓋過 modal):
 *   - 黑幕 alpha 0.6 淡入淡出
 *   - 底部金色光柱從下往上拉
 *   - 中央 🎉 + 連登 N 天! + +N 修為
 *
 * 跟階段 1.7 sprite 突破慶祝同款設計,只是 React DOM 版(modal 之上)。
 *
 * 跟 CultivationFloater 平行運作:玩家領 milestone → 飄字也跑 + 慶祝也跑,
 * 視覺重點仍在中央,飄字補在 HUD 旁邊不打架。
 */

interface CelebrationItem {
  id: number;
  amount: number;
  reasonText: string;
}

const DURATION_MS = 3000;

export default function MilestoneCelebration() {
  const [items, setItems] = useState<CelebrationItem[]>([]);

  useEffect(() => {
    let nextId = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const off = eventBus.on('cultivation:earn', ({ amount, reason, reasonText }) => {
      if (reason !== 'streak_milestone') return;
      nextId += 1;
      const id = nextId;
      setItems((prev) => [...prev, { id, amount, reasonText }]);
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
          {/* 光柱 — 從下往上的金色漸層 */}
          <div
            className="absolute inset-x-0 bottom-0 milestone-pillar"
            style={{
              height: '70%',
              background:
                'linear-gradient(to top, rgba(251,191,36,0.7) 0%, rgba(251,191,36,0.3) 60%, transparent 100%)'
            }}
          />
          {/* 中央文字 */}
          <div className="relative text-center milestone-text">
            <div className="text-7xl mb-2">🎉</div>
            <div
              className="text-3xl sm:text-4xl font-bold text-amber-300"
              style={{
                textShadow: '0 0 18px rgba(251,191,36,0.8), 0 4px 12px rgba(0,0,0,0.85)'
              }}
            >
              {item.reasonText}
            </div>
            <div
              className="mt-3 text-2xl font-bold text-amber-100"
              style={{ textShadow: '0 2px 8px rgba(0,0,0,0.85)' }}
            >
              💎 +{formatInt(item.amount)} 修為
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
