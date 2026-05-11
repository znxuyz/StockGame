import Modal from './Modal';

interface FriendsModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 好友彈窗(階段 R 重組,placeholder)。
 *
 * 階段 5 才實作:
 *  - 神獸分享卡片
 *  - 匿名排行榜
 *  - 好友圖鑑互看
 *
 * 階段 R.4 顯示「即將推出」骨架,先佔 BottomBar 一個位置。
 */
export default function FriendsModal({ open, onClose }: FriendsModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="好友">
      <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
        <div className="text-5xl">🚧</div>
        <p className="text-base font-bold text-gray-700">即將推出</p>
        <ul className="text-sm text-gray-600 space-y-1 mt-2">
          <li>神獸分享卡片</li>
          <li>匿名排行榜</li>
          <li>好友圖鑑互看</li>
        </ul>
        <p className="text-xs text-gray-400 mt-4">敬請期待 v5.0 更新</p>
      </div>
    </Modal>
  );
}
