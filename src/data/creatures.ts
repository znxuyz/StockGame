import type { CreatureSpecies } from '@/types';

/**
 * 40 隻山海經神獸（隨機池版本）。
 *
 * 設計：
 *  - 黑化採方案甲（原寵物變色），所以這裡不放四凶獨立種類
 *  - 每隻都有 emoji 占位，正式美術 asset 進來後改用圖檔
 *  - description 在點擊寵物彈窗顯示
 */
export const CREATURES: CreatureSpecies[] = [
  // 四象（4）
  {
    id: 'azure-dragon',
    name: '青龍',
    category: 'four-symbols',
    description: '東方七宿之神，主木雷，象徵生發與貴氣。',
    emoji: '🐉'
  },
  {
    id: 'white-tiger',
    name: '白虎',
    category: 'four-symbols',
    description: '西方七宿之神，主金屬與威猛，鎮邪除厄。',
    emoji: '🐯'
  },
  {
    id: 'vermilion-bird',
    name: '朱雀',
    category: 'four-symbols',
    description: '南方七宿之神，主火與夏，火光朝天而鳴。',
    emoji: '🦩'
  },
  {
    id: 'black-tortoise',
    name: '玄武',
    category: 'four-symbols',
    description: '北方七宿之神，龜蛇合體，主水與壽。',
    emoji: '🐢'
  },

  // 龍族（5）
  {
    id: 'ying-long',
    name: '應龍',
    category: 'dragon',
    description: '有翼之龍，曾助黃帝戰蚩尤，能興雲致雨。',
    emoji: '🐲'
  },
  {
    id: 'zhu-long',
    name: '燭龍',
    category: 'dragon',
    description: '《山海經》西北鍾山之神，目開為晝、目閉為夜。',
    emoji: '🕯️'
  },
  {
    id: 'jiao-long',
    name: '蛟',
    category: 'dragon',
    description: '潛淵之龍，待千年化龍，水勢隨之而動。',
    emoji: '🌊'
  },
  {
    id: 'hui',
    name: '虺',
    category: 'dragon',
    description: '幼龍之態，五百年化蛟，再千年化龍。',
    emoji: '🐍'
  },
  {
    id: 'kui',
    name: '夔',
    category: 'dragon',
    description: '一足之雷獸，皮可作鼓，聲震百里。',
    emoji: '⚡'
  },

  // 鳥族（6）
  {
    id: 'feng-huang',
    name: '鳳凰',
    category: 'bird',
    description: '百鳥之王，五彩成文，浴火重生而不滅。',
    emoji: '🦚'
  },
  {
    id: 'luan-niao',
    name: '鸞鳥',
    category: 'bird',
    description: '見則天下安寧的瑞鳥，鳴聲合於五音。',
    emoji: '🐦'
  },
  {
    id: 'qing-niao',
    name: '青鳥',
    category: 'bird',
    description: '西王母之使，傳信千里、信而不疑。',
    emoji: '🐤'
  },
  {
    id: 'bi-fang',
    name: '畢方',
    category: 'bird',
    description: '一足赤紋火鳥，不食五穀只食火。',
    emoji: '🔥'
  },
  {
    id: 'zhong-ming',
    name: '重明鳥',
    category: 'bird',
    description: '雙瞳之鳥，可逐妖避禍，象徵明察秋毫。',
    emoji: '🦅'
  },
  {
    id: 'san-zu-wu',
    name: '三足烏',
    category: 'bird',
    description: '日中神鳥，三足象徵三光，居於太陽之中。',
    emoji: '🌞'
  },

  // 招財類（5）
  {
    id: 'qilin',
    name: '麒麟',
    category: 'lucky',
    description: '仁獸之首，不踐生草、不食生物，盛世現身。',
    emoji: '🦄'
  },
  {
    id: 'pixiu',
    name: '貔貅',
    category: 'lucky',
    description: '只進不出之獸，能吞天下財氣為己用。',
    emoji: '💰'
  },
  {
    id: 'bai-ze',
    name: '白澤',
    category: 'lucky',
    description: '通曉萬物之名與形，能避邪辟惡。',
    emoji: '📜'
  },
  {
    id: 'bi-xie',
    name: '辟邪',
    category: 'lucky',
    description: '貔貅族雌獸，鎮宅護財，不容邪氣近身。',
    emoji: '🛡️'
  },
  {
    id: 'tian-lu',
    name: '天祿',
    category: 'lucky',
    description: '貔貅族雄獸，主祿位俸祿，與辟邪雙生。',
    emoji: '🏆'
  },

  // 異獸（8）
  {
    id: 'nine-tail-fox',
    name: '九尾狐',
    category: 'beast',
    description: '青丘之獸，見則天下太平；亦能化人形迷惑諸侯。',
    emoji: '🦊'
  },
  {
    id: 'di-ting',
    name: '諦聽',
    category: 'beast',
    description: '地藏王坐騎，伏地聽聲，知世間真偽善惡。',
    emoji: '👂'
  },
  {
    id: 'kai-ming',
    name: '開明獸',
    category: 'beast',
    description: '崑崙之獸，九頭虎身人面，守天門八方。',
    emoji: '🗝️'
  },
  {
    id: 'zou-yu',
    name: '騶虞',
    category: 'beast',
    description: '白虎黑紋，仁獸之最，不食生物，其行至遠。',
    emoji: '🐅'
  },
  {
    id: 'bo',
    name: '駁',
    category: 'beast',
    description: '形如白馬而能食虎豹，鋸牙之奇獸。',
    emoji: '🐎'
  },
  {
    id: 'lu-wu',
    name: '陸吾',
    category: 'beast',
    description: '崑崙山神，虎身九尾人面虎爪，主天之九部及帝苑。',
    emoji: '🌄'
  },
  {
    id: 'ying-zhao',
    name: '英招',
    category: 'beast',
    description: '槐江之山神，馬身人面虎紋鳥翼，巡天下。',
    emoji: '🌬️'
  },
  {
    id: 'ru-shou',
    name: '蓐收',
    category: 'beast',
    description: '西方秋金之神，左耳有蛇，乘兩龍而行。',
    emoji: '🍂'
  },

  // 水族（5）
  {
    id: 'kun',
    name: '鯤',
    category: 'aquatic',
    description: '北冥之巨魚，化而為鵬，扶搖直上九萬里。',
    emoji: '🐋'
  },
  {
    id: 'heng-gong',
    name: '橫公魚',
    category: 'aquatic',
    description: '夜化人形入水，聲如人鳴，食之可避瘟。',
    emoji: '🐟'
  },
  {
    id: 'wen-yao',
    name: '文鰩魚',
    category: 'aquatic',
    description: '魚身鳥翼，夜飛而行，鳴聲如鸞。',
    emoji: '🐠'
  },
  {
    id: 'he-luo',
    name: '何羅魚',
    category: 'aquatic',
    description: '一首十身之魚，聲如犬吠，食者無腫疾。',
    emoji: '🐡'
  },
  {
    id: 'lu',
    name: '鯥',
    category: 'aquatic',
    description: '魚身蛇尾、鳥翼牛肋，冬死夏生，食之無瘧。',
    emoji: '🦎'
  },

  // 靈體（3）
  {
    id: 'di-jiang',
    name: '帝江',
    category: 'spirit',
    description: '六足四翼，渾敦無面，識歌舞之神鳥。',
    emoji: '🎭'
  },
  {
    id: 'qi-tu',
    name: '鵸鵌',
    category: 'spirit',
    description: '三首六尾之鳥，食之可使人不夢魘。',
    emoji: '✨'
  },
  {
    id: 'zhi',
    name: '彘',
    category: 'spirit',
    description: '虎身人面之獸，居於浮山，所見之地多風雨。',
    emoji: '🌪️'
  },

  // 神話（4）
  {
    id: 'fei-lian',
    name: '飛廉',
    category: 'beast',
    description: '風伯，鹿身雀頭蛇尾，能召長風行於天地。',
    emoji: '💨'
  },
  {
    id: 'jiao-duan',
    name: '角端',
    category: 'beast',
    description: '能日行萬八千里、通四夷之語，識遠之獸。',
    emoji: '🦏'
  },
  {
    id: 'ba-she',
    name: '巴蛇',
    category: 'aquatic',
    description: '能吞象之大蛇，三歲而吐其骨。',
    emoji: '🐲'
  },
  {
    id: 'zhu-yan',
    name: '朱厭',
    category: 'beast',
    description: '小頭赤足之白獸，現則天下大兵。',
    emoji: '🩸'
  }
];

/** 透過 id 取得神獸定義（找不到回傳 undefined） */
export function getCreature(id: string): CreatureSpecies | undefined {
  return CREATURES.find((c) => c.id === id);
}

/** 隨機抽一隻神獸（買新檔股票時使用） */
export function pickRandomCreature(): CreatureSpecies {
  const idx = Math.floor(Math.random() * CREATURES.length);
  return CREATURES[idx];
}
