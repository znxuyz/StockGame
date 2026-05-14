import { useAchievements } from '@/repositories/achievementRepo';
import { ACHIEVEMENTS } from '@/data/achievements';

const CATEGORY_LABEL: Record<string, string> = {
  collection: '🐾 收集',
  profit: '💰 獲利',
  loss: '📉 虧損',
  evolution: '⚡ 進化',
  'long-term': '⏳ 長期',
  operation: '🎯 操作',
  social: '👥 社交'
};

/**
 * 成就列表(從 RecordsModal 抽出來,階段 R.2)。
 *
 * 用 db.achievements 訂閱解鎖進度。依 category 分組,顯示進度條 + 進度數字。
 * R.2 之後同時被 RecordsModal(舊)和 GameModal(新)引用,
 * R.3 從 RecordsModal 移除後只剩 GameModal 用。
 */
export default function AchievementsList() {
  const progress = useAchievements();
  const map = new Map((progress ?? []).map((a) => [a.id, a]));
  const unlockedCount = (progress ?? []).filter((a) => a.unlockedAt).length;

  const grouped = new Map<string, typeof ACHIEVEMENTS>();
  for (const def of ACHIEVEMENTS) {
    if (!grouped.has(def.category)) grouped.set(def.category, []);
    grouped.get(def.category)!.push(def);
  }

  return (
    <div className="space-y-3">
      <div className="unlock-counter px-3 py-2 text-sm font-bold text-center">
        🏆 已解鎖 {unlockedCount} / {ACHIEVEMENTS.length}
      </div>
      {[...grouped.entries()].map(([cat, list]) => (
        <section key={cat}>
          <h4 className="text-sm font-bold text-gray-700 mb-1">{CATEGORY_LABEL[cat] ?? cat}</h4>
          <div className="space-y-1">
            {list.map((def) => {
              const p = map.get(def.id);
              const unlocked = !!p?.unlockedAt;
              const cur = p?.current ?? 0;
              const pct = Math.min(100, (cur / def.target) * 100);
              return (
                <div
                  key={def.id}
                  className={`achievement-card px-3 py-2 text-xs ${unlocked ? 'unlocked' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={unlocked ? 'font-bold text-amber-800' : 'text-gray-700'}>
                      {unlocked ? '🏅' : '🔒'} {def.name}
                    </span>
                    <span className="text-gray-500">
                      {cur}/{def.target}
                    </span>
                  </div>
                  <div className="text-gray-500 mt-0.5">{def.description}</div>
                  <div className="bg-gray-100 rounded h-1 overflow-hidden mt-1">
                    <div
                      className={`h-full ${unlocked ? 'bg-amber-400' : 'bg-sand-300'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
