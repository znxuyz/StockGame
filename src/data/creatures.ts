import type { CreatureSpecies } from '@/types';

/**
 * 20 隻山海經神獸(10 核心 + 10 擴充)。
 *
 * 設計:
 *  - 第一批 10 隻有獨特剪影:青龍/白虎/朱雀/玄武四象 + 應龍/麒麟/
 *    九尾狐/開明獸/何羅魚/帝江(美術 prompt 已跑過 MJ)
 *  - 第二批 10 隻待補立繪:鳳凰/貔貅/白澤/三足烏/角端/巴蛇/畢方/
 *    飛廉/鯤/彘
 *  - 黑化採方案甲(原寵物變色),所以這裡不放四凶獨立種類
 *  - art:true 對應 public/sprites/<id>.png(沒檔自動 fallback emoji)
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

  // ────── 鳥族(3) ──────
  {
    id: 'feng-huang',
    name: '鳳凰',
    category: 'bird',
    description: '百鳥之王,五彩成文,浴火重生而不滅。',
    emoji: '🦚'
  },
  {
    id: 'bi-fang',
    name: '畢方',
    category: 'bird',
    description: '一足赤紋火鳥,不食五穀只食火。',
    emoji: '🔥'
  },
  {
    id: 'san-zu-wu',
    name: '三足烏',
    category: 'bird',
    description: '日中神鳥,三足象徵三光,居於太陽之中。',
    emoji: '🌞'
  },

  // ────── 招財類(3) ──────
  {
    id: 'qilin',
    name: '麒麟',
    category: 'lucky',
    description: '仁獸之首,不踐生草、不食生物,盛世現身。',
    emoji: '🦄'
  },
  {
    id: 'pixiu',
    name: '貔貅',
    category: 'lucky',
    description: '只進不出之獸,能吞天下財氣為己用。',
    emoji: '💰'
  },
  {
    id: 'bai-ze',
    name: '白澤',
    category: 'lucky',
    description: '通曉萬物之名與形,能避邪辟惡。',
    emoji: '📜'
  },

  // ────── 異獸(4) ──────
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
  {
    id: 'jiao-duan',
    name: '角端',
    category: 'beast',
    description: '能日行萬八千里、通四夷之語,識遠之獸。',
    emoji: '🦏'
  },
  {
    id: 'fei-lian',
    name: '飛廉',
    category: 'beast',
    description: '風伯,鹿身雀頭蛇尾,能召長風行於天地。',
    emoji: '💨'
  },

  // ────── 水族(3) ──────
  {
    id: 'he-luo',
    name: '何羅魚',
    category: 'aquatic',
    description: '一首十身之魚,聲如犬吠,食者無腫疾。',
    emoji: '🐡'
  },
  {
    id: 'kun',
    name: '鯤',
    category: 'aquatic',
    description: '北冥之巨魚,化而為鵬,扶搖直上九萬里。',
    emoji: '🐋'
  },
  {
    id: 'ba-she',
    name: '巴蛇',
    category: 'aquatic',
    description: '能吞象之大蛇,三歲而吐其骨。',
    emoji: '🐍'
  },

  // ────── 靈體(2) ──────
  {
    id: 'di-jiang',
    name: '帝江',
    category: 'spirit',
    description: '六足四翼,渾敦無面,識歌舞之神鳥。',
    emoji: '🎭'
  },
  {
    id: 'zhi',
    name: '彘',
    category: 'spirit',
    description: '虎身人面之獸,居於浮山,所見之地多風雨。',
    emoji: '🌪️'
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

