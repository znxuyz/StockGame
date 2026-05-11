import { useEffect, useState } from 'react';
import Modal from './Modal';
import { emitTaskTrigger } from '@/services';
import type { TaskTriggerEvent } from '@/types';
import TasksTab from './TasksTab';
import AchievementsList from './AchievementsList';
import Bestiary from './Bestiary';
import CultivationTab from './CultivationTab';
import ErrorBoundary from './ErrorBoundary';

interface GameModalProps {
  open: boolean;
  onClose: () => void;
  /** 點修為紀錄行(有 relatedPetId)→ caller 可選實作跳 PetInfoModal */
  onPetClick?: (petId: string) => void;
}

type Tab = 'tasks' | 'achievements' | 'bestiary' | 'cultivation';

const TAB_LABEL: Record<Tab, string> = {
  tasks: '📋 任務',
  achievements: '🏆 成就',
  bestiary: '📚 圖鑑',
  cultivation: '💎 修為'
};

/** tab → task trigger 對應(沿用 RecordsModal 的設計) */
const TAB_TASK_TRIGGER: Partial<Record<Tab, TaskTriggerEvent>> = {
  bestiary: 'view_codex'
};

/**
 * 遊戲彈窗(階段 R.2)。
 *
 * 把原本 RecordsModal 內的 4 個玩法 tab 抽出來,獨立成「遊戲」入口。
 * 預設 tab 「任務」。
 *
 * R.6 才會接到 BottomBar,這個 commit 元件先 ready,但沒人 import 就還不會出現。
 */
export default function GameModal({ open, onClose, onPetClick }: GameModalProps) {
  const [tab, setTab] = useState<Tab>('tasks');

  // tab 切換 → emit task trigger(目前只有圖鑑 view_codex 有對應)
  useEffect(() => {
    if (!open) return;
    const trigger = TAB_TASK_TRIGGER[tab];
    if (trigger) emitTaskTrigger(trigger, 1);
  }, [open, tab]);

  const tabBar = (
    <div
      className="grid grid-cols-4 border-b"
      style={{ borderColor: 'rgba(212, 175, 55, 0.25)' }}
    >
      {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => setTab(t)}
          className={`py-2.5 text-sm font-bold border-b-2 transition-colors ${
            tab === t
              ? 'text-mythic-jade-500 border-mythic-jade-400'
              : 'text-gray-500 border-transparent hover:bg-white/20'
          }`}
        >
          {TAB_LABEL[t]}
        </button>
      ))}
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title="遊戲" headerExtra={tabBar}>
      <div className="space-y-3">
        {tab === 'tasks' && <TasksTab />}
        {tab === 'achievements' && <AchievementsList />}
        {tab === 'bestiary' && (
          <ErrorBoundary label="Bestiary">
            <Bestiary />
          </ErrorBoundary>
        )}
        {tab === 'cultivation' && <CultivationTab onPetClick={onPetClick} />}
      </div>
    </Modal>
  );
}
