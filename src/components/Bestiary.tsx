import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { CREATURES, getCreature } from '@/data/creatures';

/**
 * 神獸圖鑑：依陣營分區,已收集的有彩色立繪,未收集的灰階剪影。
 * 賣光的也計入收集(pet.retiredAt 不影響圖鑑)。
 *
 * category 直接是中文陣營名(天界 / 魔界 / 自然界 ...),不需翻譯字典。
 * 陣營出現順序 = creatures.ts 內第一次出現的順序。
 */
export default function Bestiary() {
  const allPets = useLiveQuery(() => db.pets.toArray(), []);
  const ownedSpecies = new Set((allPets ?? []).map((p) => p.speciesId));

  const grouped = new Map<string, typeof CREATURES>();
  for (const c of CREATURES) {
    if (!grouped.has(c.category)) grouped.set(c.category, []);
    grouped.get(c.category)!.push(c);
  }

  const total = CREATURES.length;
  const owned = ownedSpecies.size;

  return (
    <div className="data-card p-3">
      <h4 className="text-sm font-bold mb-2">
        📚 神祇圖鑑 ({owned}/{total})
      </h4>
      <div className="space-y-3">
        {[...grouped.entries()].map(([cat, list]) => (
          <div key={cat}>
            <h5 className="text-xs font-bold text-gray-600 mb-1">{cat}</h5>
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
              {list.map((c) => {
                const got = ownedSpecies.has(c.id);
                return (
                  <div
                    key={c.id}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-center p-1 text-center overflow-hidden ${
                      got
                        ? 'bg-amber-50 border border-amber-200'
                        : 'bg-gray-100 border border-gray-200'
                    }`}
                    title={c.name + (got ? '' : '(未收集)')}
                  >
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
