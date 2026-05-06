import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { CREATURES, getCreature } from '@/data/creatures';
import { isCorrupted } from '@/types';

const CATEGORY_LABEL: Record<string, string> = {
  'four-symbols': '四象',
  dragon: '龍族',
  bird: '鳥族',
  lucky: '招財',
  beast: '異獸',
  aquatic: '水族',
  spirit: '靈體',
  cursed: '凶獸'
};

/**
 * 神獸圖鑑：依分類分區，已收集的有彩色 emoji，未收集的灰階剪影。
 * 賣光的也計入收集（pet.retiredAt 不影響圖鑑）。
 */
export default function Bestiary() {
  const allPets = useLiveQuery(() => db.pets.toArray(), []);
  const ownedSpecies = new Set((allPets ?? []).map((p) => p.speciesId));
  const everCorrupted = new Set(
    (allPets ?? []).filter((p) => p.firstCorruptedAt || isCorrupted(p)).map((p) => p.speciesId)
  );

  const grouped = new Map<string, typeof CREATURES>();
  for (const c of CREATURES) {
    if (!grouped.has(c.category)) grouped.set(c.category, []);
    grouped.get(c.category)!.push(c);
  }

  const total = CREATURES.length;
  const owned = ownedSpecies.size;

  return (
    <div className="bg-white rounded-lg p-3 border border-gray-200">
      <h4 className="text-sm font-bold mb-2">
        📚 神祇圖鑑 ({owned}/{total})
      </h4>
      <div className="space-y-3">
        {[...grouped.entries()].map(([cat, list]) => (
          <div key={cat}>
            <h5 className="text-xs font-bold text-gray-600 mb-1">
              {CATEGORY_LABEL[cat] ?? cat}
            </h5>
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
              {list.map((c) => {
                const got = ownedSpecies.has(c.id);
                const corrupted = everCorrupted.has(c.id);
                return (
                  <div
                    key={c.id}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-center p-1 text-center ${
                      got
                        ? corrupted
                          ? 'bg-purple-900/10 border border-purple-300'
                          : 'bg-amber-50 border border-amber-200'
                        : 'bg-gray-100 border border-gray-200'
                    }`}
                    title={c.name + (got ? '' : '（未收集）')}
                  >
                    <span
                      className={`text-2xl ${got ? '' : 'grayscale opacity-30'}`}
                    >
                      {c.emoji}
                    </span>
                    <span
                      className={`text-[9px] mt-0.5 leading-tight ${got ? 'text-gray-700' : 'text-gray-400'}`}
                    >
                      {got ? c.name : '???'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 點寵物彈窗用：取得神獸 species 名稱（外部用） */
export function speciesName(id: string): string {
  return getCreature(id)?.name ?? '?';
}
