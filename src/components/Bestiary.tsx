import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { CREATURES, getCreature } from '@/data/creatures';
import BestiaryPetModal from './BestiaryPetModal';

/**
 * 神獸圖鑑：依陣營分區,已收集的有彩色立繪,未收集的灰階剪影。
 * 賣光的也計入收集(pet.retiredAt 不影響圖鑑)。
 *
 * category 直接是中文陣營名(天界 / 魔界 / 自然界 ...),不需翻譯字典。
 * 陣營出現順序 = creatures.ts 內第一次出現的順序。
 *
 * 階段 4C.2:已收集的卡可點開 BestiaryPetModal 看所有實例 + 永恆紀念。
 *   - 任一 pet 已 isEternal → 卡片金光環 + ✨ 標誌(右上角)
 *
 * 階段 4C.4 視覺升級:
 *   - 卡片左上角加 📜 標誌(已解鎖修仙傳說的 species)
 *   - 統計列加「📜 故事 N/50」(配合「📚 圖鑑 X/50」並列)
 */
export default function Bestiary() {
  const allPets = useLiveQuery(() => db.pets.toArray(), []);
  const ownedSpecies = new Set((allPets ?? []).map((p) => p.speciesId));
  // 階段 4C.2:該 species 任一 pet isEternal 就標金邊
  // 防呆 ?? false:舊資料沒 isEternal 欄位時當 false 處理(已有 v13 backfill,
  // 但雙重保險避免 race / 雲端拉到舊版 blob 等情況)
  const eternalSpecies = new Set(
    (allPets ?? []).filter((p) => p.isEternal ?? false).map((p) => p.speciesId)
  );
  // 階段 4C.4:已解鎖修仙傳說的 species(creatureUnlocks 表)
  // 防呆:若表還沒 migrate 完(v12 → v13 過渡)或其他錯誤,當作沒解鎖過,
  // 不要讓 useLiveQuery 把錯 rethrow 出去整個 Bestiary 白屏。
  const unlocks = useLiveQuery(async () => {
    try {
      return await db.creatureUnlocks.toArray();
    } catch (e) {
      console.warn('[Bestiary] creatureUnlocks query failed:', e);
      return [];
    }
  }, []);
  const storyUnlockedSpecies = new Set((unlocks ?? []).map((u) => u.creatureId));

  const [openSpeciesId, setOpenSpeciesId] = useState<string | null>(null);

  const grouped = new Map<string, typeof CREATURES>();
  for (const c of CREATURES) {
    if (!grouped.has(c.category)) grouped.set(c.category, []);
    grouped.get(c.category)!.push(c);
  }

  const total = CREATURES.length;
  const owned = ownedSpecies.size;
  const eternal = eternalSpecies.size;
  const stories = storyUnlockedSpecies.size;

  return (
    <div className="data-card p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
        <h4 className="text-sm font-bold">
          📚 神祇圖鑑 {owned}/{total}
        </h4>
        <span className="text-xs text-amber-700">
          ✨ 永恆 {eternal}
        </span>
        <span className="text-xs text-gray-600">
          📜 故事 {stories}/{total}
        </span>
      </div>
      <div className="space-y-3">
        {[...grouped.entries()].map(([cat, list]) => (
          <div key={cat}>
            <h5 className="text-xs font-bold text-gray-600 mb-1">{cat}</h5>
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
              {list.map((c) => {
                const got = ownedSpecies.has(c.id);
                const isEternal = eternalSpecies.has(c.id);
                const isStoryUnlocked = storyUnlockedSpecies.has(c.id);
                const cardCls = !got
                  ? 'bg-gray-100 border border-gray-200'
                  : isEternal
                    ? 'bg-gradient-to-br from-amber-50 to-amber-100 border-2 border-amber-400 shadow-md'
                    : 'bg-amber-50 border border-amber-200';
                const titleSuffix = !got
                  ? '(未收集)'
                  : [isEternal ? '✨ 已永恆紀念' : '', isStoryUnlocked ? '📜 已解鎖傳說' : '']
                      .filter(Boolean)
                      .join(' · ');
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => got && setOpenSpeciesId(c.id)}
                    disabled={!got}
                    className={`relative aspect-square rounded-lg flex flex-col items-center justify-center p-1 text-center overflow-hidden ${cardCls} ${
                      got ? 'active:scale-95 transition-transform cursor-pointer' : 'cursor-default'
                    }`}
                    title={titleSuffix ? `${c.name} · ${titleSuffix}` : c.name}
                  >
                    {/* 階段 4C.4:已解鎖傳說 → 左上 📜;已紀念 → 右上 ✨ */}
                    {isStoryUnlocked && (
                      <span
                        className="absolute top-0.5 left-0.5 text-[10px] z-10 drop-shadow"
                        aria-label="已解鎖傳說"
                      >
                        📜
                      </span>
                    )}
                    {isEternal && (
                      <span
                        className="absolute top-0.5 right-0.5 text-[10px] z-10 drop-shadow"
                        aria-label="已永恆紀念"
                      >
                        ✨
                      </span>
                    )}
                    {c.art ? (
                      <img
                        src={`/sprites/${c.id}.png`}
                        alt={c.name}
                        className={`flex-1 w-full object-cover ${got ? '' : 'grayscale opacity-30'}`}
                        onError={(e) => {
                          // 圖檔缺漏 → fallback emoji
                          const img = e.currentTarget as HTMLImageElement;
                          img.style.display = 'none';
                          const fb = img.nextElementSibling as HTMLElement | null;
                          if (fb) fb.style.display = 'block';
                        }}
                      />
                    ) : null}
                    <span
                      className={`text-2xl ${got ? '' : 'grayscale opacity-30'}`}
                      style={{ display: c.art ? 'none' : 'block' }}
                    >
                      {c.emoji}
                    </span>
                    <span
                      className={`text-[9px] mt-0.5 leading-tight ${
                        isEternal
                          ? 'text-amber-700 font-bold'
                          : got
                            ? 'text-gray-700'
                            : 'text-gray-400'
                      }`}
                    >
                      {got ? (isEternal ? `永恆·${c.name}` : c.name) : '???'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <BestiaryPetModal
        open={openSpeciesId !== null}
        onClose={() => setOpenSpeciesId(null)}
        speciesId={openSpeciesId}
      />
    </div>
  );
}

/** 點寵物彈窗用：取得神獸 species 名稱（外部用） */
export function speciesName(id: string): string {
  return getCreature(id)?.name ?? '?';
}
