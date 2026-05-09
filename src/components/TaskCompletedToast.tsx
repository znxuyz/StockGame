import { useEffect, useState } from 'react';
import { eventBus } from '@/services';
import type { UserTask } from '@/types';

/**
 * 任務完成提示卡(階段 3.7)。
 *
 * 訂閱 eventBus 'task:completed',右上角滑入提示「任務完成:[任務名]」3 秒。
 * 全 app 一個實例,放 App root,fixed position 不影響 layout。
 *
 * 連續多個任務完成會堆疊往下,各自 3 秒後消失。
 */

interface ToastItem {
  id: number;
  task: UserTask;
}

const DURATION_MS = 3000;

export default function TaskCompletedToast() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    let nextId = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const off = eventBus.on('task:completed', ({ task }) => {
      nextId += 1;
      const id = nextId;
      setItems((prev) => [...prev, { id, task }]);
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
    <div
      className="fixed pointer-events-none z-[70] flex flex-col gap-2"
      style={{
        top: 'calc(env(safe-area-inset-top) + 12px)',
        right: 'calc(env(safe-area-inset-right) + 12px)'
      }}
    >
      {items.map((item) => (
        <div
          key={item.id}
          className="task-toast bg-emerald-500 text-white px-4 py-2 rounded-lg shadow-lg max-w-[260px]"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">✅</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs opacity-90">任務完成</div>
              <div className="text-sm font-bold truncate">{item.task.title}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
