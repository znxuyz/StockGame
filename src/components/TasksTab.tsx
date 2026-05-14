import { useEffect, useState } from 'react';
import { useDailyTasks, useWeeklyTasks } from '@/repositories/taskRepo';
import { claimTaskReward } from '@/services';
import { formatInt } from '@/utils';
import type { UserTask } from '@/types';

/**
 * 任務 tab(階段 3.6)。
 *
 * 兩段:今日修煉(daily)+ 本週修煉(weekly)。
 * 每筆任務一張 .achievement-card,進度條 + 領取按鈕。
 *
 * 倒數計時:每 1 秒 setNow,resetAt - now 算「剩 X 天 Y 小時」/「剩 X:XX:XX」。
 * 倒數每秒重 render 整個 tab 不會卡 — task list 通常 7 筆,div 簡單。
 *
 * 任務狀態:
 *   not completed → ☐ + 進度條藍色漸層 + N/M
 *   completed not claimed → ☑ + 進度條綠色漸層 + 金色領取按鈕(animate-pulse)
 *   claimed → ☑ + 整卡 opacity 60% + 「已領取 ✓」灰字
 */

const COUNTDOWN_INTERVAL_MS = 1000;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatCountdown(resetAt: number, now: number): string {
  const ms = resetAt - now;
  if (ms <= 0) return '已重置';
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days > 0) return `剩 ${days} 天 ${hours} 小時`;
  if (hours > 0) return `剩 ${hours}:${pad2(mins)}:${pad2(secs)}`;
  if (mins > 0) return `剩 ${mins}:${pad2(secs)}`;
  return `剩 ${secs} 秒`;
}

export default function TasksTab() {
  // 倒數計時用,每 1s 重渲染
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), COUNTDOWN_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  const dailyTasks = useDailyTasks() ?? [];
  const weeklyTasks = useWeeklyTasks() ?? [];

  // 同一輪所有任務 resetAt 一樣,取第一個
  const dailyResetAt = dailyTasks[0]?.resetAt;
  const weeklyResetAt = weeklyTasks[0]?.resetAt;

  return (
    <div className="space-y-4">
      <TaskSection
        title="📅 今日修煉"
        tasks={dailyTasks}
        countdown={dailyResetAt ? formatCountdown(dailyResetAt, now) : ''}
      />
      <TaskSection
        title="📆 本週修煉"
        tasks={weeklyTasks}
        countdown={weeklyResetAt ? formatCountdown(weeklyResetAt, now) : ''}
      />
    </div>
  );
}

function TaskSection({
  title,
  tasks,
  countdown
}: {
  title: string;
  tasks: UserTask[];
  countdown: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h4 className="text-sm font-bold text-gray-700">{title}</h4>
        {countdown && (
          <span className="text-xs text-gray-500 tabular-nums">{countdown}</span>
        )}
      </div>
      {tasks.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">
          尚未生成任務,重開 App 即出現
        </p>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task }: { task: UserTask }) {
  const pct = Math.min(100, (task.progress / task.target) * 100);
  const handleClaim = async () => {
    if (task.id == null) return;
    await claimTaskReward(task.id);
  };

  return (
    <div className={`achievement-card p-3 ${task.claimed ? 'opacity-60' : ''}`}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2 flex-1 min-w-0">
          <span className="text-base shrink-0">
            {task.completed ? '☑' : '☐'}
          </span>
          <div className="flex-1 min-w-0">
            <div
              className={`font-bold text-sm ${task.completed ? 'text-emerald-600' : 'text-gray-700'}`}
            >
              {task.title}
            </div>
            <div className="text-xs text-gray-500">{task.description}</div>
          </div>
        </div>
        <span className="text-xs text-amber-500 font-bold shrink-0">
          💎 +{task.reward}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              task.completed
                ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                : 'bg-gradient-to-r from-blue-400 to-blue-500'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-gray-500 tabular-nums shrink-0 min-w-[5rem] text-right">
          {formatInt(task.progress)}/{formatInt(task.target)}
        </span>
      </div>

      {task.completed && !task.claimed && (
        <button
          type="button"
          onClick={handleClaim}
          className="mt-2 w-full py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white text-sm font-bold animate-pulse shadow"
        >
          領取 💎 +{task.reward}
        </button>
      )}
      {task.claimed && (
        <div className="mt-2 text-center text-xs text-gray-500">已領取 ✓</div>
      )}
    </div>
  );
}
