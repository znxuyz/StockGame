import type { CreatureSpecies } from '@/types';

/**
 * 20 隻原創上古神祇(取代原山海經陣容)。
 *
 * 設計:
 *  - 主題從「山海經神獸動物園」改成「道家宇宙觀 + 上古神祇」
 *  - 所有種類都有對應立繪(public/sprites/<id>.png),全 art: true
 *  - 黑化採方案甲(原寵物變色),所以這裡不放凶獸獨立種類
 *  - category 沿用既有 enum 但語意上鬆綁(主要按主視覺歸類)
 *  - 「四象齊聚」成就改成「天罡四極」(鴻鈞道祖/玄黃地母/滄溟海尊/紫微天樞)
 */
export const CREATURES: CreatureSpecies[] = [
  {
    id: 'tai-chu-yan-jun',
    name: '太初炎君',
    category: 'spirit',
    description: '太初宇宙初闢之火神,燃盡虛空與寒夜。',
    emoji: '🔥',
    art: true
  },
  {
    id: 'tai-su-xuan-lu',
    name: '太素玄鹿',
    category: 'beast',
    description: '太素之氣所化之神鹿,角承星辰,蹄踏無聲。',
    emoji: '🦌',
    art: true
  },
  {
    id: 'wu-shi-zhi-die',
    name: '無始之蝶',
    category: 'spirit',
    description: '無始無終的時間之蝶,翅振一次便閱盡千劫。',
    emoji: '🦋',
    art: true
  },
  {
    id: 'wu-ji-jin-zun',
    name: '無極金尊',
    category: 'lucky',
    description: '鍛金為形之至尊,胸懷無極之數,守天地之衡。',
    emoji: '🪙',
    art: true
  },
  {
    id: 'ji-zhi-ming',
    name: '寂之鳴',
    category: 'spirit',
    description: '萬籟俱寂時方響起之神音,聽者皆證大道。',
    emoji: '🔔',
    art: true
  },
  {
    id: 'tai-xuan-zhi-zhu',
    name: '太玄之主',
    category: 'spirit',
    description: '統御深玄之境的至高之主,執掌萬象幽冥。',
    emoji: '🌑',
    art: true
  },
  {
    id: 'yuan-shi-lei-ting',
    name: '原始雷霆',
    category: 'spirit',
    description: '開天闢地之雷,劈分混沌而生陰陽。',
    emoji: '⚡',
    art: true
  },
  {
    id: 'wu-zi-zhi-long',
    name: '無字之龍',
    category: 'dragon',
    description: '鱗上無字、亦不立傳之古龍,沉默而至大。',
    emoji: '🐉',
    art: true
  },
  {
    id: 'heng-chun-zhi-gui',
    name: '恆春之龜',
    category: 'aquatic',
    description: '萬載恆春之神龜,殼負四時更迭,踏水生花。',
    emoji: '🐢',
    art: true
  },
  {
    id: 'wu-xiang-zhi-hu',
    name: '無相之狐',
    category: 'beast',
    description: '無有定相之狐妖,化萬形而不留痕跡。',
    emoji: '🦊',
    art: true
  },
  {
    id: 'hong-meng-xue-huang',
    name: '鴻濛血皇',
    category: 'spirit',
    description: '鴻濛初開之血祖,執赤光斬伐宿世罪業。',
    emoji: '🩸',
    art: true
  },
  {
    id: 'tai-bai-jian-xian',
    name: '太白劍仙',
    category: 'spirit',
    description: '太白金星化身之劍仙,一劍開天三千里。',
    emoji: '⚔️',
    art: true
  },
  {
    id: 'xuan-huang-di-mu',
    name: '玄黃地母',
    category: 'spirit',
    description: '玄黃二色化生之地母,承載萬物根脈。',
    emoji: '🌍',
    art: true
  },
  {
    id: 'cang-ming-hai-zun',
    name: '滄溟海尊',
    category: 'aquatic',
    description: '統御滄溟四海之尊,潮起潮落皆其呼吸。',
    emoji: '🌊',
    art: true
  },
  {
    id: 'huang-quan-meng-po',
    name: '黃泉孟婆',
    category: 'spirit',
    description: '司掌奈何橋之神尊,一碗湯洗盡前塵記憶。',
    emoji: '🍵',
    art: true
  },
  {
    id: 'zi-wei-tian-shu',
    name: '紫微天樞',
    category: 'spirit',
    description: '紫微帝星化身,執掌天樞,定群星位序。',
    emoji: '⭐',
    art: true
  },
  {
    id: 'hong-meng-qin-zun',
    name: '鴻蒙琴尊',
    category: 'spirit',
    description: '撫鴻蒙古琴而現之尊,弦響一聲化山河。',
    emoji: '🎵',
    art: true
  },
  {
    id: 'ye-huo-luo-cha',
    name: '業火羅剎',
    category: 'spirit',
    description: '業火所煉之羅剎,焚一切貪嗔痴。',
    emoji: '👹',
    art: true
  },
  {
    id: 'tai-xu-jing-jun',
    name: '太虛鏡君',
    category: 'spirit',
    description: '持太虛之鏡照見諸天,鏡中萬法皆空。',
    emoji: '🪞',
    art: true
  },
  {
    id: 'hong-jun-dao-zu',
    name: '鴻鈞道祖',
    category: 'spirit',
    description: '三清之師、道祖之尊,坐紫霄宮論道無極。',
    emoji: '☯️',
    art: true
  }
];

/** 透過 id 取得神獸定義(找不到回傳 undefined) */
export function getCreature(id: string): CreatureSpecies | undefined {
  return CREATURES.find((c) => c.id === id);
}

/** 隨機抽一隻神獸(買新檔股票時使用) */
export function pickRandomCreature(): CreatureSpecies {
  const idx = Math.floor(Math.random() * CREATURES.length);
  return CREATURES[idx];
}
