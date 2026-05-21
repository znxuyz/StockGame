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
  },
  // ────── 51-294:第二批(244 隻擴充,階段 6.X)──────
  {
    id: 'ying-an-yan-jun',
    name: '影闇魘君',
    category: '魔界',
    description: '棲於日月之陰的暗夜獵手,所過之地光不能照、聲不能傳。',
    emoji: '👹',
    art: true
  },
  {
    id: 'e-meng-luo-sha',
    name: '噩夢羅剎',
    category: '魔界',
    description: '夜叉夢使,凡其入夢者皆永不能醒,只在夢中被吞噬殆盡。',
    emoji: '👹',
    art: true
  },
  {
    id: 'qian-zu-xie-po',
    name: '千詛邪婆',
    category: '魔界',
    description: '編織詛咒之線的三眼妖巫,凡被她記住名字者,命運將永世糾纏。',
    emoji: '👹',
    art: true
  },
  {
    id: 'shi-fu-fen-shou',
    name: '屍腐墳獸',
    category: '魔界',
    description: '古戰場上由屍氣孕育的鬣狗,專啃食將死者的執念與兵器。',
    emoji: '👹',
    art: true
  },
  {
    id: 'rao-mei-jiu-wei',
    name: '嬈魅九尾',
    category: '魔界',
    description: '妲己之姊,九尾如九縷情絲,凡見其顏者三日內神魂顛倒。',
    emoji: '👹',
    art: true
  },
  {
    id: 'hei-si-wen-jun',
    name: '黑死瘟君',
    category: '魔界',
    description: '鴉首人身的瘟疫之主,翼下飄落的黑羽即是萬國之災。',
    emoji: '👹',
    art: true
  },
  {
    id: 'suo-hun-fu-mo',
    name: '鎖魂縛魔',
    category: '魔界',
    description: '地獄獄卒,身纏萬條魂鎖,凡被其鎖中者,神識永困於此身。',
    emoji: '👹',
    art: true
  },
  {
    id: 'jia-mian-qi-shen',
    name: '假面欺神',
    category: '魔界',
    description: '萬面同身的詐術之神,千萬假面下無人知其真容。',
    emoji: '👹',
    art: true
  },
  {
    id: 'shi-xue-ye-bo-jue',
    name: '嗜血夜伯爵',
    category: '魔界',
    description: '永夜之主,血為其酒、月為其燈,千年以來只在月圓夜現世狩獵。',
    emoji: '👹',
    art: true
  },
  {
    id: 'yuan-nian-wu-gui',
    name: '怨念武鬼',
    category: '魔界',
    description: '戰死沙場卻不肯瞑目的武者亡魂,刀未斷則仇未消。',
    emoji: '👹',
    art: true
  },
  {
    id: 'tu-lu-zhan-wang',
    name: '屠戮戰王',
    category: '魔界',
    description: '戰場屠夫,渾身戰甲皆敗將之骨所鑄,以萬人性命淬煉戰意。',
    emoji: '👹',
    art: true
  },
  {
    id: 'ji-du-qi-shou-she',
    name: '嫉妒七首蛇',
    category: '魔界',
    description: '七首相互嫉妒、彼此撕咬不息的怨念之蛇,所盯之物終將腐朽。',
    emoji: '👹',
    art: true
  },
  {
    id: 'wan-mo-zhi-zu',
    name: '萬魔之祖',
    category: '魔界',
    description: '諸魔之祖,一念可生千魔,一怒可裂萬界。',
    emoji: '👹',
    art: true
  },
  {
    id: 'qian-nian-shu-ling',
    name: '千年樹靈',
    category: '自然界',
    description: '紮根於世界中央的萬年神木,根繫八荒、葉覆九州。',
    emoji: '🌿',
    art: true
  },
  {
    id: 'shan-jun-yan-ju',
    name: '山君岩巨',
    category: '自然界',
    description: '一座會走的山,踏步即裂大地,山風隨其呼吸。',
    emoji: '🌿',
    art: true
  },
  {
    id: 'si-ji-lun-hui-lu',
    name: '四季輪迴鹿',
    category: '自然界',
    description: '其角隨四時更替,春發新芽、夏覆綠葉、秋染金黃、冬披白雪。',
    emoji: '🌿',
    art: true
  },
  {
    id: 'lei-yu-yun-ju',
    name: '雷雨雲駒',
    category: '自然界',
    description: '雲彩凝成的天馬,踏蹄即雷、嘶鳴即雨,農夫求之以解旱災。',
    emoji: '🌿',
    art: true
  },
  {
    id: 'bai-hua-xian-die',
    name: '百花仙蝶',
    category: '自然界',
    description: '其翼為百花拼成,展翅即落英繽紛、十里花香。',
    emoji: '🌿',
    art: true
  },
  {
    id: 'feng-yun-lang-wang',
    name: '風雲狼王',
    category: '自然界',
    description: '北疆風雲之子,一聲長嘯可呼來千里之外的風雲變色。',
    emoji: '🌿',
    art: true
  },
  {
    id: 'di-mai-chi-gui',
    name: '地脈赤龜',
    category: '自然界',
    description: '掌管大地經脈的赤甲神龜,其背紋即九州地圖。',
    emoji: '🌿',
    art: true
  },
  {
    id: 'cui-yu-kong-que-wang',
    name: '翠羽孔雀王',
    category: '自然界',
    description: '羽翎七彩流光,展屏一現可使方圓百里草木傾向。',
    emoji: '🌿',
    art: true
  },
  {
    id: 'xing-wen-bao',
    name: '星紋豹',
    category: '自然界',
    description: '皮毛綴滿星辰,夜行時與星空融為一體,獵人傳說中只見其眼。',
    emoji: '🌿',
    art: true
  },
  {
    id: 'xi-he-li-jing',
    name: '溪河鯉精',
    category: '自然界',
    description: '溪流中修行千年的錦鯉精,躍龍門前是少女、躍後是龍。',
    emoji: '🌿',
    art: true
  },
  {
    id: 'jing-ji-mei-kuai-shou',
    name: '荊棘玫塊獸',
    category: '自然界',
    description: '玫塊精靈的化身,身披百年荊棘鎧,觸之者皆見血。',
    emoji: '🌿',
    art: true
  },
  {
    id: 'feng-chao-weng-wang',
    name: '蜂巢嗡王',
    category: '自然界',
    description: '一身藏萬蜂的蜂王,其體即移動的巨大蜂巢。',
    emoji: '🌿',
    art: true
  },
  {
    id: 'xue-yu-bai-xiong',
    name: '雪域白熊',
    category: '自然界',
    description: '雪山之主,毛皮如冰雪、咆哮可掀雪崩。',
    emoji: '🌿',
    art: true
  },
  {
    id: 'tu-di-zhi-mu',
    name: '土地之母',
    category: '自然界',
    description: '萬物之母,膚色如沃土、髮如稻穗,凡踏其裳者皆能豐收。',
    emoji: '🌿',
    art: true
  },
  {
    id: 'wu-cai-miao-feng',
    name: '五彩苗鳳',
    category: '自然界',
    description: '五行之氣孕育的幼鳳,雖未長成卻已能淨化邪氣。',
    emoji: '🌿',
    art: true
  },
  {
    id: 'qing-zhang-yun-bao',
    name: '青嶂雲豹',
    category: '自然界',
    description: '雲嶺深處的霧獸,身披雲霧如披紗,行於山脊不留痕跡。',
    emoji: '🌿',
    art: true
  },
  {
    id: 'yin-lu-qing-deng',
    name: '引路青燈',
    category: '冥界',
    description: '黃泉路上的引魂燈,凡其光所至,亡魂方知歸途。',
    emoji: '💀',
    art: true
  },
  {
    id: 'wang-chuan-du-fu',
    name: '忘川渡夫',
    category: '冥界',
    description: '忘川河上的渡夫,他的船載過億萬亡魂,卻無人記得他的臉。',
    emoji: '💀',
    art: true
  },
  {
    id: 'yan-luo-pan-guan',
    name: '閻羅判官',
    category: '冥界',
    description: '十殿閻王之下的判官,左手生死簿、右手硃砂筆,一筆定人壽夭。',
    emoji: '💀',
    art: true
  },
  {
    id: 'bai-wu-chang-gou-hun',
    name: '白無常勾魂',
    category: '冥界',
    description: '頭戴高帽、長舌垂胸的白衣鬼差,凡見其者皆命不久矣。',
    emoji: '💀',
    art: true
  },
  {
    id: 'hei-wu-chang-suo-ming',
    name: '黑無常索命',
    category: '冥界',
    description: '與白無常成對的黑衣鬼差,夜行勾魂、無聲無息。',
    emoji: '💀',
    art: true
  },
  {
    id: 'huang-quan-bi-an-hua',
    name: '黃泉彼岸花',
    category: '冥界',
    description: '黃泉路旁盛開不謝的紅花,花葉永不相見,如生死兩隔之人。',
    emoji: '💀',
    art: true
  },
  {
    id: 'hun-huo-piao-deng',
    name: '魂火飄燈',
    category: '冥界',
    description: '荒野中無主的魂火,飄至何處便將該處的活物引向冥途。',
    emoji: '💀',
    art: true
  },
  {
    id: 'hai-gu-jiang-jun',
    name: '骸骨將軍',
    category: '冥界',
    description: '冥府陰兵之將,千年前戰死沙場,如今率千萬白骨再上戰場。',
    emoji: '💀',
    art: true
  },
  {
    id: 'lun-hui-shu',
    name: '輪迴鼠',
    category: '冥界',
    description: '六道輪迴的見證者,其毛有六色,代表六道眾生。',
    emoji: '💀',
    art: true
  },
  {
    id: 'meng-po-tang-lu',
    name: '孟婆湯爐',
    category: '冥界',
    description: '盛湯的銅爐自有靈,日夜煮著忘卻之湯,引魂飲下、來世重來。',
    emoji: '💀',
    art: true
  },
  {
    id: 'yin-feng-li-gui',
    name: '陰風厲鬼',
    category: '冥界',
    description: '冤死的女鬼,長髮垂地、面色慘白,陰風起處便是她現身之時。',
    emoji: '💀',
    art: true
  },
  {
    id: 'wu-dao-lun-pan',
    name: '五道輪盤',
    category: '冥界',
    description: '六道輪迴的縮影,輪轉一次便是億萬眾生的生死更替。',
    emoji: '💀',
    art: true
  },
  {
    id: 'you-ming-quan',
    name: '幽冥犬',
    category: '冥界',
    description: '冥府入口的守門犬,三首六眼,日夜不眠。',
    emoji: '💀',
    art: true
  },
  {
    id: 'zhi-qian-die-wu',
    name: '紙錢蝶舞',
    category: '冥界',
    description: '冥府收到的紙錢化為千萬蝴蝶,在墓園飛舞。',
    emoji: '💀',
    art: true
  },
  {
    id: 'ye-you-xun-shen',
    name: '夜遊巡神',
    category: '冥界',
    description: '夜行於人間的巡查神,記下夜半作惡之徒,黎明前送往冥府。',
    emoji: '💀',
    art: true
  },
  {
    id: 'xue-lian-lun-hui-seng',
    name: '血蓮輪迴僧',
    category: '冥界',
    description: '在血河中修成正果的亡僧,以血肉為蓮、以亡魂為徒。',
    emoji: '💀',
    art: true
  },
  {
    id: 'huan-hun-die-yu',
    name: '幻魂蝶語',
    category: '冥界',
    description: '亡者的低語化為紫色蝶群,在月夜傳達遺言。',
    emoji: '💀',
    art: true
  },
  {
    id: 'yan-luo-tian-zi',
    name: '閻羅天子',
    category: '冥界',
    description: '十殿閻羅之首,執掌生死簿,一筆勾消、一筆增壽。',
    emoji: '💀',
    art: true
  },
  {
    id: 'shan-hu-long-hou',
    name: '珊瑚龍后',
    category: '海界',
    description: '珊瑚之主,周身百花綻放、珊瑚為冠、海族為臣。',
    emoji: '🌊',
    art: true
  },
  {
    id: 'shen-yuan-an-kang-wang',
    name: '深淵鮟鱇王',
    category: '海界',
    description: '萬丈深淵的霸主,額前一燈引獵物入腹,千年來無一逃脫。',
    emoji: '🌊',
    art: true
  },
  {
    id: 'qi-cai-zhen-zhu-bei',
    name: '七彩珍珠貝',
    category: '海界',
    description: '海底千年大蚌,腹中孕育七色珍珠,光華可洗滌穢氣。',
    emoji: '🌊',
    art: true
  },
  {
    id: 'zhang-yu-mo-huang',
    name: '章魚墨皇',
    category: '海界',
    description: '深海章魚之王,一噴墨可染黑半個海域,觸手所至無一可逃。',
    emoji: '🌊',
    art: true
  },
  {
    id: 'sha-hun-xiong-sha',
    name: '鯊魂凶鯊',
    category: '海界',
    description: '深海食物鏈之顛,血腥味從千里之外亦能嗅得。',
    emoji: '🌊',
    art: true
  },
  {
    id: 'hai-xing-wu-ji',
    name: '海星舞姬',
    category: '海界',
    description: '深海中翩翩起舞的海星精靈,五腕如綢、千舞萬姿。',
    emoji: '🌊',
    art: true
  },
  {
    id: 'shui-mu-piao-ying',
    name: '水母飄影',
    category: '海界',
    description: '飄盪於月光下的透明水母,觸鬚所及之物盡皆麻痺。',
    emoji: '🌊',
    art: true
  },
  {
    id: 'hai-she-jiu-wan',
    name: '海蛇九灣',
    category: '海界',
    description: '海中九首之蛇,身曲九灣、每灣藏一漩渦。',
    emoji: '🌊',
    art: true
  },
  {
    id: 'hai-luo-hao-jiao',
    name: '海螺號角',
    category: '海界',
    description: '召喚海族的神聖海螺,吹響之時萬海齊鳴。',
    emoji: '🌊',
    art: true
  },
  {
    id: 'hai-wang-bo-sai-dong',
    name: '海王波塞冬',
    category: '海界',
    description: '四海之主,三叉戟一揮可掀百丈巨浪。',
    emoji: '🌊',
    art: true
  },
  {
    id: 'yu-lin-jian-shi',
    name: '魚鱗劍士',
    category: '海界',
    description: '修煉成精的鯉魚,化形後背負海劍,在浪間穿梭。',
    emoji: '🌊',
    art: true
  },
  {
    id: 'shen-hai-fa-guang-xie',
    name: '深海發光蟹',
    category: '海界',
    description: '深海中發光的甲蟹,牠的光是萬米深淵裡唯一的星辰。',
    emoji: '🌊',
    art: true
  },
  {
    id: 'hai-kui-mi-meng',
    name: '海葵迷夢',
    category: '海界',
    description: '海底盛開的海葵精靈,觸鬚輕拂便令路過的小魚陷入夢中。',
    emoji: '🌊',
    art: true
  },
  {
    id: 'jing-ge-hui-yin',
    name: '鯨歌迴音',
    category: '海界',
    description: '深海中歌唱的母鯨,歌聲跨越千里,撫平所有海域的傷痛。',
    emoji: '🌊',
    art: true
  },
  {
    id: 'hai-ma-wang-zi',
    name: '海馬王子',
    category: '海界',
    description: '海中騎士,身披藍金鎧甲,以浪為韁、以泡為箭。',
    emoji: '🌊',
    art: true
  },
  {
    id: 'huan-xiang-ren-yu',
    name: '幻象人魚',
    category: '海界',
    description: '海上迷霧中歌唱的人魚,凡船員聽其歌者皆迷航葬身海底。',
    emoji: '🌊',
    art: true
  },
  {
    id: 'wu-zei-pen-mo',
    name: '烏賊噴墨',
    category: '海界',
    description: '海中的隱士,危難時噴墨遁去,千年來無人見其真容。',
    emoji: '🌊',
    art: true
  },
  {
    id: 'si-hai-long-wang',
    name: '四海龍王',
    category: '海界',
    description: '東海青、南海紅、西海白、北海黑,四海龍王合而為一。',
    emoji: '🌊',
    art: true
  },
  {
    id: 'ba-bi-ming-wang',
    name: '八臂明王',
    category: '佛界',
    description: '東方執金剛之尊,八臂分執法器,降伏一切邪魔。',
    emoji: '🪷',
    art: true
  },
  {
    id: 'qian-shou-guan-yin',
    name: '千手觀音',
    category: '佛界',
    description: '聞聲救苦的觀世音,千手千眼,普度眾生。',
    emoji: '🪷',
    art: true
  },
  {
    id: 'lian-tai-jin-gang',
    name: '蓮台金剛',
    category: '佛界',
    description: '坐於蓮台的金剛護法,持杵立於山岳之上,百邪不侵。',
    emoji: '🪷',
    art: true
  },
  {
    id: 'bai-xiang-pu-xian-zuo',
    name: '白象普賢座',
    category: '佛界',
    description: '普賢菩薩的座騎,白象六牙、行止有法,所行之處皆生蓮花。',
    emoji: '🪷',
    art: true
  },
  {
    id: 'jin-shi-wen-shu-zuo',
    name: '金獅文殊座',
    category: '佛界',
    description: '文殊菩薩的座騎,金毛獅子,口吐智慧之劍。',
    emoji: '🪷',
    art: true
  },
  {
    id: 'bai-lian-jing-nv',
    name: '白蓮淨女',
    category: '佛界',
    description: '蓮花精靈,身著白衣、足踏蓮花,淨化一切污穢。',
    emoji: '🪷',
    art: true
  },
  {
    id: 'jing-zhou-kong-que-ming-wang',
    name: '經咒孔雀明王',
    category: '佛界',
    description: '孔雀明王,口誦真言、羽落驅毒,百毒不侵。',
    emoji: '🪷',
    art: true
  },
  {
    id: 'ga-lan-zi-pao',
    name: '伽藍紫袍',
    category: '佛界',
    description: '佛寺的守護神,持青龍偃月刀,凡僧侶之地皆其守護。',
    emoji: '🪷',
    art: true
  },
  {
    id: 'bo-ruo-luo-han',
    name: '波若羅漢',
    category: '佛界',
    description: '羅漢之中以智慧著稱者,白眉長至腰、目藏宇宙。',
    emoji: '🪷',
    art: true
  },
  {
    id: 'yan-kou-e-gui-du-hua',
    name: '焰口餓鬼度化',
    category: '佛界',
    description: '焰口菩薩化身,為餓鬼施食,救渡萬千飢魂。',
    emoji: '🪷',
    art: true
  },
  {
    id: 'mi-lei-xiao-bu-dai',
    name: '彌勒笑布袋',
    category: '佛界',
    description: '彌勒佛的化身,大肚能容、笑口常開,袋裡藏著億萬法寶。',
    emoji: '🪷',
    art: true
  },
  {
    id: 'xin-jing-hu-fa-long',
    name: '心經護法龍',
    category: '佛界',
    description: '盤旋於心經之上的金龍,經文所至、護龍隨行。',
    emoji: '🪷',
    art: true
  },
  {
    id: 'fan-yin-die-yu',
    name: '梵音蝶語',
    category: '佛界',
    description: '誦經時飛來的蝴蝶,翼上有經文,飛行軌跡即真言。',
    emoji: '🪷',
    art: true
  },
  {
    id: 'qi-bao-fa-shen',
    name: '七寶法身',
    category: '佛界',
    description: '由七寶幻化的法身,金銀琉璃硨磲瑪瑙真珠玫瑰七色齊放。',
    emoji: '🪷',
    art: true
  },
  {
    id: 'di-zang-tong-zi',
    name: '地藏童子',
    category: '佛界',
    description: '地藏王菩薩的隨身童子,持錫杖、頂明珠,渡化地獄眾生。',
    emoji: '🪷',
    art: true
  },
  {
    id: 'bai-san-gai-fu-mu',
    name: '白傘蓋佛母',
    category: '佛界',
    description: '頂上撐起白傘的佛母,傘下無災、無疾、無厄。',
    emoji: '🪷',
    art: true
  },
  {
    id: 'jiang-mo-chu-bu-dong',
    name: '降魔杵不動',
    category: '佛界',
    description: '不動明王手持降魔杵,坐於磐石、烈焰焚天。',
    emoji: '🪷',
    art: true
  },
  {
    id: 'chan-ding-shi-fu',
    name: '禪定石佛',
    category: '佛界',
    description: '萬年禪定的石佛,移山填海亦不能動其分毫。',
    emoji: '🪷',
    art: true
  },
  {
    id: 'ru-lai-fo-zu',
    name: '如來佛祖',
    category: '佛界',
    description: '萬法之源,五指即五行山,十方諸佛皆其分身。',
    emoji: '🪷',
    art: true
  },
  {
    id: 'zhi-meng-zhu-niang',
    name: '織夢蛛娘',
    category: '夢境界',
    description: '在夢境之中織就千萬好夢的少女,絲線串起所有人的夢。',
    emoji: '💫',
    art: true
  },
  {
    id: 'die-meng-zhuang-zhou',
    name: '蝶夢莊周',
    category: '夢境界',
    description: '化作蝴蝶的莊周,還是夢見蝴蝶的莊周?',
    emoji: '💫',
    art: true
  },
  {
    id: 'xing-sha-meng-shou',
    name: '星沙夢獸',
    category: '夢境界',
    description: '由星塵與夢境共同凝結的奇獸,身體流動如銀河。',
    emoji: '💫',
    art: true
  },
  {
    id: 'meng-yan-shi-zhe',
    name: '夢魘食者',
    category: '夢境界',
    description: '專吃噩夢的奇獸,凡有噩夢之人睡前便會喚牠來。',
    emoji: '💫',
    art: true
  },
  {
    id: 'huan-xiang-lu',
    name: '幻象鹿',
    category: '夢境界',
    description: '只在夢中出現的透明鹿,腳印是夢的入口。',
    emoji: '💫',
    art: true
  },
  {
    id: 'meng-he-pao-ying',
    name: '夢河泡影',
    category: '夢境界',
    description: '在夢河中飄盪的泡影,每個泡裡都是一個未完的夢。',
    emoji: '💫',
    art: true
  },
  {
    id: 'wo-mian-zhen-shou',
    name: '臥眠枕獸',
    category: '夢境界',
    description: '人們所枕的枕頭,經年累月吸納睡眠氣息而成的小獸。',
    emoji: '💫',
    art: true
  },
  {
    id: 'meng-lan-jing',
    name: '夢藍鯨',
    category: '夢境界',
    description: '在夢之天空中遨遊的巨鯨,牠唱的歌即是世人的好夢。',
    emoji: '💫',
    art: true
  },
  {
    id: 'qi-cai-meng-long',
    name: '七彩夢龍',
    category: '夢境界',
    description: '夢之七色凝結的飛龍,翔於夢境天空,所過之處夢境變色。',
    emoji: '💫',
    art: true
  },
  {
    id: 'meng-zhong-zhi-zhe',
    name: '夢中織者',
    category: '夢境界',
    description: '在夢中為所有人編織命運之網的少女。',
    emoji: '💫',
    art: true
  },
  {
    id: 'meng-zhong-ying-mao',
    name: '夢中影貓',
    category: '夢境界',
    description: '只在夢中現身的黑貓,綠眼是通往夢境的入口。',
    emoji: '💫',
    art: true
  },
  {
    id: 'meng-lu-zhu-jing',
    name: '夢露珠精',
    category: '夢境界',
    description: '清晨葉尖的露珠精靈,每滴露中藏著前夜的夢。',
    emoji: '💫',
    art: true
  },
  {
    id: 'meng-zhong-ge-ji',
    name: '夢中歌姬',
    category: '夢境界',
    description: '夢中的歌者,歌聲流轉於夢與現實之間。',
    emoji: '💫',
    art: true
  },
  {
    id: 'duo-mian-meng-yan',
    name: '多面夢魘',
    category: '夢境界',
    description: '夢魘的本體,千張面具下無人見過真容。',
    emoji: '💫',
    art: true
  },
  {
    id: 'meng-zhong-zhi-shen',
    name: '夢中之神',
    category: '夢境界',
    description: '掌管所有夢境的神祇,凡人入眠即入其領域。',
    emoji: '💫',
    art: true
  },
  {
    id: 'meng-zhong-hai-tong',
    name: '夢中孩童',
    category: '夢境界',
    description: '夢中保留的童年純真化身,笑聲驅散夢魘。',
    emoji: '💫',
    art: true
  },
  {
    id: 'meng-zhong-wu-ya',
    name: '夢中烏鴉',
    category: '夢境界',
    description: '飛在夢境邊緣的黑鴉,傳遞著夢的預兆。',
    emoji: '💫',
    art: true
  },
  {
    id: 'meng-he-du-mu-zhou',
    name: '夢河獨木舟',
    category: '夢境界',
    description: '在夢河上漂盪的無主小舟,凡迷夢者乘之可歸。',
    emoji: '💫',
    art: true
  },
  {
    id: 'meng-zhong-pen-jing',
    name: '夢中盆景',
    category: '夢境界',
    description: '夢中那盆會自己生長的盆景,每根枝葉都是一個小夢境。',
    emoji: '💫',
    art: true
  },
  {
    id: 'meng-zhi-chu-xing',
    name: '夢之初醒',
    category: '夢境界',
    description: '夢醒一瞬的化身,從夢中清醒、轉識成智的剎那。',
    emoji: '💫',
    art: true
  },
  {
    id: 'jing-mian-wu-xiang',
    name: '鏡面無相',
    category: '虛無界',
    description: '一身鏡面之獸,所見之物皆映於其體,而自身無相無形。',
    emoji: '🌀',
    art: true
  },
  {
    id: 'ba-mian-ji-he-shou',
    name: '八面幾何獸',
    category: '虛無界',
    description: '虛空中漂浮的幾何體,八面流轉,理性而冰冷。',
    emoji: '🌀',
    art: true
  },
  {
    id: 'fan-wu-zhi-shou',
    name: '反物質獸',
    category: '虛無界',
    description: '由反物質構成的不穩定獸形,觸碰即湮滅。',
    emoji: '🌀',
    art: true
  },
  {
    id: 'hun-dun-qian-shou',
    name: '混沌前獸',
    category: '虛無界',
    description: '宇宙誕生之前的存在,無形無相、無始無終。',
    emoji: '🌀',
    art: true
  },
  {
    id: 'kong-bai-zhi-shou',
    name: '空白之獸',
    category: '虛無界',
    description: '只有輪廓沒有實體的獸,如同未完成的草稿。',
    emoji: '🌀',
    art: true
  },
  {
    id: 'ling-dian-zhi-zi',
    name: '零點之子',
    category: '虛無界',
    description: '宇宙的零點化身,一切從牠開始、一切回歸於牠。',
    emoji: '🌀',
    art: true
  },
  {
    id: 'li-fang-xu-huang',
    name: '立方虛皇',
    category: '虛無界',
    description: '統治虛無的立方體,內部容納無限可能。',
    emoji: '🌀',
    art: true
  },
  {
    id: 'mo-bi-wu-si-shou',
    name: '莫比烏斯獸',
    category: '虛無界',
    description: '單面的環獸,沒有開始也沒有結束。',
    emoji: '🌀',
    art: true
  },
  {
    id: 'liang-zi-die-jia-mao',
    name: '量子疊加貓',
    category: '虛無界',
    description: '同時存在又不存在的貓,觀測時才會塌縮為一種狀態。',
    emoji: '🌀',
    art: true
  },
  {
    id: 'jing-zhong-dao-ying',
    name: '鏡中倒影',
    category: '虛無界',
    description: '鏡中的倒影成精,只在鏡的另一側存在。',
    emoji: '🌀',
    art: true
  },
  {
    id: 'fen-xing-di-hui-long',
    name: '分形遞迴龍',
    category: '虛無界',
    description: '由分形數學構成的龍,身體無限細分,每層都是完整的牠。',
    emoji: '🌀',
    art: true
  },
  {
    id: 'xu-kong-jing',
    name: '虛空鯨',
    category: '虛無界',
    description: '飛在虛空中的巨鯨,體內裝著被牠吞下的整個宇宙。',
    emoji: '🌀',
    art: true
  },
  {
    id: 'di-jian-xiao-shou',
    name: '遞減小獸',
    category: '虛無界',
    description: '每用一次技能就會縮小一些的奇獸,終將歸於虛無。',
    emoji: '🌀',
    art: true
  },
  {
    id: 'bi-he-hui-quan',
    name: '閉合迴圈',
    category: '虛無界',
    description: '一個會自我閉合的光環獸,凡進入其環者無法走出。',
    emoji: '🌀',
    art: true
  },
  {
    id: 'fan-yin-zhi-shou',
    name: '反音之獸',
    category: '虛無界',
    description: '所到之處所有聲音歸於零的奇獸,沉默是牠的本體。',
    emoji: '🌀',
    art: true
  },
  {
    id: 'bai-zhi-kai-shi-shou',
    name: '白紙開始獸',
    category: '虛無界',
    description: '一張白紙化形的獸,身上的故事每次都從頭寫起。',
    emoji: '🌀',
    art: true
  },
  {
    id: 'xu-shu-zhi-shen',
    name: '虛數之神',
    category: '虛無界',
    description: '虛數的化身,不存在於現實卻支配現實的存在。',
    emoji: '🌀',
    art: true
  },
  {
    id: 'xu-kong-jing-die',
    name: '虛空鏡蝶',
    category: '虛無界',
    description: '翼面為鏡的蝴蝶,飛過之處的世界都翻轉為鏡像。',
    emoji: '🌀',
    art: true
  },
  {
    id: 'wu-xian-zou-lang',
    name: '無限走廊',
    category: '虛無界',
    description: '一條無限延伸的走廊,任何進入者都找不到出口。',
    emoji: '🌀',
    art: true
  },
  {
    id: 'xu-wu-zhi-yan',
    name: '虛無之眼',
    category: '虛無界',
    description: '虛無深處睜開的眼,看一眼便讓人忘記自己存在過。',
    emoji: '🌀',
    art: true
  },
  {
    id: 'xing-he-ju-jiao',
    name: '星河巨蛟',
    category: '夜界',
    description: '夜空中飛行的巨蛟,鱗片即萬點繁星。',
    emoji: '🌃',
    art: true
  },
  {
    id: 'ye-xiao-zhi-zhu',
    name: '夜梟之主',
    category: '夜界',
    description: '夜空中睜眼的智者,凡夜間發生之事無一不知。',
    emoji: '🌃',
    art: true
  },
  {
    id: 'yin-yue-hu-ying',
    name: '銀月狐影',
    category: '夜界',
    description: '月光下的銀狐,身影隨月光流動,真假難辨。',
    emoji: '🌃',
    art: true
  },
  {
    id: 'ye-xing-zhi-zhu',
    name: '夜行蜘蛛',
    category: '夜界',
    description: '只在無月夜出沒的巨蛛,網絲銀亮如夜光。',
    emoji: '🌃',
    art: true
  },
  {
    id: 'ye-kong-yi-long',
    name: '夜空翼龍',
    category: '夜界',
    description: '只在夜空翱翔的翼龍,翼下星光、爪間夜風。',
    emoji: '🌃',
    art: true
  },
  {
    id: 'you-ling-mu-dan',
    name: '幽靈牡丹',
    category: '夜界',
    description: '只在夜晚綻放的紫色牡丹精靈,香氣令人神迷。',
    emoji: '🌃',
    art: true
  },
  {
    id: 'xing-zuo-zhan-shi',
    name: '星座戰士',
    category: '夜界',
    description: '由星座連線化形的戰士,身披星圖、手執銀劍。',
    emoji: '🌃',
    art: true
  },
  {
    id: 'an-ying-ci-ke',
    name: '暗影刺客',
    category: '夜界',
    description: '夜中的刺客,身影融入黑夜,只見銀刃一閃。',
    emoji: '🌃',
    art: true
  },
  {
    id: 'ye-guang-ying-chong',
    name: '夜光螢蟲',
    category: '夜界',
    description: '夜空中飛舞的螢火蟲群,為迷路者指引方向。',
    emoji: '🌃',
    art: true
  },
  {
    id: 'meng-jing-mao-tou-ying',
    name: '夢境貓頭鷹',
    category: '夜界',
    description: '夜空中半睡半醒的貓頭鷹,在夢與現實之間飛翔。',
    emoji: '🌃',
    art: true
  },
  {
    id: 'yue-guang-qin-shi',
    name: '月光琴師',
    category: '夜界',
    description: '月下彈琴的雅士,琴音如月光傾瀉,撫平萬物。',
    emoji: '🌃',
    art: true
  },
  {
    id: 'hei-ye-nv-wang',
    name: '黑夜女王',
    category: '夜界',
    description: '統治整個夜空的女王,星辰是她的子民、月光是她的冠冕。',
    emoji: '🌃',
    art: true
  },
  {
    id: 'ye-xing-hei-bao',
    name: '夜行黑豹',
    category: '夜界',
    description: '夜間出沒的純黑豹,雙眼如金,殺氣凌厲。',
    emoji: '🌃',
    art: true
  },
  {
    id: 'xing-xiang-zhan-bu-shou',
    name: '星象占卜獸',
    category: '夜界',
    description: '夜空中讀星象的占卜者,凡未來皆寫在星辰之間。',
    emoji: '🌃',
    art: true
  },
  {
    id: 'bian-fu-zhi-zhu',
    name: '蝙蝠之主',
    category: '夜界',
    description: '夜空中飛翔的巨蝙蝠王,牠的翅膀展開可遮蔽月亮。',
    emoji: '🌃',
    art: true
  },
  {
    id: 'ye-kong-mo-fa-zhen',
    name: '夜空魔法陣',
    category: '夜界',
    description: '夜空中浮現的巨大魔法陣,自行運轉、自行施法。',
    emoji: '🌃',
    art: true
  },
  {
    id: 'ye-feng-ci-ke-she',
    name: '夜風刺客蛇',
    category: '夜界',
    description: '無聲滑行於夜風中的銀紋黑蛇,毒牙無形無聲。',
    emoji: '🌃',
    art: true
  },
  {
    id: 'xing-chen-you-zai',
    name: '星塵幼仔',
    category: '夜界',
    description: '夜空中失散的小星辰,化為毛茸茸的小獸,帶著一身星塵。',
    emoji: '🌃',
    art: true
  },
  {
    id: 'ye-yu-shui-ling',
    name: '夜雨水靈',
    category: '夜界',
    description: '夜雨之中現身的水靈,輕柔卻無處不在。',
    emoji: '🌃',
    art: true
  },
  {
    id: 'ye-kong-lie-feng-shou',
    name: '夜空裂縫獸',
    category: '夜界',
    description: '夜空中突然出現的裂縫,從中走出的奇獸不知來自何處。',
    emoji: '🌃',
    art: true
  },
  {
    id: 'chang-e-xian-zi',
    name: '嫦娥仙子',
    category: '月宮',
    description: '飛升至月宮的仙子,千年來只與玉兔為伴。',
    emoji: '🌕',
    art: true
  },
  {
    id: 'wu-gang-fa-gui',
    name: '吳剛伐桂',
    category: '月宮',
    description: '月宮中永遠伐桂的吳剛,桂樹砍而復生,他則永世循環。',
    emoji: '🌕',
    art: true
  },
  {
    id: 'gui-shu-xian-shou',
    name: '桂樹仙獸',
    category: '月宮',
    description: '月宮裡永生不滅的桂樹,被砍千刀,癒合千次。',
    emoji: '🌕',
    art: true
  },
  {
    id: 'yue-hua-she',
    name: '月華蛇',
    category: '月宮',
    description: '吸食月華而活的銀蛇,月圓夜最為強盛。',
    emoji: '🌕',
    art: true
  },
  {
    id: 'yue-xiang-bian-huan-shou',
    name: '月相變幻獸',
    category: '月宮',
    description: '依月相變化形態的奇獸,新月時隱形、滿月時最強。',
    emoji: '🌕',
    art: true
  },
  {
    id: 'yue-que-yin-yu',
    name: '月鵲銀羽',
    category: '月宮',
    description: '月宮的傳信銀鵲,織女牽牛橋的編織者。',
    emoji: '🌕',
    art: true
  },
  {
    id: 'yu-tu-xian-shou',
    name: '玉兔仙獸',
    category: '月宮',
    description: '月宮中搗藥的玉兔,千年來只為嫦娥煉丹。',
    emoji: '🌕',
    art: true
  },
  {
    id: 'han-yue-gong-zhu',
    name: '寒月宮主',
    category: '月宮',
    description: '統治寒月宮的女王,凡有溫度之物皆會結霜。',
    emoji: '🌕',
    art: true
  },
  {
    id: 'yue-guang-qin-yin-die',
    name: '月光琴音蝶',
    category: '月宮',
    description: '月光下飛舞的蝴蝶,翅膀震動時發出琴弦般的樂音。',
    emoji: '🌕',
    art: true
  },
  {
    id: 'chan-chu-jin-zu',
    name: '蟾蜍金足',
    category: '月宮',
    description: '月宮中的三足蟾蜍,口吐金錢、招來福氣。',
    emoji: '🌕',
    art: true
  },
  {
    id: 'yue-hua-ci-ke',
    name: '月華刺客',
    category: '月宮',
    description: '月光下無聲行動的刺客,銀刃在月華中閃爍。',
    emoji: '🌕',
    art: true
  },
  {
    id: 'yin-he-he',
    name: '銀河鶴',
    category: '月宮',
    description: '在銀河之上飛翔的仙鶴,翼下流淌的是星河。',
    emoji: '🌕',
    art: true
  },
  {
    id: 'yue-guang-bao',
    name: '月光豹',
    category: '月宮',
    description: '月夜中悄無聲息行走的雪豹,毛色與月光融為一體。',
    emoji: '🌕',
    art: true
  },
  {
    id: 'yin-si-zhi-nv',
    name: '銀絲織女',
    category: '月宮',
    description: '月宮中織錦的少女,銀絲所織即是夜空銀河。',
    emoji: '🌕',
    art: true
  },
  {
    id: 'yue-gong-liu-li-shou',
    name: '月宮琉璃獸',
    category: '月宮',
    description: '月宮宮殿前的水晶獸,身體可折射七色月光。',
    emoji: '🌕',
    art: true
  },
  {
    id: 'yue-ye-du-lang',
    name: '月夜獨狼',
    category: '月宮',
    description: '月夜下獨自嚎叫的銀狼,孤獨與月光共鳴。',
    emoji: '🌕',
    art: true
  },
  {
    id: 'xing-he-xiao-zhou',
    name: '星河小舟',
    category: '月宮',
    description: '銀河上飄盪的無主小舟,凡迷路的星辰皆乘之回家。',
    emoji: '🌕',
    art: true
  },
  {
    id: 'qing-hui-yue-jing-ling',
    name: '清輝月精靈',
    category: '月宮',
    description: '月光中誕生的小精靈,純真而閃耀。',
    emoji: '🌕',
    art: true
  },
  {
    id: 'yue-guang-shuang-hua-shou',
    name: '月光霜華獸',
    category: '月宮',
    description: '月光與霜華共同凝結的奇獸,觸碰即生霜。',
    emoji: '🌕',
    art: true
  },
  {
    id: 'yong-ye-yue-shen',
    name: '永夜月神',
    category: '月宮',
    description: '統治永夜的月神,凡月光所至皆其領域。',
    emoji: '🌕',
    art: true
  },
  {
    id: 'zao-wang-ye',
    name: '灶王爺',
    category: '人界',
    description: '家家戶戶廚房裡的灶神,監察人間善惡、年終上奏天庭。',
    emoji: '🏮',
    art: true
  },
  {
    id: 'tu-di-gong',
    name: '土地公',
    category: '人界',
    description: '每塊土地都有其神,白鬚老翁、慈眉善目,庇佑一方平安。',
    emoji: '🏮',
    art: true
  },
  {
    id: 'men-shen-wei-zhen',
    name: '門神威鎮',
    category: '人界',
    description: '春節貼於門上的兩將軍,鎮邪驅鬼、護一家平安。',
    emoji: '🏮',
    art: true
  },
  {
    id: 'cai-shen-ye',
    name: '財神爺',
    category: '人界',
    description: '掌管財富的神祇,所到之處金銀滾滾、福運綿綿。',
    emoji: '🏮',
    art: true
  },
  {
    id: 'xi-tai-lao-dan',
    name: '戲台老旦',
    category: '人界',
    description: '戲台上的老旦角色,唱腔一出便引人入戲。',
    emoji: '🏮',
    art: true
  },
  {
    id: 'zhi-za-shi-xing',
    name: '紙紮獅醒',
    category: '人界',
    description: '舞獅表演用的紙獅子,被靈氣激發後活了過來。',
    emoji: '🏮',
    art: true
  },
  {
    id: 'tian-deng-xian-he',
    name: '天燈仙鶴',
    category: '人界',
    description: '人們放飛的天燈寄託著願望,願力濃郁時化為天燈仙鶴。',
    emoji: '🏮',
    art: true
  },
  {
    id: 'ma-zu-niang-niang',
    name: '媽祖娘娘',
    category: '人界',
    description: '台海一帶最受尊敬的女神,庇佑漁民、護海上平安。',
    emoji: '🏮',
    art: true
  },
  {
    id: 'guan-gong-wu-sheng',
    name: '關公武聖',
    category: '人界',
    description: '武聖關公,紅臉長鬚、青龍偃月刀在手,義薄雲天。',
    emoji: '🏮',
    art: true
  },
  {
    id: 'cheng-huang-ye-pan',
    name: '城隍夜判',
    category: '人界',
    description: '每座城鎮的城隍神,白日治理人間、夜晚審斷陰陽,凡有惡事皆登在其生死簿上。',
    emoji: '🏮',
    art: true
  },
  {
    id: 'ye-shi-tan-zhu-jing',
    name: '夜市攤主精',
    category: '人界',
    description: '夜市攤位的靈氣化身,一碗熱湯撫慰多少夜歸人。',
    emoji: '🏮',
    art: true
  },
  {
    id: 'mai-hua-gu-niang',
    name: '賣花姑娘',
    category: '人界',
    description: '街頭賣花的姑娘,送出的花朵能化解恩怨。',
    emoji: '🏮',
    art: true
  },
  {
    id: 'tang-ren-nie-su-shi',
    name: '糖人捏塑師',
    category: '人界',
    description: '街頭吹糖人的老師傅,他捏的糖人有時會自己動起來。',
    emoji: '🏮',
    art: true
  },
  {
    id: 'jiang-hu-du-xing-xia',
    name: '江湖獨行俠',
    category: '人界',
    description: '無門無派、獨來獨往的江湖俠客,一劍一斗笠,行俠仗義於市井之間。',
    emoji: '🏮',
    art: true
  },
  {
    id: 'shu-yuan-ru-sheng',
    name: '書院儒生',
    category: '人界',
    description: '十年寒窗的書生,一筆一書皆成兵器。',
    emoji: '🏮',
    art: true
  },
  {
    id: 'cun-kou-da-shu-jing',
    name: '村口大樹精',
    category: '人界',
    description: '每個村口都有一棵守護古樹,百年來看遍人世。',
    emoji: '🏮',
    art: true
  },
  {
    id: 'mei-po-hong-xian',
    name: '媒婆紅線',
    category: '人界',
    description: '人間的媒婆,手中紅線可牽起百年姻緣。',
    emoji: '🏮',
    art: true
  },
  {
    id: 'huang-bao-che-fu-ying',
    name: '黃包車伕影',
    category: '人界',
    description: '舊時代街頭的車伕,一輩子奔跑於街巷之間。',
    emoji: '🏮',
    art: true
  },
  {
    id: 'lao-cha-guan-zhang-gui',
    name: '老茶館掌櫃',
    category: '人界',
    description: '城裡最老的茶館掌櫃,茶香能撫平人心。',
    emoji: '🏮',
    art: true
  },
  {
    id: 'fan-ren-ying-jie',
    name: '凡人英傑',
    category: '人界',
    description: '凡人之中的英傑,以肉身對抗神魔,以信念照耀人世。',
    emoji: '🏮',
    art: true
  },
  {
    id: 'bei-ji-xing-long',
    name: '北極星龍',
    category: '極北',
    description: '北極點上方天空中的恆星之龍,千年不動,永遠指北。',
    emoji: '❄️',
    art: true
  },
  {
    id: 'ji-guang-nv-shen',
    name: '極光女神',
    category: '極北',
    description: '在極北夜空中起舞的極光女神,光芒可治百邪。',
    emoji: '❄️',
    art: true
  },
  {
    id: 'xue-yuan-ju-lang',
    name: '雪原巨狼',
    category: '極北',
    description: '極北雪原的霸主,毛色與雪原融為一體,獵物近前才現身。',
    emoji: '❄️',
    art: true
  },
  {
    id: 'bing-feng-ju-xi',
    name: '冰封巨象',
    category: '極北',
    description: '萬年冰封的長毛巨犀,皮毛上仍掛著上古的冰晶。',
    emoji: '❄️',
    art: true
  },
  {
    id: 'bing-jing-die-xian',
    name: '冰晶蝶仙',
    category: '極北',
    description: '極北雪原中的冰晶蝴蝶,翅膀如冰晶,飛行時叮咚作響。',
    emoji: '❄️',
    art: true
  },
  {
    id: 'bing-xiong-mu-wang',
    name: '冰熊母王',
    category: '極北',
    description: '極北的母熊女王,保護幼子如護整個雪原。',
    emoji: '❄️',
    art: true
  },
  {
    id: 'xue-bao-lie-shou',
    name: '雪豹獵手',
    category: '極北',
    description: '雪山高原的隱形獵手,毛色與雪岩融為一體。',
    emoji: '❄️',
    art: true
  },
  {
    id: 'bing-jing-tu',
    name: '冰晶兔',
    category: '極北',
    description: '極地雪兔的精靈化身,跳躍時雪花飛揚。',
    emoji: '❄️',
    art: true
  },
  {
    id: 'bing-ta-shou-hu',
    name: '冰塔守護',
    category: '極北',
    description: '極北冰塔的守護者,身形如山、堅不可摧。',
    emoji: '❄️',
    art: true
  },
  {
    id: 'bing-yuan-ying-lie',
    name: '冰原鷹獵',
    category: '極北',
    description: '極地天空中的獵鷹,目光如冰、爪如刀。',
    emoji: '❄️',
    art: true
  },
  {
    id: 'bing-feng-jian-shi',
    name: '冰封劍士',
    category: '極北',
    description: '萬年前在極北凍結的劍士,如今仍以冰之姿戰鬥。',
    emoji: '❄️',
    art: true
  },
  {
    id: 'bei-ji-hu-ying',
    name: '北極狐影',
    category: '極北',
    description: '極地雪狐,毛色隨季節變化,冬季純白如雪。',
    emoji: '❄️',
    art: true
  },
  {
    id: 'xun-lu-qun-wang',
    name: '馴鹿群王',
    category: '極北',
    description: '極北馴鹿群的領袖,巨大鹿角如冰之王座。',
    emoji: '❄️',
    art: true
  },
  {
    id: 'yong-dong-bing-yu',
    name: '永凍冰魚',
    category: '極北',
    description: '永凍湖中的冰魚,游動時湖面結冰再融化。',
    emoji: '❄️',
    art: true
  },
  {
    id: 'ji-guang-du-jiao-shou',
    name: '極光獨角獸',
    category: '極北',
    description: '極北雪原上奔跑的獨角獸,鬃毛如極光流動。',
    emoji: '❄️',
    art: true
  },
  {
    id: 'bing-chuan-mu-shou',
    name: '冰川母獸',
    category: '極北',
    description: '從冰川中誕生的母獸,體型如山、心如冰雪。',
    emoji: '❄️',
    art: true
  },
  {
    id: 'yin-shuang-wu-ya',
    name: '銀霜烏鴉',
    category: '極北',
    description: '在極北飛翔的銀霜烏鴉,飛行時羽毛灑落如霜。',
    emoji: '❄️',
    art: true
  },
  {
    id: 'bing-yuan-zhang-mian-zhe',
    name: '冰原長眠者',
    category: '極北',
    description: '極北冰原下沉睡萬年的古老存在,醒來即是天變。',
    emoji: '❄️',
    art: true
  },
  {
    id: 'bing-jie-jing-niao',
    name: '冰結晶鳥',
    category: '極北',
    description: '極寒之地的水晶鳥,鳴叫時空氣中浮現冰晶。',
    emoji: '❄️',
    art: true
  },
  {
    id: 'yong-dong-zhi-zhu',
    name: '永冬之主',
    category: '極北',
    description: '極北永恆的冬之主,他出現之地永遠不再有春天。',
    emoji: '❄️',
    art: true
  },
  {
    id: 'qi-qing-luan-wu',
    name: '七情亂舞',
    category: '心魔界',
    description: '人心七情化為一體的舞者,每張面具一種情緒。',
    emoji: '🎭',
    art: true
  },
  {
    id: 'tan-yu-mang',
    name: '貪欲蟒',
    category: '心魔界',
    description: '貪婪化形的巨蟒,吞下越多越無法滿足。',
    emoji: '🎭',
    art: true
  },
  {
    id: 'chen-huo-luo-sha',
    name: '嗔火羅剎',
    category: '心魔界',
    description: '憤怒化身的羅剎,越被打越強大。',
    emoji: '🎭',
    art: true
  },
  {
    id: 'chi-mi-zhi-quan',
    name: '癡迷之犬',
    category: '心魔界',
    description: '癡情化身的黑犬,認定一個目標便永不放棄。',
    emoji: '🎭',
    art: true
  },
  {
    id: 'ao-man-kong-que-mo',
    name: '傲慢孔雀魔',
    category: '心魔界',
    description: '傲慢化形的黑孔雀,展屏即令所有人臣服。',
    emoji: '🎭',
    art: true
  },
  {
    id: 'ji-xian-she-nv',
    name: '嫉羨蛇女',
    category: '心魔界',
    description: '嫉妒化身的蛇女,綠眼盯著他人擁有的一切。',
    emoji: '🎭',
    art: true
  },
  {
    id: 'lan-shou-chen-shui',
    name: '懶獸沉睡',
    category: '心魔界',
    description: '懶惰化形的奇獸,連睜眼都嫌累。',
    emoji: '🎭',
    art: true
  },
  {
    id: 'se-yu-yao-ji',
    name: '色欲妖姬',
    category: '心魔界',
    description: '色欲化身的妖姬,凡見其者皆失去理性。',
    emoji: '🎭',
    art: true
  },
  {
    id: 'ju-ying-shou',
    name: '懼影獸',
    category: '心魔界',
    description: '恐懼本身化形的黑影,無形體卻最令人畏懼。',
    emoji: '🎭',
    art: true
  },
  {
    id: 'bei-ai-chui-lei',
    name: '悲哀垂淚',
    category: '心魔界',
    description: '悲傷化身的女子,淚水成河、無人能笑。',
    emoji: '🎭',
    art: true
  },
  {
    id: 'zao-kuang-zhi-shou',
    name: '躁狂之獸',
    category: '心魔界',
    description: '失控的躁狂化身,渾身亂動、無法靜止。',
    emoji: '🎭',
    art: true
  },
  {
    id: 'zhi-nian-ou-ren',
    name: '執念偶人',
    category: '心魔界',
    description: '執念化形的木偶,無論多麼破碎都不肯倒下。',
    emoji: '🎭',
    art: true
  },
  {
    id: 'jing-zhong-zi-wo',
    name: '鏡中自我',
    category: '心魔界',
    description: '鏡子中爬出的自我,擁有與本人完全相反的人格。',
    emoji: '🎭',
    art: true
  },
  {
    id: 'xin-mo-tun-shi-zhu',
    name: '心魔吞噬主',
    category: '心魔界',
    description: '凡有心者皆有心魔,此即所有心魔的源頭。',
    emoji: '🎭',
    art: true
  },
  {
    id: 'jue-wang-hei-chao',
    name: '絕望黑潮',
    category: '心魔界',
    description: '絕望具象化的黑色潮汐,所到之處所有希望湮滅。',
    emoji: '🎭',
    art: true
  },
  {
    id: 'xu-rong-kong-ke',
    name: '虛榮空殼',
    category: '心魔界',
    description: '外表華麗無比的空殼,內裡空無一物。',
    emoji: '🎭',
    art: true
  },
  {
    id: 'you-lv-lao-zhe',
    name: '憂慮老者',
    category: '心魔界',
    description: '永遠在憂慮的老者,擔心所有可能與不可能的事。',
    emoji: '🎭',
    art: true
  },
  {
    id: 'kuang-wang-zhi-dian',
    name: '狂妄之巔',
    category: '心魔界',
    description: '狂妄到自以為神的人,終將從巔峰墜落。',
    emoji: '🎭',
    art: true
  },
  {
    id: 'yi-wang-chen-ai',
    name: '遺忘塵埃',
    category: '心魔界',
    description: '被遺忘的記憶化為塵埃,飄散在心靈角落。',
    emoji: '🎭',
    art: true
  },
  {
    id: 'xin-mo-jie-tuo',
    name: '心魔解脫',
    category: '心魔界',
    description: '突破所有心魔的覺者,從魔界走出,以光照亮過往。',
    emoji: '🎭',
    art: true
  },
  {
    id: 'yin-yang-yu-ling',
    name: '陰陽魚靈',
    category: '道界',
    description: '陰中有陽、陽中有陰的太極魚,雙生不分。',
    emoji: '☯️',
    art: true
  },
  {
    id: 'ba-gua-jing-dun',
    name: '八卦鏡盾',
    category: '道界',
    description: '太極八卦鏡的靈體,可反照妖邪、化解禍患。',
    emoji: '☯️',
    art: true
  },
  {
    id: 'wu-xing-long',
    name: '五行龍',
    category: '道界',
    description: '五行金木水火土合而為一的龍,五氣周流。',
    emoji: '☯️',
    art: true
  },
  {
    id: 'lian-dan-lu-shou',
    name: '煉丹爐獸',
    category: '道界',
    description: '煉丹爐成精,腹中始終燃著真火,煉出的丹藥可救千人。',
    emoji: '☯️',
    art: true
  },
  {
    id: 'dao-fa-fu-shi',
    name: '道法符師',
    category: '道界',
    description: '畫符念咒的道士,黃符飛時如雪、咒語落時如雨。',
    emoji: '☯️',
    art: true
  },
  {
    id: 'fei-jian-yu-zhe',
    name: '飛劍御者',
    category: '道界',
    description: '御劍而行的劍仙,千百飛劍如蟻、皆任其驅使。',
    emoji: '☯️',
    art: true
  },
  {
    id: 'yin-yang-dao-tong',
    name: '陰陽道童',
    category: '道界',
    description: '太極道童,半黑半白,左手陰、右手陽。',
    emoji: '☯️',
    art: true
  },
  {
    id: 'he-tu-luo-shu',
    name: '河圖洛書',
    category: '道界',
    description: '上古河洛二圖,數變天地、推演萬物。',
    emoji: '☯️',
    art: true
  },
  {
    id: 'hun-yuan-jin-gang-quan',
    name: '混元金剛圈',
    category: '道界',
    description: '太上老君的混元金剛圈,一擊無所不破。',
    emoji: '☯️',
    art: true
  },
  {
    id: 'qing-niu-lao-jun-zuo',
    name: '青牛老君座',
    category: '道界',
    description: '太上老君的座騎青牛,過函谷關時老君留下道德經。',
    emoji: '☯️',
    art: true
  },
  {
    id: 'lian-qi-lao-xian',
    name: '煉氣老仙',
    category: '道界',
    description: '修煉萬年的老仙,白髮銀鬚、目藏星辰。',
    emoji: '☯️',
    art: true
  },
  {
    id: 'fu-xi-ba-gua-pan',
    name: '伏羲八卦盤',
    category: '道界',
    description: '伏羲創立的八卦盤,可推演天地萬象。',
    emoji: '☯️',
    art: true
  },
  {
    id: 'he-jia-fei-xian',
    name: '鶴駕飛仙',
    category: '道界',
    description: '駕鶴飛行的仙人,衣袂飄飄、雲端遊歷。',
    emoji: '☯️',
    art: true
  },
  {
    id: 'tai-ji-tui-shou',
    name: '太極推手',
    category: '道界',
    description: '太極拳的武者,以柔克剛、以靜制動。',
    emoji: '☯️',
    art: true
  },
  {
    id: 'wu-lei-fu-shou',
    name: '五雷符獸',
    category: '道界',
    description: '五雷符上躍出的雷獸,身體即五道天雷。',
    emoji: '☯️',
    art: true
  },
  {
    id: 'lian-jian-xian-ding',
    name: '煉劍仙鼎',
    category: '道界',
    description: '煉製名劍的古鼎,千年來只為等一柄絕世之劍。',
    emoji: '☯️',
    art: true
  },
  {
    id: 'dao-tong-fu-chen',
    name: '道童拂塵',
    category: '道界',
    description: '道童手中的拂塵,一掃可去萬般塵埃。',
    emoji: '☯️',
    art: true
  },
  {
    id: 'yin-yang-shuang-sheng-shou',
    name: '陰陽雙生獸',
    category: '道界',
    description: '陰陽合體的雙頭獸,一頭為陰、一頭為陽。',
    emoji: '☯️',
    art: true
  },
  {
    id: 'qi-xing-bei-dou-zhen',
    name: '七星北斗陣',
    category: '道界',
    description: '北斗七星化為陣法,七星連結即天罡之力。',
    emoji: '☯️',
    art: true
  },
  {
    id: 'tai-shang-dao-jun',
    name: '太上道君',
    category: '道界',
    description: '道之化身,先天而生、後天而長,萬法歸於一道。',
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
