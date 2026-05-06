#!/usr/bin/env node
// 產生 Midjourney v7 prompts for 38 隻剩下的神獸(青龍/白虎已完成)。
// 用法:node scripts/gen-art-prompts.mjs > docs/art-prompts-batch.md
//
// 兩波輸出:
//   --batch=1 (預設) idle + ascended + corrupted(沒有 oref 依賴,可立即批量跑)
//   --batch=2          walk(需要從 art-prompts.md §6 把每隻 idle URL 抓出來當 oref)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const STYLE_REF = 'https://cdn.midjourney.com/99f03b33-c4d5-494f-b65c-58c7a7cd3120/0_3.png';

const STYLE_BLOCK =
  'Chinese ink wash painting (sumi-e), traditional gongbi line work, ' +
  'faded rice paper texture, dominant ink black with vermillion red and ' +
  'muted gold accents, calligraphy brush strokes with flying-white texture, ' +
  'flat 2D illustration, no shadow, no 3D rendering, no anime style, ' +
  'no cel shading, plain off-white rice paper background';

const STYLE_BLOCK_GOLD =
  'Chinese ink wash painting (sumi-e), traditional gongbi line work, ' +
  'faded rice paper texture, dominant gold and ivory accents with ' +
  'vermillion red, calligraphy brush strokes with flying-white texture, ' +
  'flat 2D illustration, no shadow, no 3D rendering, no anime style, ' +
  'no cel shading, plain off-white rice paper background';

const STYLE_BLOCK_DARK =
  'Chinese ink wash painting (sumi-e), traditional gongbi line work, ' +
  'faded rice paper texture, dominant ink black with crimson red veining ' +
  'accents, calligraphy brush strokes with flying-white texture, flat 2D ' +
  'illustration, no shadow, no 3D rendering, no anime style, no cel shading, ' +
  'plain off-white rice paper background';

