import Modal from './Modal';

interface SyncConflictModalProps {
  open: boolean;
  /** 雲端 last update 時間(unix ms) — 用來顯示「雲端的較新/較舊」 */
  remoteUpdatedAt: number | undefined;
  onUseCloud: () => void;
  onUseLocal: () => void;
  busy: boolean;
}

/**
 * 登入後若雲端 + 本地都有資料,跳此 dialog 讓 user 選哪邊勝出。
 *
 * 兩個選項:
 *  - 用雲端覆蓋本地(換手機 / 想恢復雲端進度)
 *  - 用本地覆蓋雲端(裝置上的進度比較新 / 雲端是舊備份)
 *
 * 沒「合併」選項 — JSON blob 結構簡單但 holding/pet 各帶 id,合併語意難
 * 定義(同一 stock code 兩邊有不同持倉怎辦?)。MVP 先取覆蓋。
 */
export default function SyncConflictModal({
  open,
  remoteUpdatedAt,
  onUseCloud,
  onUseLocal,
  busy
}: SyncConflictModalProps) {
  const remoteTimeStr = remoteUpdatedAt
    ? new Date(remoteUpdatedAt).toLocaleString('zh-TW')
    : '時間未知';

  return (
    <Modal open={open} onClose={() => {}} hideClose title="雲端與本地都有資料" variant="center">
      <div className="p-4 space-y-3 text-sm">
        <p className="text-gray-700 leading-relaxed">
          這個帳號的雲端有舊資料,本機也有資料。**只能保留一邊**,選哪個?
        </p>

        <div className="bg-gray-50 border border-gray-200 rounded p-2 text-xs text-gray-600">
          雲端最後更新:<span className="font-mono">{remoteTimeStr}</span>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={onUseCloud}
          className="w-full py-3 bg-amber-500 text-white rounded-lg font-bold disabled:opacity-50"
        >
          ☁ 用雲端資料覆蓋本機
        </button>
        <p className="text-[11px] text-gray-500 -mt-1">
          適合:換新手機、想恢復之前的進度
        </p>

        <button
          type="button"
          disabled={busy}
          onClick={onUseLocal}
          className="w-full py-3 bg-emerald-500 text-white rounded-lg font-bold disabled:opacity-50"
        >
          📱 用本機資料覆蓋雲端
        </button>
        <p className="text-[11px] text-gray-500 -mt-1">
          適合:本機進度比較新、想用本機資料當主檔
        </p>

        <p className="text-[11px] text-red-600 leading-relaxed mt-2">
          ⚠️ 被覆蓋那邊的資料會永久消失,沒法復原。確定再按。
        </p>
      </div>
    </Modal>
  );
}
