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
 * 底部玻璃擬態功能列(階段 R.6 改版)。
 *
 * 新 5 顆按鈕:[遊戲][好友][交易][紀錄][設定]
 *  - 遊戲:任務 / 成就 / 圖鑑 / 修為 4 tab(原本 RecordsModal 內部)
 *  - 好友:placeholder「即將推出」(階段 5 才實作)
 *  - 交易:統一入口,點下去看 3 個動作(召喚 / 加碼 / 退役 → 既有 Modal)
 *  - 紀錄:精簡為 3 個工具 tab(圖表 / 對比 / 交易明細)
 *  - 設定:不變
 *
 * 紅點通知遷到遊戲按鈕(本來在紀錄按鈕),條件不變:有可領任務 → 紅點。
 *
 * icon:
 *  - 美術尚未補上,先用 emoji 占位。後續上傳到 public/assets/btn/{game,friends,trade}.png
 *    並 mark assetReady=true 即可切回 PNG。買入/餵食/售出 三顆 PNG 已不再使用,
 *    保留檔案直到 R.7 確定沒人 reference 才刪。
 */
export default function BottomBar({
  onGame,
  onFriends,
  onTrade,
  onRecords,
  onSettings
}: BottomBarProps) {
  // 階段 3.7 遷移:可領任務數(completed && !claimed)→ 從紀錄按鈕搬到遊戲按鈕
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
        <ActionButton emoji="📊" onClick={withClick(onRecords)} label="紀錄" />
        <ActionButton emoji="⚙️" onClick={withClick(onSettings)} label="設定" />
      </div>
    </div>
  );
}

interface ActionButtonProps {
  /** 暫用 emoji 占位,之後換 PNG 再加 src prop */
  emoji: ReactNode;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  /** 右上角紅色 badge 數字(階段 R.6 後遊戲按鈕用) */
  badge?: number;
}

function ActionButton({ emoji, onClick, label, disabled, badge }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative flex flex-col items-center justify-end gap-0.5 py-1.5 ${
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : 'active:scale-95 transition-transform'
      }`}
    >
      {/* emoji 圓盤,跟原 64×64 PNG 的視覺重量接近 */}
      <span
        className="w-full max-w-[56px] aspect-square flex items-center justify-center text-4xl select-none drop-shadow-[0_2px_6px_rgba(33,78,61,0.35)]"
        aria-hidden
      >
        {emoji}
      </span>
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
