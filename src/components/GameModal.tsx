import Modal from './Modal';

interface GameModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 遊戲彈窗(階段 R 重組)。
 *
 * 從紀錄彈窗搬過來的 4 個玩法 tab:任務 / 成就 / 圖鑑 / 修為。
 * 階段 R.1 先做骨架(只有「即將推出」placeholder);R.2 整合既有 tab 內容。
 *
 * 紅點通知將從紀錄按鈕遷到遊戲按鈕(階段 R.2)。
 */
export default function GameModal({ open, onClose }: GameModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="遊戲">
      <div className="space-y-4 p-2 text-center text-sm text-gray-600">
        <div className="text-4xl">🎮</div>
        <p className="font-bold">遊戲彈窗骨架</p>
        <p className="text-xs">階段 R.2 將整合 4 個 tab:</p>
        <ul className="text-xs space-y-1 text-gray-500">
          <li>📋 任務</li>
          <li>🏆 成就</li>
          <li>📚 圖鑑</li>
          <li>💎 修為</li>
        </ul>
      </div>
    </Modal>
  );
}
