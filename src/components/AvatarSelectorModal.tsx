import { useMemo } from 'react';
import Modal from './Modal';
import { useAllPets } from '@/repositories/petRepo';
import { getCreature } from '@/data/creatures';

interface AvatarSelectorModalProps {
  open: boolean;
  onClose: () => void;
  /** 目前選的 creature id,null = 預設(灰圈) */
  currentAvatarId: string | null;
  onSelect: (creatureId: string | null) => void;
}

/**
 * 階段 5A:頭像選擇器。
 *
 *  - 撈出所有「曾經召喚過」的神獸 species id(包含已賣出的退役 pet)
 *  - 4 格 grid 顯示,點 → onSelect 寫回 profile.avatar_creature_id 並關閉
 *  - 排頭一格是「無頭像」(灰圈 + 中央 ?,代表用預設)
 *  - 已選的格子加 ring + ✓
 *
 * 這只是個 picker,不直接寫 DB — parent (ProfileEditModal) 拿回 id 後再 dirty
 * 處理。這樣選了不 confirm 還能放棄變更。
 */
export default function AvatarSelectorModal({
  open,
  onClose,
  currentAvatarId,
  onSelect
}: AvatarSelectorModalProps) {
  const pets = useAllPets() ?? [];

  // 撈出 distinct speciesId(包含已退役的)
  const summonedSpeciesIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of pets ?? []) {
      if (p.speciesId) set.add(p.speciesId);
    }
    // 排序:有當前頭像的排第一,其他按 species id 字母序
    const ids = Array.from(set);
    ids.sort();
    return ids;
  }, [pets]);

  return (
    <Modal open={open} onClose={onClose} title="選擇頭像">
      <div className="space-y-3">
        {/* 預設無頭像格 */}
        <button
          type="button"
          onClick={() => {
            onSelect(null);
            onClose();
          }}
          className={`w-full flex items-center gap-3 p-3 rounded-lg border bg-white/40 active:scale-[0.99] transition-transform ${
            currentAvatarId === null ? 'ring-2 ring-amber-500 border-amber-300' : 'border-gray-200'
          }`}
        >
          <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center text-xl text-gray-500">
            ?
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm font-bold text-gray-700">無頭像</div>
            <div className="text-[11px] text-gray-500">使用預設灰圈</div>
          </div>
          {currentAvatarId === null && (
            <span className="text-emerald-600 font-bold text-lg">✓</span>
          )}
        </button>

        <div>
          <p className="text-xs text-gray-500 mb-2">
            已召喚的神獸 ({summonedSpeciesIds.length})
          </p>
          {summonedSpeciesIds.length === 0 ? (
            <p className="text-xs text-gray-400 italic text-center py-6">
              還沒召喚過神獸,先去買股票吧
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {summonedSpeciesIds.map((id) => {
                const c = getCreature(id);
                const isCurrent = currentAvatarId === id;
                const src = c?.art ? `/sprites/${id}.png` : null;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      onSelect(id);
                      onClose();
                    }}
                    className={`relative aspect-square rounded-lg border-2 overflow-hidden bg-gradient-to-br from-amber-50 to-amber-100 active:scale-95 transition-transform ${
                      isCurrent ? 'ring-2 ring-amber-500 border-amber-400' : 'border-gray-200'
                    }`}
                    title={c?.name ?? id}
                  >
                    {src ? (
                      <img
                        src={src}
                        alt={c?.name ?? ''}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-3xl">
                        {c?.emoji ?? '❓'}
                      </span>
                    )}
                    {isCurrent && (
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
      </div>
    </Modal>
  );
}
