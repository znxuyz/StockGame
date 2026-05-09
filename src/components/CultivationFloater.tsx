import { useEffect, useRef, useState } from 'react';
import { eventBus } from '@/services';
import { formatCount } from '@/utils';

/**
 * 修為變動飄字(階段 2.4)。
 *
 * 訂閱 eventBus 'cultivation:earn' / 'cultivation:spend',觸發飄字動畫。
 * 全 app 一個實例,放在 App.tsx root 即可,fixed position 不影響 layout。
 *
 * 規格:
 *   - 賺取:綠色 +N 修為,從 HUD 修為位置往上飄
 *   - 消耗:紅色 -N 修為,往下沉(階段 4 才會用)
 *   - 動畫 1500ms(漸入 ~225 / 上飄 975 / 漸出 300)
 *   - amount > 100 加金色光圈 + 字放大 18px
 *   - 多個飄字錯開 300ms,避免同時刷一堆看不清
 *
 * 位置:fixed top 在 HUD 修為(💎)下方右側。HUD 在 fixed top,padding 大概
 * 安全區頂 + 90px height。所以 top:80 right:16 落在狀態列右下,接近 💎 的位置。
 */

interface FloaterItem {
  id: number;
  amount: number;
  type: 'earn' | 'spend';
  large: boolean;
}

const DURATION_MS = 1500;
/** 連續觸發時延遲新飄字出現的間隔 */
const STAGGER_OFFSET_MS = 300;
/** large 等級閾值(>100 才加金色光圈) */
const LARGE_THRESHOLD = 100;

export default function CultivationFloater() {
  const [items, setItems] = useState<FloaterItem[]>([]);
  // ref 存「下一個飄字最早可發出的時間」,連續觸發自動排隊
  const nextEmitAtRef = useRef(0);
  // ref 自增 id,避免同一 ms 多筆衝突
  const idRef = useRef(0);

  useEffect(() => {
    const enqueue = (amount: number, type: 'earn' | 'spend') => {
      idRef.current += 1;
      const id = idRef.current;
      const now = Date.now();
      // 比較「現在」跟「上一個飄字 + stagger」哪個晚,取晚的當這次的延遲基準
      const delay = Math.max(0, nextEmitAtRef.current - now);
      nextEmitAtRef.current = now + delay + STAGGER_OFFSET_MS;

      const showT = setTimeout(() => {
        setItems((prev) => [
          ...prev,
          { id, amount, type, large: amount >= LARGE_THRESHOLD }
        ]);
        const removeT = setTimeout(() => {
          setItems((prev) => prev.filter((i) => i.id !== id));
        }, DURATION_MS);
        // 不需另外清 timeout — component unmount 也只是 leak 一個 setTimeout,
        // 1.5s 後自然 GC,可接受
        void removeT;
      }, delay);
      void showT;
    };

    const offEarn = eventBus.on('cultivation:earn', ({ amount }) => enqueue(amount, 'earn'));
    const offSpend = eventBus.on('cultivation:spend', ({ amount }) => enqueue(amount, 'spend'));

    return () => {
      offEarn();
      offSpend();
    };
  }, []);

  return (
    <div
      className="fixed pointer-events-none z-[60]"
      style={{
        top: 'calc(env(safe-area-inset-top) + 70px)',
        right: 'calc(env(safe-area-inset-right) + 16px)'
      }}
    >
      {items.map((item) => (
        <div
          key={item.id}
          className={`cultivation-floater ${item.type} ${item.large ? 'large' : ''} ${
            item.type === 'earn' ? 'text-emerald-500' : 'text-red-500'
          }`}
          style={{ position: 'absolute', right: 0, top: 0, fontSize: item.large ? 18 : 14 }}
        >
          {item.type === 'earn' ? '+' : '-'}
          {formatCount(item.amount)} 修為
        </div>
      ))}
    </div>
  );
}