// id 對應 src/data/creatures.ts 與 docs/art-prompts.md §6 表格欄。
// visual = §3.1 / §3.2 模板的 {visual}(完整視覺描述,含 side view full body)
// subject = §3.3 / §3.4 模板的 {visual_subject}(去掉「A majestic / A radiant」之類冠詞,改成名詞片語)
// featuresGold / featuresDark = §3.3 / §3.4 模板的 {features_in_gold} / {features_dark}
// skipIdle = idle 已完成、不需要再產生 idle prompt
const CREATURES = [
  // ── 四象 four-symbols(青龍 + 白虎已完成,不列入)
  {
    id: 'vermilion-bird',
    name: '朱雀',
    visual:
      'A vermillion phoenix-like sacred bird of Chinese mythology, fiery red plumage with golden highlights, long elegant tail feathers trailing flames, side view full body',
    subject: 'vermillion phoenix-like sacred bird of Chinese mythology',
    featuresGold: 'golden plumage and golden tail feathers',
    featuresDark: 'feathers',
    skipIdle: true,
  },
  {
    id: 'black-tortoise',
    name: '玄武',
    visual:
      'A massive ancient black tortoise of Chinese mythology with a long serpent intertwined around its mossy patterned shell, dignified northern guardian, side view full body',
    subject: 'ancient black tortoise of Chinese mythology with a long serpent intertwined around its shell',
    featuresGold: 'golden shell patterns and golden serpent scales',
    featuresDark: 'shell carapace and serpent body',
  },
  // ── 龍族 dragon
  {
    id: 'ying-long',
    name: '應龍',
    visual:
      'A winged dragon of Chinese mythology, classical Chinese dragon body with feathered wings spread wide, four-clawed warrior posture, ancient battle aura, side view full body',
    subject: 'winged dragon of Chinese mythology',
    featuresGold: 'golden scales and golden feathered wings',
    featuresDark: 'scales and feathered wings',
  },
  {
    id: 'zhu-long',
    name: '燭龍',
    visual:
      'A colossal torch dragon of Chinese mythology, immense red-scaled serpent body with a human-like face, eyes radiating bright torch light, side view full body',
    subject: 'colossal torch dragon of Chinese mythology with a human-like face',
    featuresGold: 'golden scales and luminous golden eyes',
    featuresDark: 'scales',
  },
  {
    id: 'jiao-long',
    name: '蛟',
    visual:
      'A jiao water serpent dragon of Chinese mythology, slick dark-scaled serpentine body without antlers, surrounded by curling water swirls, side view full body',
    subject: 'jiao water serpent dragon of Chinese mythology',
    featuresGold: 'golden scales',
    featuresDark: 'scales',
  },
  {
    id: 'hui',
    name: '虺',
    visual:
      'A young hui pre-dragon serpent of Chinese mythology, small simple coiled snake form, subtle thin scales, plain humble pose, side view full body',
    subject: 'young hui pre-dragon serpent of Chinese mythology',
    featuresGold: 'golden scales',
    featuresDark: 'scales',
  },
  {
    id: 'kui',
    name: '夔',
    visual:
      'A kui thunder beast of Chinese mythology, one-legged ox-like beast with single horn, body crackling with arcing lightning, drum-skin texture on torso, side view full body',
    subject: 'kui one-legged thunder beast of Chinese mythology',
    featuresGold: 'golden hide and golden lightning arcs',
    featuresDark: 'hide',
  },
  // ── 鳥族 bird
  {
    id: 'feng-huang',
    name: '鳳凰',
    visual:
      'A radiant phoenix of Chinese mythology, five-color plumage rendered in ink black + vermillion red + muted gold + sage green + ivory, long tail feathers like rising flames, side view full body',
    subject: 'radiant phoenix of Chinese mythology',
    featuresGold: 'golden plumage and golden tail feathers',
    featuresDark: 'feathers',
  },
  {
    id: 'luan-niao',
    name: '鸞鳥',
    visual:
      'A luan auspicious bird of Chinese mythology, peacock-like elegant body, harmonious graceful posture, ornate tail feathers, side view full body',
    subject: 'luan auspicious peacock-like bird of Chinese mythology',
    featuresGold: 'golden plumage and golden ornate tail feathers',
    featuresDark: 'feathers',
  },
  {
    id: 'qing-niao',
    name: '青鳥',
    visual:
      'A small swift azure-blue messenger bird of Chinese mythology, alert graceful pose, small scroll tied to leg, side view full body',
    subject: 'small swift messenger bird of Chinese mythology with a small scroll tied to leg',
    featuresGold: 'golden plumage',
    featuresDark: 'feathers',
  },
  {
    id: 'bi-fang',
    name: '畢方',
    visual:
      'A bifang fire crane of Chinese mythology, one-legged crane body with red ink markings, small flames trailing behind wings, side view full body',
    subject: 'bifang one-legged fire crane of Chinese mythology',
    featuresGold: 'golden plumage and golden flame trails',
    featuresDark: 'feathers',
  },
  {
    id: 'zhong-ming',
    name: '重明鳥',
    visual:
      'A zhongming twin-pupil bird of Chinese mythology, large eagle-like body with distinctive double-pupil eyes, vigilant proud pose, side view full body',
    subject: 'zhongming twin-pupil eagle-like bird of Chinese mythology',
    featuresGold: 'golden plumage and luminous golden double-pupil eyes',
    featuresDark: 'feathers',
  },
  {
    id: 'san-zu-wu',
    name: '三足烏',
    // MJ 訓練資料壓倒性都是兩腳鳥,prompt 必須狂強調三腳 + 用 --no 排除,
    // 不然 4 變體可能全部出兩腳。
    visual:
      'A sanzuwu three-legged crow of Chinese mythology, jet-black ink raven body with anatomically THREE legs visible (one extra middle leg between the standard two), all three legs clearly drawn standing on the ground in tripod stance, distinct gap between each leg, golden sun disc emblem glowing radiant behind, side view full body',
    subject:
      'sanzuwu three-legged crow of Chinese mythology with three legs in tripod stance (anatomically THREE legs, not two)',
    featuresGold: 'golden plumage with luminous golden sun disc',
    featuresDark: 'feathers',
    negative: 'two legs, two-legged bird, normal crow anatomy',
  },
  // ── 招財 lucky
  {
    id: 'qilin',
    name: '麒麟',
    visual:
      'A qilin of Chinese mythology, deer-like body covered in dragon scales, single antler, fire mane along the neck, peaceful sage aura, side view full body',
    subject: 'qilin of Chinese mythology with deer-like body and dragon scales',
    featuresGold: 'golden scales and golden flame mane',
    featuresDark: 'scales and mane',
  },
  {
    id: 'pixiu',
    name: '貔貅',
    visual:
      'A pixiu winged lion-beast of Chinese mythology, fierce muscular body, gaping mouth, small wings, scattered ancient gold coins around its feet, side view full body',
    subject: 'pixiu winged lion-beast of Chinese mythology',
    featuresGold: 'golden fur and golden wings',
    featuresDark: 'fur and wings',
  },
  {
    id: 'bai-ze',
    name: '白澤',
    visual:
      'A baize wisdom beast of Chinese mythology, white lion-like body with multiple eyes along its torso, contemplative wise pose, ancient scrolls floating nearby, side view full body',
    subject: 'baize lion-like wisdom beast of Chinese mythology with multiple eyes along its torso',
    featuresGold: 'golden fur and luminous golden eyes',
    featuresDark: 'fur',
  },
  {
    id: 'bi-xie',
    name: '辟邪',
    visual:
      'A bixie female pixiu variant of Chinese mythology, similar to pixiu but more refined and elegant, two small horns, protective stance, side view full body',
    subject: 'bixie female pixiu variant of Chinese mythology with two small horns',
    featuresGold: 'golden fur and golden horns',
    featuresDark: 'fur and horns',
  },
  {
    id: 'tian-lu',
    name: '天祿',
    visual:
      'A tianlu male pixiu variant of Chinese mythology, single horn, regal commanding stance, golden ink highlights, side view full body',
    subject: 'tianlu male pixiu variant of Chinese mythology with a single horn',
    featuresGold: 'golden fur and golden horn',
    featuresDark: 'fur and horn',
  },
  // ── 異獸 beast
  {
    id: 'nine-tail-fox',
    name: '九尾狐',
    visual:
      'A nine-tailed fox of Chinese mythology, graceful slender fox body with nine flowing fanned-out tails, golden-red ink wash, mysterious gaze, side view full body',
    subject: 'nine-tailed fox of Chinese mythology with nine flowing fanned-out tails',
    featuresGold: 'golden fur and golden tails',
    featuresDark: 'fur and tails',
  },
  {
    id: 'di-ting',
    name: '諦聽',
    visual:
      'A diting hybrid beast of Chinese mythology, lying low to ground listening, dragon-like head, ox ears, tiger paws, lion mane, scaled body, side view full body',
    subject: 'diting hybrid beast of Chinese mythology with dragon head, ox ears, tiger paws, lion mane and scaled body',
    featuresGold: 'golden scales and golden mane',
    featuresDark: 'scales and mane',
  },
  {
    id: 'kai-ming',
    name: '開明獸',
    visual:
      'A kaiming nine-headed guardian of Chinese mythology, tiger body with nine human heads emerging from neck, fierce gate-keeper stance, side view full body',
    subject: 'kaiming nine-headed guardian of Chinese mythology with a tiger body and nine human heads',
    featuresGold: 'golden fur and golden manes around each head',
    featuresDark: 'fur',
  },
  {
    id: 'zou-yu',
    name: '騶虞',
    visual:
      'A zouyu benevolent tiger of Chinese mythology, white tiger body with long flowing black ink stripes, gentle calm expression despite fierce form, side view full body',
    subject: 'zouyu benevolent tiger of Chinese mythology',
    featuresGold: 'golden stripes',
    featuresDark: 'fur',
  },
  {
    id: 'bo',
    name: '駁',
    visual:
      'A bo white horse-beast of Chinese mythology, white horse-like body with saw-shaped teeth visible, fierce mane, predator’s stance, side view full body',
    subject: 'bo horse-beast of Chinese mythology with saw-shaped teeth',
    featuresGold: 'golden mane and golden hide',
    featuresDark: 'mane and hide',
  },
  {
    id: 'lu-wu',
    name: '陸吾',
    visual:
      'A luwu mountain god of Chinese mythology, tiger body with nine swishing tails, human face on tiger head, tiger claws, mountain-deity aura, side view full body',
    subject: 'luwu mountain god of Chinese mythology with a tiger body, nine tails and a human face',
    featuresGold: 'golden fur and golden tails',
    featuresDark: 'fur and tails',
  },
  {
    id: 'ying-zhao',
    name: '英招',
    visual:
      'A yingzhao patrol deity of Chinese mythology, horse body with human face, tiger stripes on flank, large bird wings spread, ready to soar, side view full body',
    subject: 'yingzhao patrol deity of Chinese mythology with a horse body, human face, tiger stripes and bird wings',
    featuresGold: 'golden hide and golden wings',
    featuresDark: 'hide and wings',
  },
  {
    id: 'ru-shou',
    name: '蓐收',
    visual:
      'A rushou autumn metal god of Chinese mythology, fierce warrior figure with a snake coiled on left ear, riding a swirling cloud, side view full body',
    subject: 'rushou autumn metal god of Chinese mythology with a snake coiled on left ear riding a cloud',
    featuresGold: 'golden armor and golden cloud',
    featuresDark: 'armor and cloud',
  },
  {
    id: 'fei-lian',
    name: '飛廉',
    visual:
      'A feilian wind deity of Chinese mythology, deer-like body with sparrow head and snake tail, wind currents trailing from body in motion, side view full body',
    subject: 'feilian wind deity of Chinese mythology with a deer body, sparrow head and snake tail',
    featuresGold: 'golden hide and golden wind currents',
    featuresDark: 'hide',
  },
  {
    id: 'jiao-duan',
    name: '角端',
    visual:
      'A jiaoduan single-horned beast of Chinese mythology, swift rhino-like body with one straight horn, far-traveling pose mid-stride, side view full body',
    subject: 'jiaoduan single-horned rhino-like beast of Chinese mythology',
    featuresGold: 'golden hide and golden horn',
    featuresDark: 'hide and horn',
  },
  {
    id: 'zhu-yan',
    name: '朱厭',
    visual:
      'A zhuyan ominous beast of Chinese mythology, small-headed white-furred beast with bright red feet, unsettling staring gaze, ominous war-omen aura, side view full body',
    subject: 'zhuyan ominous white-furred beast of Chinese mythology with bright red feet',
    featuresGold: 'golden fur',
    featuresDark: 'fur',
  },
  // ── 水族 aquatic
  {
    id: 'kun',
    name: '鯤',
    visual:
      'A kun colossal mythical fish of Chinese mythology, mountain-sized deep-sea fish body, mid-transformation with bird-like wings beginning to emerge from sides, side view full body',
    subject: 'kun colossal mythical fish of Chinese mythology with bird wings emerging',
    featuresGold: 'golden scales and golden wings',
    featuresDark: 'scales and wings',
  },
  {
    id: 'heng-gong',
    name: '橫公魚',
    visual:
      'A henggong fish of Chinese mythology, fish body in mid-transformation with humanoid features partially emerging, mysterious dual-form, side view full body',
    subject: 'henggong fish of Chinese mythology mid-transformation with humanoid features',
    featuresGold: 'golden scales',
    featuresDark: 'scales',
  },
  {
    id: 'wen-yao',
    name: '文鰩魚',
    visual:
      'A wenyao flying fish of Chinese mythology, fish body with elegant bird wings, leaping out of water mid-flight, glittering ink-stroke scales, side view full body',
    subject: 'wenyao flying fish of Chinese mythology with bird wings',
    featuresGold: 'golden scales and golden wings',
    featuresDark: 'scales and wings',
  },
  {
    id: 'he-luo',
    name: '何羅魚',
    visual:
      'A heluo fish of Chinese mythology, surreal one-headed fish with ten splayed bodies fanning out from a single head, hydra-like, side view full body',
    subject: 'heluo one-headed ten-bodied fish of Chinese mythology',
    featuresGold: 'golden scales',
    featuresDark: 'scales',
  },
  {
    id: 'lu',
    name: '鯥',
    visual:
      'A lu hybrid fish of Chinese mythology, fish body with snake tail, small bird wings, ox-like ribs visible, surreal chimera, side view full body',
    subject: 'lu hybrid fish of Chinese mythology with snake tail, bird wings and ox-like ribs',
    featuresGold: 'golden scales and golden wings',
    featuresDark: 'scales and wings',
  },
  {
    id: 'ba-she',
    name: '巴蛇',
    visual:
      'A bashe colossal serpent of Chinese mythology, immense dark snake body with a slight midriff bulge (having swallowed an elephant), intimidating coiled stance, side view full body',
    subject: 'bashe colossal serpent of Chinese mythology with a midriff bulge',
    featuresGold: 'golden scales',
    featuresDark: 'scales',
  },
  // ── 靈體 spirit
  {
    id: 'di-jiang',
    name: '帝江',
    visual:
      'A dijiang formless deity of Chinese mythology, faceless round blob-like body with six legs and four wings, abstract dancing posture, side view full body',
    subject: 'dijiang formless faceless deity of Chinese mythology with six legs and four wings',
    featuresGold: 'golden body and golden wings',
    featuresDark: 'body and wings',
  },
  {
    id: 'qi-tu',
    name: '鵸鵌',
    visual:
      'A qitu surreal bird of Chinese mythology, three-headed bird with six tails fanning symmetrically, balanced ornamental pose, side view full body',
    subject: 'qitu three-headed six-tailed bird of Chinese mythology',
    featuresGold: 'golden plumage and golden tails',
    featuresDark: 'feathers and tails',
  },
  {
    id: 'zhi',
    name: '彘',
    visual:
      'A zhi mountain beast of Chinese mythology, tiger body with a human face, fierce stance on a cloud-wreathed peak, storm-bringing aura, side view full body',
    subject: 'zhi mountain beast of Chinese mythology with a tiger body and human face',
    featuresGold: 'golden fur and golden cloud aura',
    featuresDark: 'fur',
  },
];

