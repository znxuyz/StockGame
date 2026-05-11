import type { ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { audio } from '@/services';
import { db } from '@/db';

interface BottomBarProps {
  onGame: () => void;
  onFriends: () => void;
  onTrade: () => void;
  onRecords: () => void;
  onSettings: () => void;
}

/** 點按鈕先響 click 再執行原 handler */
function withClick(fn: () => void) {
  return () => {
    audio.playClick();
    fn();
  };
}

/**
 * 底部玻璃擬態功能列(階段 R.6 改版 + icon 修正)。
 *
 * 新 5 顆按鈕:[遊戲][好友][交易][紀錄][設定]
 *  - 遊戲 / 好友 / 交易:暫用 emoji 占位(新功能,等用戶補美術 PNG)
 *  - 紀錄 / 設定:沿用既有 PNG(卷軸 / 粉鑽框)
 *
 * 紅點通知遷到遊戲按鈕,條件不變:有可領任務 → 紅點。
 *
 * 美術切換:當 public/assets/btn/{game,friends,trade}.png 補上後,
 * 把對應按鈕從 emoji={'🎮'} 改成 src='/assets/btn/game.png' 即可。
 */
export default function BottomBar({
  onGame,
  onFriends,
  onTrade,
  onRecords,
  onSettings
}: BottomBarProps) {
  // 階段 3.7 遷移:可領任務數 → 遊戲按鈕紅點
  const claimableTaskCount =
    useLiveQuery(
      async () => {
        const tasks = await db.userTasks.toArray();
        return tasks.filter((t) => t.completed && !t.claimed).length;
      },
      [],
      0
    ) ?? 0;

  return (
    <div className="hud-bottom">
      <div className="grid grid-cols-5 gap-0.5">
        <ActionButton
          emoji="🎮"
          onClick={withClick(onGame)}
          label="遊戲"
          badge={claimableTaskCount > 0 ? claimableTaskCount : undefined}
        />
        <ActionButton emoji="👥" onClick={withClick(onFriends)} label="好友" />
        <ActionButton emoji="🔄" onClick={withClick(onTrade)} label="交易" />
        <ActionButton
          src="/assets/btn/records.png"
          onClick={withClick(onRecords)}
          label="紀錄"
        />
        <ActionButton
          src="/assets/btn/settings.png"
          onClick={withClick(onSettings)}
          label="設定"
        />
      </div>
    </div>
  );
}

interface ActionButtonProps {
  /** PNG 圖示路徑(沿用舊 icon 的按鈕用) */
  src?: string;
  /** emoji 占位(新功能尚未補美術用);src / emoji 二擇一 */
  emoji?: ReactNode;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  /** 右上角紅色 badge 數字(階段 R.6 後遊戲按鈕用) */
  badge?: number;
}

function ActionButton({ src, emoji, onClick, label, disabled, badge }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative flex flex-col items-center justify-end gap-0.5 py-0.5 ${
        disabled
          ? 'opacity-40 grayscale cursor-not-allowed'
          : 'active:scale-95 transition-transform'
      }`}
    >
      {src ? (
        <img
          src={src}
          alt=""
          aria-hidden
          draggable={false}
          className="w-full max-w-[64px] aspect-square object-contain select-none drop-shadow-[0_2px_6px_rgba(33,78,61,0.35)]"
        />
      ) : (
        <span
          className="w-full max-w-[56px] aspect-square flex items-center justify-center text-4xl select-none drop-shadow-[0_2px_6px_rgba(33,78,61,0.35)]"
          aria-hidden
        >
          {emoji}
        </span>
      )}
      <span className="text-[11px] font-bold tracking-wider text-mythic-ink-200 font-zh">
        {label}
      </span>
      {badge !== undefined && badge > 0 && (
        <span
          className="absolute top-0 right-2 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shadow"
          aria-label={`${badge} 項可領取`}
        >
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}
