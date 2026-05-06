import type { CreatureSpecies } from '@/types';

/**
 * 10 隻精選山海經神獸。
 *
 * 設計:
 *  - 從 40 隻原列表精選 10 隻有獨特剪影的(青龍/白虎/朱雀/玄武四象 +
 *    應龍/麒麟/九尾狐/開明獸/何羅魚/帝江)
 *  - 黑化採方案甲(原寵物變色),所以這裡不放四凶獨立種類
 *  - 美術 prompt / 視覺特徵在 scripts/gen-art-prompts.mjs 集中管理
 *  - 之後若要擴充寵物多樣性,再考慮加原創或更多 mythology
 */
export const CREATURES: CreatureSpecies[] = [
  // ────── 四象(4) ──────
  {
    id: 'azure-dragon',
    name: '青龍',
    category: 'four-symbols',
    description: '東方七宿之神,主木雷,象徵生發與貴氣。',
    emoji: '🐉'
  },
  {
    id: 'white-tiger',
    name: '白虎',
    category: 'four-symbols',
    description: '西方七宿之神,主金屬與威猛,鎮邪除厄。',
    emoji: '🐯'
  },
  {
    id: 'vermilion-bird',
    name: '朱雀',
    category: 'four-symbols',
    description: '南方七宿之神,主火與夏,火光朝天而鳴。',
    emoji: '🦩'
  },
  {
    id: 'black-tortoise',
    name: '玄武',
    category: 'four-symbols',
    description: '北方七宿之神,龜蛇合體,主水與壽。',
    emoji: '🐢'
  },

  // ────── 龍族(1) ──────
  {
    id: 'ying-long',
    name: '應龍',
    category: 'dragon',
    description: '有翼之龍,曾助黃帝戰蚩尤,能興雲致雨。',
    emoji: '🐲'
  },

  // ────── 招財類(1) ──────
  {
    id: 'qilin',
    name: '麒麟',
    category: 'lucky',
    description: '仁獸之首,不踐生草、不食生物,盛世現身。',
    emoji: '🦄'
  },

  // ────── 異獸(2) ──────
  {
    id: 'nine-tail-fox',
    name: '九尾狐',
    category: 'beast',
    description: '青丘之獸,見則天下太平;亦能化人形迷惑諸侯。',
    emoji: '🦊'
  },
  {
    id: 'kai-ming',
    name: '開明獸',
    category: 'beast',
    description: '崑崙之獸,九頭虎身人面,守天門八方。',
    emoji: '🗝️'
  },

  // ────── 水族(1) ──────
  {
    id: 'he-luo',
    name: '何羅魚',
    category: 'aquatic',
    description: '一首十身之魚,聲如犬吠,食者無腫疾。',
    emoji: '🐡'
  },

  // ────── 靈體(1) ──────
  {
    id: 'di-jiang',
    name: '帝江',
    category: 'spirit',
    description: '六足四翼,渾敦無面,識歌舞之神鳥。',
    emoji: '🎭'
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

