import type { CreatureSpecies, Pet } from '@/types';

/**
 * 50 隻原創上古神祇 — 涵蓋 14 個陣營(天界 / 魔界 / 自然界 / 冥界 / 佛界 等)。
 *
 * 設計:
 *  - id 用拼音 slug,對應 public/sprites/<id>.png 立繪檔名
 *  - category 直接用中文陣營名,UI 不需另做翻譯字典
 *  - description 取自設定主表的「背景故事」欄,精煉到 30~45 字
 *  - 黑化採方案甲(原寵物變色),所以這裡不放凶獸獨立種類
 */
export const CREATURES: CreatureSpecies[] = [
  // ────── 1-20:第一批(已上線) ──────
  {
    id: 'tai-chu-yan-jun',
    name: '太初炎君',
    category: '天界',
    description: '宇宙誕生時的第一道光,本體即一顆永恆燃燒的恆星,一念可鑄新星、可熄舊日。',
    emoji: '🔥',
    art: true
  },
  {
    id: 'tai-su-xuan-lu',
    name: '太素玄鹿',
    category: '天界',
    description: '執掌時間之冬的古老神祇,一聲哀鳴可凍結因果之河,令命運停擺。',
    emoji: '🦌',
    art: true
  },
  {
    id: 'wu-shi-zhi-die',
    name: '無始之蝶',
    category: '夢境界',
    description: '一翅是過去、一翅是未來,本體即是「當下」這一瞬,翩然之間萬古已逝。',
    emoji: '🦋',
    art: true
  },
  {
    id: 'wu-ji-jin-zun',
    name: '無極金尊',
    category: '佛界',
    description: '一蟾即一須彌山,鎮壓六道輪迴出口,不動如山,山即天道本身。',
    emoji: '🪙',
    art: true
  },
  {
    id: 'ji-zhi-ming',
    name: '寂之鳴',
    category: '天界',
    description: '至音為靜,一念可令萬籟歸無、令一切「聲音」從未存在過。',
    emoji: '🔔',
    art: true
  },
  {
    id: 'tai-xuan-zhi-zhu',
    name: '太玄之主',
    category: '冥界',
    description: '即「終結」本身,連光陰都無法逃脫其投下的陰影,死亡之意的具現。',
    emoji: '🌑',
    art: true
  },
  {
    id: 'yuan-shi-lei-ting',
    name: '原始雷霆',
    category: '天界',
    description: '是「規則」之雷,能誅心、誅念、誅道,違天理者一念皆滅。',
    emoji: '⚡',
    art: true
  },
  {
    id: 'wu-zi-zhi-long',
    name: '無字之龍',
    category: '天界',
    description: '鱗上無字、亦不立傳之古龍,沉默而至大,知者不言、言者不知。',
    emoji: '🐉',
    art: true
  },
  {
    id: 'heng-chun-zhi-gui',
    name: '恆春之龜',
    category: '自然界',
    description: '萬載恆春之神龜,殼負四時更迭,踏水生花,所至之處草木常青。',
    emoji: '🐢',
    art: true
  },
  {
    id: 'wu-xiang-zhi-hu',
    name: '無相之狐',
    category: '天界',
    description: '無有定相之狐妖,化萬形而不留痕跡,真身即「無」本身。',
    emoji: '🦊',
    art: true
  },
  {
    id: 'hong-meng-xue-huang',
    name: '鴻濛血皇',
    category: '魔界',
    description: '鴻濛初開之血祖,執赤光斬伐宿世罪業,血脈即萬魔之源。',
    emoji: '🩸',
    art: true
  },
  {
    id: 'tai-bai-jian-xian',
    name: '太白劍仙',
    category: '天界',
    description: '太白金星化身之劍仙,一劍開天三千里,劍意可斬星河。',
    emoji: '⚔️',
    art: true
  },
  {
    id: 'xuan-huang-di-mu',
    name: '玄黃地母',
    category: '自然界',
    description: '玄黃二色化生之地母,承載萬物根脈,地動則山河易容。',
    emoji: '🌍',
    art: true
  },
  {
    id: 'cang-ming-hai-zun',
    name: '滄溟海尊',
    category: '海界',
    description: '統御滄溟四海之尊,潮起潮落皆其呼吸,海眼即其雙瞳。',
    emoji: '🌊',
    art: true
  },
  {
    id: 'huang-quan-meng-po',
    name: '黃泉孟婆',
    category: '冥界',
    description: '司掌奈何橋之神尊,一碗湯洗盡前塵記憶,渡者皆忘所來。',
    emoji: '🍵',
    art: true
  },
  {
    id: 'zi-wei-tian-shu',
    name: '紫微天樞',
    category: '天界',
    description: '紫微帝星化身,執掌天樞,定群星位序,北斗皆其臣屬。',
    emoji: '⭐',
    art: true
  },
  {
    id: 'hong-meng-qin-zun',
    name: '鴻蒙琴尊',
    category: '天界',
    description: '撫鴻蒙古琴而現之尊,弦響一聲化山河,音律即天地秩序。',
    emoji: '🎵',
    art: true
  },
  {
    id: 'ye-huo-luo-cha',
    name: '業火羅剎',
    category: '魔界',
    description: '業火所煉之羅剎,焚一切貪嗔痴,赤焰之中無逃處。',
    emoji: '👹',
    art: true
  },
  {
    id: 'tai-xu-jing-jun',
    name: '太虛鏡君',
    category: '虛無界',
    description: '持太虛之鏡照見諸天,鏡中萬法皆空,唯空為實。',
    emoji: '🪞',
    art: true
  },
  {
    id: 'hong-jun-dao-zu',
    name: '鴻鈞道祖',
    category: '天界',
    description: '三清之師、道祖之尊,坐紫霄宮論道無極,演化萬靈之始。',
    emoji: '☯️',
    art: true
  },

  // ────── 21-50:第二批(新增) ──────
  {
    id: 'zhu-long-you-ming',
    name: '燭龍幽冥',
    category: '天界',
    description: '雙首之龍,睜眼為晝閉眼為夜,司掌晝夜更迭,呼為夏吹為冬。',
    emoji: '🕯️',
    art: true
  },
  {
    id: 'shi-tian-tao-tie',
    name: '噬天饕餮',
    category: '魔界',
    description: '上古凶獸之首,一張巨口可吞日月星辰,腹中藏永夜之淵。',
    emoji: '👁️',
    art: true
  },
  {
    id: 'cui-yu-luan-wang',
    name: '翠羽鸞王',
    category: '自然界',
    description: '翠羽鸞王,鳴聲一出,可解百毒、可化百邪,五色羽帶風生雷。',
    emoji: '🦚',
    art: true
  },
  {
    id: 'xuan-wu-bu-dong',
    name: '玄武不動',
    category: '天界',
    description: '北方守護聖獸,龜甲蛇尾,鎮守極北寒淵,寒龜一動天下崩。',
    emoji: '🐢',
    art: true
  },
  {
    id: 'lie-yang-huo-hou',
    name: '烈陽火犼',
    category: '魔界',
    description: '上古火犼,所到之處草木盡焚,連神仙坐騎都怕牠三分。',
    emoji: '🔥',
    art: true
  },
  {
    id: 'xue-po-bai-hu',
    name: '雪魄白虎',
    category: '天界',
    description: '西方守護聖獸,雪魄為魂,一嘯可凍千里,虎紋如冰川裂隙。',
    emoji: '🐯',
    art: true
  },
  {
    id: 'zhu-que-nie-pan',
    name: '朱雀涅槃',
    category: '天界',
    description: '南方守護聖獸,浴火重生,生生不息,死亡只是下次飛翔的前夜。',
    emoji: '🦩',
    art: true
  },
  {
    id: 'qing-long-yu-hai',
    name: '青龍御海',
    category: '天界',
    description: '東方守護聖獸,興雲布雨,執掌東海風浪,鱗光所及百川朝宗。',
    emoji: '🐉',
    art: true
  },
  {
    id: 'huang-lin-zhen-zhong',
    name: '黃麟鎮中',
    category: '天界',
    description: '中央守護聖獸,黃麟落地,四方歸定,蹄印之處再無紛爭。',
    emoji: '🦄',
    art: true
  },
  {
    id: 'jing-ge-shen-yuan',
    name: '鯨歌深淵',
    category: '海界',
    description: '深淵之底吟唱古歌的巨鯨,歌聲可引魂入海,千年只為一闋詞。',
    emoji: '🐋',
    art: true
  },
  {
    id: 'shan-jun-ban-lan',
    name: '山君斑斕',
    category: '自然界',
    description: '山林之王,一嘯震百獸,虎紋暗藏古老符文,履山如平地。',
    emoji: '🐅',
    art: true
  },
  {
    id: 'yin-yue-tian-lang',
    name: '銀月天狼',
    category: '夜界',
    description: '月光化身的銀狼,於滿月之夜化作星河奔騰,嗥聲動九天。',
    emoji: '🐺',
    art: true
  },
  {
    id: 'shi-ri-jin-wu',
    name: '蝕日金烏',
    category: '天界',
    description: '棲息於太陽中的三足神鳥,展翅可遮蔽日光,羽落即流星。',
    emoji: '🌞',
    art: true
  },
  {
    id: 'yu-tu-dao-yao',
    name: '玉兔搗藥',
    category: '月宮',
    description: '廣寒宮中為嫦娥搗藥的玉兔,持杵一搗萬病皆消。',
    emoji: '🐇',
    art: true
  },
  {
    id: 'lei-ze-ying-long',
    name: '雷澤應龍',
    category: '天界',
    description: '上古翼龍,助黃帝戰蚩尤,雷澤為其誕生之地,翅展即雷雨。',
    emoji: '🐲',
    art: true
  },
  {
    id: 'shen-lou-hai-yao',
    name: '蜃樓海妖',
    category: '海界',
    description: '深海之蜃,呼吸間吐出整座虛幻城池,迷者沉迷不知返。',
    emoji: '🏯',
    art: true
  },
  {
    id: 'shen-shu-yu-lei',
    name: '神荼鬱壘',
    category: '人界',
    description: '上古驅鬼之神,駐守鬼門,合體為雙首神獸,威鎮百鬼夜行。',
    emoji: '🛡️',
    art: true
  },
  {
    id: 'gu-chong-du-zun',
    name: '蠱蟲毒尊',
    category: '魔界',
    description: '南疆蠱師煉化千年的蟲皇,百毒以其為尊,一觸即化骨。',
    emoji: '🐛',
    art: true
  },
  {
    id: 'fen-tian-xie-hou',
    name: '焚天蠍后',
    category: '魔界',
    description: '西域沙海中的火焰女王,蠍尾一擊可融鐵化金,所過皆赤地。',
    emoji: '🦂',
    art: true
  },
  {
    id: 'han-yuan-bing-mang',
    name: '寒淵冰蟒',
    category: '極北',
    description: '極北寒淵中沉睡萬年的冰蟒,吐息即冰川,鱗下藏永夜。',
    emoji: '🐍',
    art: true
  },
  {
    id: 'lin-lu-qian-nian',
    name: '林鹿千年',
    category: '自然界',
    description: '森林深處沉睡千年的古鹿,角上花開花落即一春秋。',
    emoji: '🦌',
    art: true
  },
  {
    id: 'feng-huo-zhan-shi',
    name: '烽火戰豕',
    category: '魔界',
    description: '戰場之上的鋼鐵戰豬,鬃毛即軍旗,所過寸草不生。',
    emoji: '🐗',
    art: true
  },
  {
    id: 'wan-she-jiu-ying',
    name: '萬蛇九嬰',
    category: '魔界',
    description: '九首之蛇,口能吐火、能噴水、能放雷,堯帝親手所誅之凶。',
    emoji: '🐍',
    art: true
  },
  {
    id: 'tao-yuan-xian-yuan',
    name: '桃源仙猿',
    category: '天界',
    description: '守護蟠桃園的仙猿,食桃者長生不老,千年不出園一步。',
    emoji: '🐒',
    art: true
  },
  {
    id: 'yun-hai-cang-ying',
    name: '雲海蒼鷹',
    category: '天界',
    description: '雲海之巔的雷霆掠食者,雙翼一振即電光萬里,目光穿雲。',
    emoji: '🦅',
    art: true
  },
  {
    id: 'liu-li-hua-she',
    name: '琉璃化蛇',
    category: '天界',
    description: '通體琉璃的化蛇,游動時折射七彩光芒,可化萬物自身。',
    emoji: '💎',
    art: true
  },
  {
    id: 'gu-hun-ku-shou',
    name: '骨魂枯獸',
    category: '冥界',
    description: '千年枯骨凝聚而生的亡靈獸,執念不滅,戰至骨碎仍不退。',
    emoji: '💀',
    art: true
  },
  {
    id: 'xin-mo-shi-ying',
    name: '心魔噬影',
    category: '心魔界',
    description: '由修士心魔凝聚而成的暗影,無實體卻能撕碎神魂。',
    emoji: '🌫️',
    art: true
  },
  {
    id: 'lian-hua-jing-shi',
    name: '蓮華淨世',
    category: '佛界',
    description: '佛前蓮台所化之獸,所經之處淨化一切污穢業障。',
    emoji: '🪷',
    art: true
  },
  {
    id: 'tai-ji-liang-yi-shou',
    name: '太極兩儀獸',
    category: '道界',
    description: '陰陽分化前的最初混沌,黑白雙身共一靈,演化天地萬物。',
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

/**
 * 神獸顯示用名稱(階段 4A.2 改名儀式)。
 *  - 玩家有 `customName`(非空字串)→ 用 customName
 *  - 沒設 → 用 species.name(原名)
 *  - 連 species 都拿不到(資料 mismatch)→ '神獸' 兜底
 *
 * caller 慣例:在 PetInfoModal / Bestiary / log 等任何顯示神獸名字的地方,
 * 統一走這個 helper,不要直接用 species.name,避免某些地方忘記套 customName。
 */
export function getPetDisplayName(pet: Pet, species: CreatureSpecies | undefined): string {
  const trimmed = pet.customName?.trim();
  if (trimmed) return trimmed;
  return species?.name ?? '神獸';
}
