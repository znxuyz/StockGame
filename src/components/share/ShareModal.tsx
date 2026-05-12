import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../Modal';
import CreatureShareCard, {
  CARD_DIMENSIONS,
  DEFAULT_DISPLAY_OPTIONS,
  type CardDisplayOptions,
  type CardSize
} from './CreatureShareCard';
import { useCultivation } from '@/hooks/useCultivation';
import { useMyProfile } from '@/hooks/useMyProfile';
import {
  nodeToPng,
  downloadDataUrl,
  shareDataUrl
} from '@/utils/imageGenerator';
import { getHoldingDetail, getPetStatus, type HoldingDetail, type PetStatus } from '@/services';
import { getCreature, getPetDisplayName } from '@/data/creatures';
import { daysBetween } from '@/utils';
import type { Pet } from '@/types';

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  pet: Pet | null;
  /** 操作完成回拋訊息給 caller(顯示 toast) */
  onActionComplete?: (message: string) => void;
}

const CUSTOM_MESSAGE_MAX = 150;

/**
 * 階段 5C:神獸分享卡片彈窗。
 *
 *  - 預覽縮放到 max-width 360 顯示(實際 render 1080,scale 出來)
 *  - 9:16 / 4:5 切換
 *  - 自訂訊息 ≤ 150 字
 *  - 顯示選項 5 個 checkbox
 *  - 存到相簿 / 分享 / 複製連結三按鈕
 *
 * 卡片本身用 absolute 1080px,放在 modal 外的 off-screen container 內,
 * 確保 html-to-image 抓得到完整 DOM(不能有 overflow:hidden 父層裁切)。
 * UI 預覽用 transform: scale 縮一份顯示。
 */
