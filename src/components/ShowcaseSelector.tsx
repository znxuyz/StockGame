import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import { useAllPets } from '@/repositories/petRepo';
import { getMyShowcase, updateMyShowcase } from '@/services';
import { getCreature } from '@/data/creatures';

interface ShowcaseSelectorProps {
  open: boolean;
  onClose: () => void;
  onActionComplete?: (message: string) => void;
}

const MAX_SHOWCASE = 3;

/**
 * 階段 5B:展示神獸選擇器(玩家自選 1-3 隻在個人頁突出顯示)。
 *
 *  - 上半:目前選擇 1-3 格(可空)+ 移除 x
 *  - 下半:所有曾召喚過的神獸 grid;點未選 → 加入展示;點已選 → 移除
 *  - 上限 3 隻,超過顯示「已達上限」
 *  - 排序由「加入順序」決定(MVP 不支援拖曳排序;改用「上下箭頭」)
 *  - 儲存按鈕觸發 updateMyShowcase + onActionComplete
 */
export default function ShowcaseSelector({ open, onClose, onActionComplete }: ShowcaseSelectorProps) {
  const allPets = useAllPets() ?? [];
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) {
      setLoaded(false);
      return;
    }
    setLoaded(false);
    getMyShowcase().then((s) => {
      setSelected(s?.showcaseCreatureIds ?? []);
      setLoaded(true);
    });
  }, [open]);

  const summonedIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of allPets) set.add(p.speciesId);
    return Array.from(set).sort();
  }, [allPets]);

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_SHOWCASE) return prev;
      return [...prev, id];
    });
  }

  function moveUp(idx: number) {
    if (idx <= 0) return;
    setSelected((prev) => {
      const next = prev.slice();
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }
  function moveDown(idx: number) {
    setSelected((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = prev.slice();
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }

  async function handleSave() {
    if (busy) return;
    setBusy(true);
    const r = await updateMyShowcase(selected);
    setBusy(false);
    if (!r.ok) {
      onActionComplete?.(`⚠️ 儲存失敗:${r.error}`);
      return;
    }
    onActionComplete?.('🏆 展示神獸已更新');
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="🏆 展示神獸">
      <div className="space-y-3">
        <p className="text-xs text-gray-600 leading-relaxed">
          挑選 1-{MAX_SHOWCASE} 隻神獸在你的個人頁顯眼處展示。
          沒選的話對方會看到你修為最高的 3 隻。
        </p>

        {/* 目前選擇 */}
        <div>
          <div className="text-xs text-gray-500 mb-1">
            目前展示 ({selected.length} / {MAX_SHOWCASE})
          </div>
          {selected.length === 0 ? (
            <p className="text-xs text-gray-400 italic text-center py-3 bg-gray-50 rounded">
              尚未選擇
            </p>
          ) : (
            <div className="space-y-2">
              {selected.map((id, idx) => {
                const c = getCreature(id);
                const src = c?.art ? `/sprites/${id}.png` : null;
                return (
                  <div
                    key={id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-amber-50 border border-amber-200"
                  >
                    <div className="w-10 h-10 rounded-md overflow-hidden bg-gradient-to-br from-amber-100 to-amber-200 shrink-0 flex items-center justify-center">
                      {src ? (
                        <img src={src} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl">{c?.emoji ?? '❓'}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate">{c?.name ?? id}</div>
                      <div className="text-[11px] text-gray-500">展示位 #{idx + 1}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveUp(idx)}
                        className="w-7 h-7 rounded-md bg-white border border-gray-300 text-xs disabled:opacity-30"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        disabled={idx === selected.length - 1}
                        onClick={() => moveDown(idx)}
                        className="w-7 h-7 rounded-md bg-white border border-gray-300 text-xs disabled:opacity-30"
                      >
                        ▼
                      </button>
                      <button
                        type="button"
                        onClick={() => toggle(id)}
                        className="w-7 h-7 rounded-md bg-red-100 text-red-600 border border-red-200 text-xs"
                        aria-label="移除"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <hr className="border-gray-200" />

        {/* 已召喚的神獸 grid */}
        <div>
          <div className="text-xs text-gray-500 mb-2">
            已召喚的神獸 ({summonedIds.length})
          </div>
          {summonedIds.length === 0 ? (
            <p className="text-xs text-gray-400 italic text-center py-3">
              還沒召喚過神獸,先去買股票吧
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {summonedIds.map((id) => {
                const c = getCreature(id);
                const isSelected = selected.includes(id);
                const atLimit = selected.length >= MAX_SHOWCASE && !isSelected;
                const src = c?.art ? `/sprites/${id}.png` : null;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggle(id)}
                    disabled={atLimit}
                    className={`relative aspect-square rounded-lg border-2 overflow-hidden bg-gradient-to-br from-amber-50 to-amber-100 active:scale-95 transition-transform ${
                      isSelected ? 'ring-2 ring-amber-500 border-amber-400' : 'border-gray-200'
                    } ${atLimit ? 'opacity-40 cursor-not-allowed' : ''}`}
                    title={c?.name ?? id}
                  >
                    {src ? (
                      <img src={src} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-3xl">
                        {c?.emoji ?? '❓'}
                      </span>
                    )}
                    {isSelected && (
                      <span className="absolute top-0.5 right-0.5 bg-emerald-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[12px] font-bold shadow">
                        ✓
                      </span>
                    )}
                    <span className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-[10px] py-0.5 truncate px-1">
                      {c?.name ?? id}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={busy || !loaded}
          className="w-full py-3 bg-emerald-500 text-white rounded-lg font-bold disabled:opacity-50 active:scale-[0.99] transition-transform"
        >
          {busy ? '儲存中⋯' : '儲存展示'}
        </button>
      </div>
    </Modal>
  );
}
