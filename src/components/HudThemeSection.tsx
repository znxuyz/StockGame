import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { spendCultivation } from '@/services';
import { useCultivation } from '@/hooks/useCultivation';
import type { HudTheme, Settings } from '@/types';

interface HudThemeSectionProps {
  onBack: () => void;
}

const COST = 200;

interface ThemeMeta {
  id: HudTheme;
  label: string;
  /** swatch 用 CSS 色,概略呈現該主題的 HUD 顏色 */
  swatch: string;
  /** 邊框 swatch 色 */
  border: string;
}

const THEMES: ThemeMeta[] = [
  { id: 'default', label: '米粉', swatch: 'rgba(250, 246, 232, 0.9)', border: '#d4af37' },
  { id: 'jade', label: '玉藍', swatch: 'rgba(220, 240, 235, 0.9)', border: '#50a082' },
  { id: 'purple', label: '紫金', swatch: 'rgba(240, 230, 250, 0.9)', border: '#b482c8' },
  { id: 'red', label: '朱紅', swatch: 'rgba(255, 235, 235, 0.9)', border: '#c86464' }
];

/**
 * HUD 主題色解鎖 / 切換(階段 4B.3,後改 state-based sub-view)。
 *
 * 不再是巢狀 Modal — 因為 iOS Safari 的 backdrop-filter 包含區塊 bug
 * 會把 nested .glass-popup 鎖進 outer popup 的範圍,造成「子頁底部沒貼齊
 * BottomBar」(同 BestiaryPetDetail 之前的 bug)。
 * 改成 SettingsModal 內 state 切換,本元件純內容區。
 *
 *  - 4 種主題,'default' 米粉預設免費已解鎖
 *  - 鎖定的主題:200 修為解鎖,append 進 settings.unlockedHudThemes 後自動切過去
 *  - 已解鎖的:點 [選用] 直接切,不再扣費
 *  - 切換時 settings.hudTheme 更新 → App.tsx useEffect 同步
 *    document.documentElement.dataset.theme,index.css CSS 變數即時生效
 */
export default function HudThemeSection({ onBack }: HudThemeSectionProps) {
  const settings = useLiveQuery(() => db.settings.get('singleton'), []);
  const cultivation = useCultivation();
  const balance = cultivation.amount;
  const [busy, setBusy] = useState<HudTheme | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!settings) return null;

  const currentTheme: HudTheme = settings.hudTheme ?? 'default';
  const unlocked: HudTheme[] = settings.unlockedHudThemes ?? ['default'];

  async function selectTheme(theme: HudTheme) {
    if (theme === currentTheme) return;
    setError(null);
    const next: Settings = { ...settings!, hudTheme: theme };
    await db.settings.put(next);
  }

  async function unlockAndSelect(theme: HudTheme) {
    if (busy) return;
    setError(null);
    if (balance < COST) {
      setError(`修為不足,還差 ${COST - balance}`);
      return;
    }
    setBusy(theme);

    const r = await spendCultivation(COST, 'theme', `解鎖 HUD 主題:${labelOf(theme)}`);
    if (!r.success) {
      setBusy(null);
      setError(r.reason === 'insufficient' ? '修為不足' : '操作失敗,請稍後再試');
      return;
    }

    const newUnlocked = unlocked.includes(theme) ? unlocked : [...unlocked, theme];
    const next: Settings = {
      ...settings!,
      unlockedHudThemes: newUnlocked,
      hudTheme: theme
    };
    await db.settings.put(next);
    setBusy(null);
  }

  return (
    <div className="space-y-3 text-sm">
      {/* 返回按鈕 + 標題列 */}
      <div className="flex items-center justify-between mb-1 px-1">
        <button
          type="button"
          onClick={onBack}
          disabled={!!busy}
          className="text-sm text-mythic-jade-500 font-bold active:scale-95 transition-transform disabled:opacity-50"
        >
          ← 返回設定
        </button>
        <span className="text-xs text-gray-500">HUD 主題色</span>
      </div>

      <p className="text-xs text-gray-600 leading-relaxed">
        解鎖一次 💎 200 修為,之後可隨時免費切換。HUD / 抽屜彈窗都會跟著變色。
      </p>

      <div className="space-y-2">
        {THEMES.map((t) => {
          const isUnlocked = unlocked.includes(t.id);
          const isCurrent = currentTheme === t.id;
          const insufficient = !isUnlocked && balance < COST;
          const isBusy = busy === t.id;

          return (
            <div
              key={t.id}
              className={`item-card px-3 py-3 flex items-center gap-3 ${
                isCurrent ? 'ring-2 ring-amber-500 bg-amber-50' : ''
              }`}
            >
              <div
                className="w-10 h-10 rounded-lg shrink-0 border-2"
                style={{ background: t.swatch, borderColor: t.border }}
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm flex items-center gap-2">
                  {isCurrent && <span className="text-emerald-600">✓</span>}
                  {t.label}
                  {isCurrent && (
                    <span className="text-[10px] text-emerald-600 font-normal">(使用中)</span>
                  )}
                </div>
                {!isUnlocked && (
                  <div className="text-xs text-gray-500 mt-0.5">💎 {COST} 修為解鎖</div>
                )}
              </div>

              {isCurrent ? (
                <span className="text-xs text-gray-400 px-3 py-1.5">使用中</span>
              ) : isUnlocked ? (
                <button
                  type="button"
                  onClick={() => selectTheme(t.id)}
                  disabled={!!busy}
                  className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-bold active:scale-95 transition-transform disabled:opacity-50"
                >
                  選用
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => unlockAndSelect(t.id)}
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

function labelOf(theme: HudTheme): string {
  return THEMES.find((t) => t.id === theme)?.label ?? theme;
}
