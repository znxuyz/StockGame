import type { CreatureSpecies } from '@/types';

/**
 * 20 隻精選神獸(10 山海經 + 10 原創)。
 *
 * 設計:
 *  - 山海經 10 隻按輪廓辨識度精選,每隻有獨特剪影
 *  - 原創 10 隻補強差異化(部分扣股票主題)
 *  - 黑化採方案甲(原寵物變色),所以這裡不放四凶獨立種類
 *  - 美術 prompt / 視覺特徵在 scripts/gen-art-prompts.mjs 集中管理
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
  },

  // ────── 原創(10) ──────
  {
    id: 'suanpan-shou',
    name: '算盤獸',
    category: 'lucky',
    description: '由八列算珠化成的小獸,木框為身、流蘇為腿,撥動之聲合於市井節律。',
    emoji: '🧮'
  },
  {
    id: 'yinzhang-ling',
    name: '印章靈',
    category: 'lucky',
    description: '朱紅印章化生的精靈,底刻篆文,所至之處皆顯印記。',
    emoji: '🪧'
  },
  {
    id: 'qian-gui',
    name: '錢龜',
    category: 'lucky',
    description: '殼由方孔銅錢層疊而成,每行步履皆吐財氣,富商護宅之獸。',
    emoji: '💴'
  },
  {
    id: 'bi-hu',
    name: '筆狐',
    category: 'beast',
    description: '書齋之狐,身由筆觸聚成,尾即一枝毛筆,行走處留墨痕。',
    emoji: '🖌️'
  },
  {
    id: 'bianzhong-shou',
    name: '編鐘獸',
    category: 'beast',
    description: '身懸數十青銅編鐘,鐘架為腿,奔走則自鳴於山谷。',
    emoji: '🔔'
  },
  {
    id: 'denglong-yu',
    name: '燈籠魚',
    category: 'aquatic',
    description: '元宵節走水之魚,魚身上頂紅紙燈籠,燭光透出宛若海中小月。',
    emoji: '🏮'
  },
  {
    id: 'qi-ling',
    name: '棋靈',
    category: 'spirit',
    description: '黑白圍棋子聚成之靈,半黑半白合抱而行,思敏如局中老叟。',
    emoji: '♟️'
  },
  {
    id: 'lianhua-shou',
    name: '蓮華獸',
    category: 'spirit',
    description: '蓮花重瓣化身,蓮藕為腿、花粉為光,所至之處水靜不波。',
    emoji: '🪷'
  },
  {
    id: 'shan-tong',
    name: '山童',
    category: 'spirit',
    description: '由石塊與松枝拼合而成的童子,山峰為冠、雲為披風,山行如御風。',
    emoji: '⛰️'
  },
  {
    id: 'tao-jing',
    name: '桃精',
    category: 'spirit',
    description: '三千年蟠桃化生之精,桃花為鬃、桃葉為翅,得之者壽。',
    emoji: '🍑'
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
