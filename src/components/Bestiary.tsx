import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { CREATURES, getCreature } from '@/data/creatures';
import BestiaryPetDetail from './BestiaryPetDetail';

/**
 * 神獸圖鑑：依陣營分區,已收集的有彩色立繪,未收集的灰階剪影。
 * 賣光的也計入收集(pet.retiredAt 不影響圖鑑)。
 *
 * 階段 4C.2 + 4C.4 + 圖鑑白屏修:
 *  - 內嵌 detail view 取代 Modal-in-Modal:點神獸卡 → state 切換 →
 *    BestiaryPetDetail 直接取代列表渲染。原本巢狀 Modal 被 iOS Safari 的
 *    backdrop-filter containing block 鎖住,變成「列表下方的卡」要捲才看到
 *    這個 state-based 切換完全避開那個 CSS 行為,順帶解決卡片填滿+置中問題
 *    (一個 view 一個容器,所有 layout 都從 parent 繼承)
 *  - 已紀念神獸:卡片金光環 + ✨ 右上角標 + 「永恆·」名稱前綴
 *  - 已解鎖傳說:卡片左上 📜 角標
 */
export default function Bestiary() {
  const allPets = useLiveQuery(() => db.pets.toArray(), []);
  const ownedSpecies = new Set((allPets ?? []).map((p) => p.speciesId));
  // 階段 4C.2:該 species 任一 pet isEternal 就標金邊
  // 防呆 ?? false:舊資料沒 isEternal 欄位時當 false 處理
  const eternalSpecies = new Set(
    (allPets ?? []).filter((p) => p.isEternal ?? false).map((p) => p.speciesId)
  );
  // 階段 4C.4:已解鎖修仙傳說的 species(creatureUnlocks 表)
  // 防呆:若表還沒 migrate 完(v12 → v13 過渡)或其他錯誤,當作沒解鎖過
  const unlocks = useLiveQuery(async () => {
    try {
      return await db.creatureUnlocks.toArray();
    } catch (e) {
      console.warn('[Bestiary] creatureUnlocks query failed:', e);
      return [];
    }
  }, []);
  const storyUnlockedSpecies = new Set((unlocks ?? []).map((u) => u.creatureId));

  // 內嵌 detail view 狀態。null = 顯示列表,設了 species id = 顯示該神獸詳細頁
  const [selectedSpeciesId, setSelectedSpeciesId] = useState<string | null>(null);

  const grouped = new Map<string, typeof CREATURES>();
  for (const c of CREATURES) {
    if (!grouped.has(c.category)) grouped.set(c.category, []);
    grouped.get(c.category)!.push(c);
  }

  const total = CREATURES.length;
  const owned = ownedSpecies.size;
  const eternal = eternalSpecies.size;
  const stories = storyUnlockedSpecies.size;

  // 已選 species → 直接 render 詳細頁取代列表,不再 nested modal
  if (selectedSpeciesId) {
    return (
      <BestiaryPetDetail
        speciesId={selectedSpeciesId}
        onBack={() => setSelectedSpeciesId(null)}
      />
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
        <h4 className="text-sm font-bold">
          📚 神祇圖鑑 {owned}/{total}
        </h4>
        <span className="text-xs text-amber-700">✨ 永恆 {eternal}</span>
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
                    onClick={() => got && setSelectedSpeciesId(c.id)}
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
    </div>
  );
}

/** 點寵物彈窗用:取得神獸 species 名稱(外部用) */
export function speciesName(id: string): string {
  return getCreature(id)?.name ?? '?';
}