const FOOTER = '--ar 1:1 --style raw --v 7';

function negFlag(c) {
  return c.negative ? ` --no ${c.negative}` : '';
}

function idlePrompt(c) {
  return (
    `${c.visual}, calm static pose centered on canvas, side view full body, ` +
    `quiet contemplative aura. ${STYLE_BLOCK}\n` +
    `${FOOTER} --sref ${STYLE_REF} --sw 100${negFlag(c)}`
  );
}

function ascendedPrompt(c) {
  return (
    `A divine celestial ${c.subject} ascended into ethereal form, body ` +
    `rendered in radiant pale gold and ivory ink with luminous ${c.featuresGold} ` +
    `glowing softly from within, full body clearly visible centered side view, ` +
    `calm transcendent regal pose, subtle vermillion and gold mandorla halo behind ` +
    `without obscuring the body, plain clean uncluttered composition, no smoke ` +
    `no clouds covering the body. ${STYLE_BLOCK_GOLD}\n` +
    `${FOOTER} --sref ${STYLE_REF} --sw 200${negFlag(c)}`
  );
}

function corruptedPrompt(c) {
  return (
    `A corrupted demonic ${c.subject}, body rendered in deep charcoal black ` +
    `throughout with dark corrupted ${c.featuresDark} streaked with crimson red ` +
    `veins of evil corruption, glowing crimson red eyes piercing fiercely, full ` +
    `body clearly visible centered side view, sinister hunched aggressive ` +
    `predatory stance, dark black body color dominant throughout, plain clean ` +
    `uncluttered composition, no smoke no miasma covering the body. ${STYLE_BLOCK_DARK}\n` +
    `${FOOTER} --sref ${STYLE_REF} --sw 200${negFlag(c)}`
  );
}

