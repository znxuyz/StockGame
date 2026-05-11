import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { spendCultivation, BACKGROUNDS } from '@/services';
import { useCultivation } from '@/hooks/useCultivation';
import type { Settings } from '@/types';

interface BackgroundSectionProps {
  onBack: () => void;
}

/**
 * 家園背景換皮(階段 4B.4,後改 state-based sub-view)。
 *
 * 不再是巢狀 Modal — 因為 iOS Safari 的 backdrop-filter 包含區塊 bug
 * 會把 nested .glass-popup 鎖進 outer popup 的範圍,造成「子頁底部沒貼齊
 * BottomBar」。改成 SettingsModal 內 state 切換,本元件純內容區。
 *
 *  - 4 張背景目錄(BACKGROUNDS),'default' 預設免費已解鎖
 *  - 鎖定的:cost 修為解鎖 → append unlockedBackgrounds → 自動切換
 *  - 已解鎖的:點 [選用] 直接切,不再扣費
 *  - 切換時 settings.currentBackground 更新 → PhaserMap useEffect 通知 scene
 *    動態載入 texture + swap;檔案不存在 fallback 維持原 bg
 */
export default function BackgroundSection({ onBack }: BackgroundSectionProps) {
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
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between mb-1 px-1">
        <button
          type="button"
          onClick={onBack}
          disabled={!!busy}
          className="text-sm text-mythic-jade-500 font-bold active:scale-95 transition-transform disabled:opacity-50"
        >
          ← 返回設定
        </button>
        <span className="text-xs text-gray-500">家園背景</span>
      </div>

      <p className="text-xs text-gray-600 leading-relaxed">
        解鎖一次 💎 500 修為,之後可隨時免費切換。Phaser scene 動態載入,切換不重整。
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
                    insufficient ? 'bg-gray-300 text-gray-500' : 'bg-amber-500 text-white'
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
  );
}
