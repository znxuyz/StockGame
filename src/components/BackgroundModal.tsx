import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Modal from './Modal';
import { db } from '@/db';
import { spendCultivation, BACKGROUNDS } from '@/services';
import { useCultivation } from '@/hooks/useCultivation';
import type { Settings } from '@/types';

interface BackgroundModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 家園背景換皮(階段 4B.4)。
 *
 *  - 4 張背景目錄(BACKGROUNDS),'default' 預設免費已解鎖
 *  - 鎖定的:cost 修為解鎖 → append unlockedBackgrounds → 自動切換
 *  - 已解鎖的:點 [選用] 直接切,不再扣費
 *  - 切換時 settings.currentBackground 更新 → PhaserMap useEffect 通知 scene
 *    動態載入 texture + swap;檔案不存在 fallback 維持原 bg
 *
 * 沒美術檔的背景(catalog.hasAsset === false)仍可解鎖,但選用後 scene
 * FILE_LOAD_ERROR 會 console.warn,玩家仍看到原 bg。modal 顯示「待美術上傳」
 * 警示,讓玩家知道目前不能真的看到效果。
 */
export default function BackgroundModal({ open, onClose }: BackgroundModalProps) {
  const settings = useLiveQuery(() => db.settings.get('singleton'), []);
  const cultivation = useCultivation();
  const balance = cultivation.amount;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!settings) return null;

  const currentBg: string = settings.currentBackground ?? 'default';
  const unlocked: string[] = settings.unlockedBackgrounds ?? ['default'];

  async function selectBg(id: string) {
    if (id === currentBg) return;
    setError(null);
    const next: Settings = { ...settings!, currentBackground: id };
    await db.settings.put(next);
  }

  async function unlockAndSelect(id: string, cost: number, label: string) {
    if (busy) return;
    setError(null);
    if (balance < cost) {
      setError(`修為不足,還差 ${cost - balance}`);
      return;
    }
    setBusy(id);

    const r = await spendCultivation(cost, 'background', `解鎖家園背景:${label}`);
    if (!r.success) {
      setBusy(null);
      setError(r.reason === 'insufficient' ? '修為不足' : '操作失敗,請稍後再試');
      return;
    }

    const newUnlocked = unlocked.includes(id) ? unlocked : [...unlocked, id];
    const next: Settings = {
      ...settings!,
      unlockedBackgrounds: newUnlocked,
      currentBackground: id
    };
    await db.settings.put(next);
    setBusy(null);
  }

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title="家園背景" hideClose={!!busy}>
      <div className="space-y-3 text-sm">
        <p className="text-xs text-gray-600 leading-relaxed">
          解鎖一次 💎 500 修為,之後可隨時免費切換。其他三張背景的美術尚未上線,
          解鎖後仍維持原圖,等美術補上即可看到。
        </p>

        <div className="space-y-2">
          {BACKGROUNDS.map((bg) => {
            const isUnlocked = unlocked.includes(bg.id);
            const isCurrent = currentBg === bg.id;
            const insufficient = !isUnlocked && balance < bg.cost;
            const isBusy = busy === bg.id;

            return (
              <div
                key={bg.id}
                className={`item-card px-3 py-3 flex items-center gap-3 ${
                  isCurrent ? 'ring-2 ring-amber-500 bg-amber-50' : ''
                }`}
              >
                {/* 縮圖預覽:有素材直接 thumb;沒素材給漸層 placeholder */}
                <div
                  className="w-12 h-12 rounded-lg shrink-0 border border-gray-300 overflow-hidden bg-gradient-to-br from-amber-100 to-amber-200"
                  aria-hidden
                >
                  {bg.hasAsset ? (
                    <img
                      src={`/assets/bg/${bg.filename}`}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm flex items-center gap-2">
                    {isCurrent && <span className="text-emerald-600">✓</span>}
                    {bg.label}
                    {isCurrent && (
                      <span className="text-[10px] text-emerald-600 font-normal">(使用中)</span>
                    )}
                  </div>
                  {!bg.hasAsset && (
                    <div className="text-[11px] text-amber-700 mt-0.5">⚠️ 待美術上傳</div>
                  )}
                  {!isUnlocked && (
                    <div className="text-xs text-gray-500 mt-0.5">💎 {bg.cost} 修為解鎖</div>
                  )}
                </div>

                {isCurrent ? (
                  <span className="text-xs text-gray-400 px-3 py-1.5">使用中</span>
                ) : isUnlocked ? (
                  <button
                    type="button"
                    onClick={() => selectBg(bg.id)}
                    disabled={!!busy}
                    className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-bold active:scale-95 transition-transform disabled:opacity-50"
                  >
                    選用
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => unlockAndSelect(bg.id, bg.cost, bg.label)}
                    disabled={!!busy || insufficient}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold active:scale-95 transition-transform disabled:active:scale-100 ${
                      insufficient
                        ? 'bg-gray-300 text-gray-500'
                        : 'bg-amber-500 text-white'
                    }`}
                  >
                    {isBusy ? '解鎖中⋯' : insufficient ? '💎不足' : '解鎖'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
            {error}
          </p>
        )}

        <div className="text-xs text-gray-500 text-right pt-1">
          目前餘額:💎 {balance} 修為
        </div>
      </div>
    </Modal>
  );
}