function walkPrompt(c, charRef) {
  return (
    `${c.visual}, walking pose mid-stride, body facing right, dynamic balance ` +
    `with one limb lifted, sense of movement. ${STYLE_BLOCK}\n` +
    `${FOOTER} --sref ${STYLE_REF} --sw 100 --oref ${charRef} --ow 100${negFlag(c)}`
  );
}

// ─── 從 docs/art-prompts.md §6 表格抓出每隻 idle URL(Batch 2 用)───
function readIdleUrls() {
  const here = dirname(fileURLToPath(import.meta.url));
  const md = readFileSync(resolve(here, '..', 'docs', 'art-prompts.md'), 'utf8');
  const map = new Map();
  for (const line of md.split('\n')) {
    if (!line.startsWith('| `')) continue;
    const cells = line.split('|').map((s) => s.trim());
    // | id | idle | walk | ascended | corrupted |
    if (cells.length < 6) continue;
    const idCell = cells[1];
    const idMatch = idCell.match(/`([^`]+)`/);
    if (!idMatch) continue;
    const id = idMatch[1];
    const idle = cells[2];
    if (idle && idle.startsWith('http')) map.set(id, idle);
  }
  return map;
}

// ─── 主程式 ───
const args = process.argv.slice(2);
const batchArg = args.find((a) => a.startsWith('--batch='));
const batch = batchArg ? Number(batchArg.split('=')[1]) : 1;

if (batch === 1) {
  console.log('# Batch 1 — idle / ascended / corrupted prompts');
  console.log('');
  console.log('> 自動產生,by `scripts/gen-art-prompts.mjs`');
  console.log('> 跑完每隻就把 4 個動作的 image link 填回 `docs/art-prompts.md` §6 表格。');
  console.log('> walk 在 idle 跑完之後另外用 `--batch=2` 產生(吃 idle URL 當 oref)。');
  console.log('');
  for (const c of CREATURES) {
    console.log(`---\n`);
    console.log(`## \`${c.id}\` ${c.name}\n`);
    if (!c.skipIdle) {
      console.log('### idle\n');
      console.log('```');
      console.log(idlePrompt(c));
      console.log('```\n');
    } else {
      console.log('### idle\n');
      console.log('> _已完成,跳過。_\n');
    }
    console.log('### ascended\n');
    console.log('```');
    console.log(ascendedPrompt(c));
    console.log('```\n');
    console.log('### corrupted\n');
    console.log('```');
    console.log(corruptedPrompt(c));
    console.log('```\n');
  }
} else if (batch === 2) {
  const idleUrls = readIdleUrls();
  console.log('# Batch 2 — walk prompts');
  console.log('');
  console.log('> 自動產生,by `scripts/gen-art-prompts.mjs --batch=2`');
  console.log('> 來源:`docs/art-prompts.md` §6 idle 欄。idle 還沒填 URL 的物種會被跳過。');
  console.log('');
  for (const c of CREATURES) {
    const idleUrl = idleUrls.get(c.id);
    if (!idleUrl) continue;
    console.log(`---\n`);
    console.log(`## \`${c.id}\` ${c.name} — walk\n`);
    console.log('```');
    console.log(walkPrompt(c, idleUrl));
    console.log('```\n');
  }
} else {
  console.error(`Unknown batch: ${batch}`);
  process.exit(1);
}