export default function ShareModal({ open, onClose, pet, onActionComplete }: ShareModalProps) {
  const { profile } = useMyProfile();
  const cultivation = useCultivation();
  const cardRef = useRef<HTMLDivElement>(null);

  const [size, setSize] = useState<CardSize>('post');
  const [customMessage, setCustomMessage] = useState('');
  const [options, setOptions] = useState<CardDisplayOptions>(DEFAULT_DISPLAY_OPTIONS);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<HoldingDetail | null>(null);

  // 開新 pet 時重置 state
  useEffect(() => {
    if (open && pet) {
      setCustomMessage('');
      setOptions(DEFAULT_DISPLAY_OPTIONS);
      getHoldingDetail(pet.code).then(setDetail).catch(() => setDetail(null));
    } else if (!open) {
      setDetail(null);
    }
  }, [open, pet?.id, pet?.code]);

  const species = pet ? getCreature(pet.speciesId) : undefined;

  const status: PetStatus | null = useMemo(() => {
    if (!pet || !detail) return null;
    return getPetStatus(pet, detail.holding, detail.price);
  }, [pet, detail]);

  const daysHeld = detail ? daysBetween(detail.holding.firstPurchasedAt, Date.now()) : 0;

  if (!pet || !species) {
    return (
      <Modal open={open} onClose={onClose} title="分享神獸">
        <p className="text-sm text-gray-500 text-center py-6">載入中⋯</p>
      </Modal>
    );
  }

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function handleGenerate(action: 'save' | 'share'): Promise<void> {
    if (!cardRef.current || busy || !pet || !species) return;
    setBusy(true);
    try {
      const dims = CARD_DIMENSIONS[size];
      const dataUrl = await nodeToPng(cardRef.current, {
        width: dims.width,
        height: dims.height
      });
      if (!dataUrl) {
        onActionComplete?.('⚠️ 繪製失敗,請手動截圖此預覽');
        return;
      }
      const filename = `神獸_${species.name}_${Date.now()}.png`;
      if (action === 'save') {
        downloadDataUrl(dataUrl, filename);
        onActionComplete?.('✓ 已儲存到相簿');
      } else {
        const shareText = `我在神獸股市養了一隻${getPetDisplayName(pet, species)}!來看看 → stockgame-692.pages.dev`;
        const ok = await shareDataUrl(
          dataUrl,
          filename,
          shareText,
          'https://stockgame-692.pages.dev'
        );
        if (!ok) {
          // 分享失敗 / 取消 → fallback 下載
          downloadDataUrl(dataUrl, filename);
          onActionComplete?.('已下載 PNG');
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText('https://stockgame-692.pages.dev');
      onActionComplete?.('🔗 連結已複製!');
    } catch {
      onActionComplete?.('⚠️ 無法複製到剪貼簿');
    }
  }

  // 預覽 max-width 320,實際卡片 1080 → scale = 320/1080
  const dims = CARD_DIMENSIONS[size];
  const previewMaxWidth = 320;
  const previewScale = previewMaxWidth / dims.width;

  return (
    <Modal open={open} onClose={onClose} title={`分享 ${getPetDisplayName(pet, species)}`}>
      <div className="space-y-4">
        {/* 預覽區 — 縮放到 320 寬 */}
        <div className="flex justify-center">
          <div
            style={{
              width: `${previewMaxWidth}px`,
              height: `${dims.height * previewScale}px`,
              position: 'relative',
              overflow: 'hidden',
              borderRadius: '16px',
              boxShadow: '0 8px 24px rgba(33,78,61,0.18)',
              background: '#fff8ec'
            }}
          >
            {status ? (
              <div
                style={{
                  transform: `scale(${previewScale})`,
                  transformOrigin: 'top left',
                  width: `${dims.width}px`,
                  height: `${dims.height}px`,
                  pointerEvents: 'none'
                }}
              >
                <CreatureShareCard
                  ref={cardRef}
                  size={size}
                  pet={pet}
                  species={species}
                  status={status}
                  daysHeld={daysHeld}
                  lifetimeEarned={cultivation.lifetimeEarned}
                  profile={profile}
                  customMessage={customMessage}
                  options={options}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center w-full h-full text-xs text-gray-400 italic">
                繪製預覽中⋯
              </div>
            )}
          </div>
        </div>

        {/* 尺寸切換 */}
        <div>
          <div className="text-xs text-gray-500 mb-1">尺寸</div>
          <div className="grid grid-cols-2 gap-2">
            <SizeRadio
              active={size === 'post'}
              onClick={() => setSize('post')}
              label="4:5 IG 貼文"
              caption="1080×1350"
            />
            <SizeRadio
              active={size === 'story'}
              onClick={() => setSize('story')}
              label="9:16 IG Story"
              caption="1080×1920"
            />
          </div>
        </div>

        {/* 自訂訊息 */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            自訂訊息(選填)
            <span className="float-right text-[11px] text-gray-400">
              {customMessage.length} / {CUSTOM_MESSAGE_MAX}
            </span>
          </label>
          <textarea
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value.slice(0, CUSTOM_MESSAGE_MAX))}
            maxLength={CUSTOM_MESSAGE_MAX}
            className="input-field min-h-[60px] resize-none text-sm"
            placeholder="隨手寫點什麼⋯"
          />
        </div>

        {/* 顯示選項 */}
        <div>
          <div className="text-xs text-gray-500 mb-2">顯示選項</div>
          <div className="grid grid-cols-2 gap-1">
            <OptionToggle
              label="顯示玩家名稱"
              checked={options.showNickname}
              onChange={(v) => setOptions((o) => ({ ...o, showNickname: v }))}
            />
            <OptionToggle
              label="顯示神獸故事"
              checked={options.showStory}
              onChange={(v) => setOptions((o) => ({ ...o, showStory: v }))}
            />
            <OptionToggle
              label="顯示報酬率"
              checked={options.showReturnRate}
              onChange={(v) => setOptions((o) => ({ ...o, showReturnRate: v }))}
            />
            <OptionToggle
              label="顯示修為"
              checked={options.showCultivation}
              onChange={(v) => setOptions((o) => ({ ...o, showCultivation: v }))}
            />
            <OptionToggle
              label="顯示持有天數"
              checked={options.showDaysHeld}
              onChange={(v) => setOptions((o) => ({ ...o, showDaysHeld: v }))}
            />
          </div>
        </div>

        <hr className="border-gray-200" />

        {/* 動作按鈕 */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => handleGenerate('save')}
            disabled={busy || !status}
            className="w-full py-3 bg-emerald-500 text-white rounded-lg font-bold disabled:opacity-50 active:scale-[0.99] transition-transform"
          >
            {busy ? '正在繪製卡片⋯' : '💾 存到相簿'}
          </button>
          {canShare && (
            <button
              type="button"
              onClick={() => handleGenerate('share')}
              disabled={busy || !status}
              className="w-full py-2.5 bg-amber-500 text-white rounded-lg font-bold disabled:opacity-50 active:scale-[0.99] transition-transform"
            >
              {busy ? '繪製中⋯' : '📤 分享'}
            </button>
          )}
          <button
            type="button"
            onClick={handleCopyLink}
            className="w-full py-2.5 bg-white/60 border border-gray-300 text-gray-700 rounded-lg text-sm font-bold"
          >
            🔗 複製連結
          </button>
        </div>

        <p className="text-[11px] text-gray-400 leading-relaxed text-center">
          iOS PWA 模式下「存到相簿」會開新分頁顯示圖片,長按可儲存到相簿
        </p>
      </div>
    </Modal>
  );
}

function SizeRadio({
  active,
  onClick,
  label,
  caption
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  caption: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`py-2 px-3 rounded-lg border text-left transition-colors ${
        active
          ? 'bg-amber-50 border-amber-400 text-amber-800'
          : 'bg-white/40 border-gray-300 text-gray-600'
      }`}
    >
      <div className="text-sm font-bold flex items-center gap-2">
        {active && <span>✓</span>}
        {label}
      </div>
      <div className="text-[11px] mt-0.5 text-gray-500">{caption}</div>
    </button>
  );
}

function OptionToggle({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 py-1 cursor-pointer text-sm text-gray-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 accent-emerald-500"
      />
      <span>{label}</span>
    </label>
  );
}
