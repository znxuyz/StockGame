import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAllPets } from '@/repositories/petRepo';
import { creatureUnlockRepo } from '@/repositories/creatureUnlockRepo';
import { CREATURES, getCreature } from '@/data/creatures';
import BestiaryPetDetail from './BestiaryPetDetail';
import type { Pet } from '@/types';

interface BestiaryProps {
  /** 階段 5C:點圖鑑詳細頁的「📤 分享」按鈕 → caller 開 ShareModal */
  onShare?: (pet: Pet) => void;
}

/**
 * 神獸圖鑑:依陣營分區,已收集的有彩色立繪,未收集的灰階剪影。
 * 賣光的也計入收集(pet.retiredAt 不影響圖鑑)。
 *
 * 階段 4C.2 + 4C.4 + 圖鑑白屏修:
 *  - 內嵌 detail view 取代 Modal-in-Modal:點神獸卡 → state 切換 →
 *    BestiaryPetDetail 直接取代列表渲染。原本巢狀 Modal 被 iOS Safari 的
 *    backdrop-filter containing block 鎖住,變成「列表下方的卡」要捲才看到
 *    這個 state-based 切換完全避開那個 CSS 行為,順帶解決卡片填滿+置中問題
 *  - 已紀念神獸:卡片金光環 + ✨ 右上角標 + 「永恆·」名稱前綴
 *  - 已解鎖傳說:卡片左上 📜 角標
 *
 * 階段 6.X 加總覽:
 *  - 頂部 banner:總進度條(已收集 / 50)+ 永恆 / 故事計數
 *  - 橫向 scroll 的類別 pill,每顆顯示「類別名 N/M」,點擊 filter 列表
 *  - 點同 pill 再次 → 取消 filter
 *  - 「全部」pill 在最前,active 時整列顯示原本的 grouped view
 */
export default function Bestiary({ onShare }: BestiaryProps = {}) {
  const allPets = useAllPets();
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
      return await creatureUnlockRepo.list();
    } catch (e) {
      console.warn('[Bestiary] creatureUnlocks query failed:', e);
      return [];
    }
  }, []);
  const storyUnlockedSpecies = new Set((unlocks ?? []).map((u) => u.creatureId));

  // 內嵌 detail view 狀態。null = 顯示列表,設了 species id = 顯示該神獸詳細頁
  const [selectedSpeciesId, setSelectedSpeciesId] = useState<string | null>(null);
  // 階段 6.X:類別 filter。null = 顯示全部,設了類別名 = 只顯示該類別
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  // group by category(順序按 CREATURES 出現順序穩定)
  const grouped = new Map<string, typeof CREATURES>();
  for (const c of CREATURES) {
    if (!grouped.has(c.category)) grouped.set(c.category, []);
    grouped.get(c.category)!.push(c);
  }

  const total = CREATURES.length;
  const owned = ownedSpecies.size;
  const eternal = eternalSpecies.size;
  const stories = storyUnlockedSpecies.size;
  const progressPct = Math.round((owned / total) * 100);

  // 每類別計收集進度
  const categoryStats = [...grouped.entries()].map(([cat, list]) => ({
    cat,
    list,
    ownedCount: list.filter((c) => ownedSpecies.has(c.id)).length,
    totalCount: list.length
  }));

  // filter 套用:選了類別只顯示該類,沒選顯示全部 grouped
  const visibleGroups = filterCategory
    ? categoryStats.filter((g) => g.cat === filterCategory)
    : categoryStats;

  // 已選 species → 直接 render 詳細頁取代列表,不再 nested modal
  if (selectedSpeciesId) {
    return (
      <BestiaryPetDetail
        speciesId={selectedSpeciesId}
        onBack={() => setSelectedSpeciesId(null)}
        onShare={onShare}
      />
    );
  }

  return (
    <div>
      {/* ─── 階段 6.X:總覽 banner ─────────────────────── */}
      <div className="data-card p-3 mb-3">
        {/* 標題 + 摘要計數 */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
          <h4 className="text-sm font-bold">📚 神祇圖鑑</h4>
          <span className="text-xs text-gray-700 font-bold tabular-nums">
            {owned} / {total}
          </span>
          <span className="text-xs text-amber-700 tabular-nums">✨ 永恆 {eternal}</span>
          <span className="text-xs text-gray-600 tabular-nums">
            📜 故事 {stories}/{total}
          </span>
        </div>

        {/* 總進度條 */}
        <div className="relative h-2.5 w-full bg-amber-100/70 rounded-full overflow-hidden border border-amber-200/60">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="text-[10px] text-gray-500 text-right mt-0.5 tabular-nums">
          {progressPct}%
        </div>

        {/* 類別 pill — 橫向 scroll(scrollbar 隱藏,共用 .no-scrollbar) */}
        <div className="flex gap-1.5 mt-2 overflow-x-auto -mx-1 px-1 pb-1 no-scrollbar">
          <CategoryPill
            label="全部"
            owned={owned}
            total={total}
            active={filterCategory === null}
            onClick={() => setFilterCategory(null)}
          />
          {categoryStats.map(({ cat, ownedCount, totalCount }) => (
            <CategoryPill
              key={cat}
              label={cat}
              owned={ownedCount}
              total={totalCount}
              active={filterCategory === cat}
              onClick={() =>
                setFilterCategory((prev) => (prev === cat ? null : cat))
              }
            />
          ))}
        </div>
      </div>

      {/* ─── 神獸列表(filter 後或全部 grouped)──────────── */}
      <div className="space-y-3">
        {visibleGroups.map(({ cat, list }) => (
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

/** 類別 pill — 上排顯示「類別名」,下排顯示「X/Y」進度。active 時加粗邊 + 反白色。 */
function CategoryPill({
  label,
  owned,
  total,
  active,
  onClick
}: {
  label: string;
  owned: number;
  total: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 flex flex-col items-center justify-center px-2.5 py-1 rounded-lg border text-center transition-colors active:scale-95 ${
        active
          ? 'bg-amber-500 text-white border-amber-600 shadow-sm font-bold'
          : 'bg-amber-50/70 text-amber-800 border-amber-200/70 hover:bg-amber-100/70'
      }`}
    >
      <span className="text-[10px] leading-tight whitespace-nowrap">{label}</span>
      <span className="text-[10px] tabular-nums leading-tight">
        {owned}/{total}
      </span>
    </button>
  );
}

/** 點寵物彈窗用:取得神獸 species 名稱(外部用) */
export function speciesName(id: string): string {
  return getCreature(id)?.name ?? '?';
}
