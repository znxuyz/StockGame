#!/usr/bin/env node
// 產生 Midjourney v7 prompts for 20 隻精選神獸(10 山海經 + 10 原創)。
//
// 用法:
//   node scripts/gen-art-prompts.mjs > docs/art-prompts-todo.md
//
// 自動模式:讀 docs/art-prompts.md §6 表格,只輸出**現在可以跑**的 prompt。
//   - 任何 idle 沒填 URL → 列 idle prompt(只用 sref)
//   - 山海經 asc/corrupt 沒填 URL → 列 prompt(只用 sref,sw 200)
//   - 原創 asc/corrupt 沒填 URL && idle 已填 → 列 prompt(sref sw 200 + oref ow 100)
//     原創沒 idle URL 時 asc/corrupt 跳過(MJ 沒參考圖會自由發揮,跑出無關物種)
//   - walk 沒填 URL && idle 已填 → 列 walk prompt(sref + oref)
// 全部填完就無輸出。每收到一批新 URL 後重跑這個腳本就會推進到下一階段。

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

// 欄位:
//   id           對應 src/data/creatures.ts 與 docs/art-prompts.md §6 表格欄
//   visual       完整描述(含 side view full body)
//   subject      asc/corrupt 模板的名詞片語
//   featuresGold asc 模板 {features_in_gold}
//   featuresDark corrupt 模板 {features_dark}
//   negative     可選,組進 --no flag
//   original     true = 原創神獸,asc/corrupt 必須吃 idle 當 oref
//                (MJ 沒看過的概念光靠文字會跑歪)
const CREATURES = [
  // ────── 山海經 10 隻(MJ 認識,asc/corrupt 不需要 oref) ──────
  {
    id: 'azure-dragon',
    name: '青龍',
    visual:
      'An azure dragon (青龍) of Chinese mythology, sinuous serpentine body coiling with quiet power, four-clawed legs, prominent deer-like antlers branching back, long flowing whiskers from the snout, scales rendered with delicate ink brush strokes, side view full body',
    subject: 'azure dragon with serpentine body, four-clawed legs and deer antlers',
    featuresGold: 'golden scales and golden antlers',
    featuresDark: 'scales and antlers',
  },
  {
    id: 'white-tiger',
    name: '白虎',
    visual:
      'A majestic white tiger of Chinese mythology, snow-white fur covered in BOLD flowing BLACK INK STRIPES across the entire body (stripes are the dominant high-contrast visual feature), fierce eyes, sharp claws, side view full body',
    subject: 'white tiger with bold black ink stripes across snow-white fur',
    featuresGold: 'golden stripes on ivory fur',
    featuresDark: 'fur and stripes',
    negative: 'plain white tiger, no stripes, faded stripes',
  },
  {
    id: 'vermilion-bird',
    name: '朱雀',
    visual:
      'A vermillion phoenix-like sacred bird of Chinese mythology, fiery red plumage with golden highlights, long elegant tail feathers TRAILING ACTUAL FLAMES (visible flame trails not just colored feathers), side view full body',
    subject: 'vermillion phoenix-like bird with flames trailing from its tail',
    featuresGold: 'golden plumage and golden flame-trail tail',
    featuresDark: 'feathers',
  },
  {
    id: 'black-tortoise',
    name: '玄武',
    visual:
      'A massive ancient black tortoise of Chinese mythology, large mossy patterned tortoise shell as the central body, with a long DARK SERPENT prominently INTERTWINED around the shell (snake head and tail both clearly visible, snake body wrapping the shell distinctly), dignified northern guardian, side view full body',
    subject: 'ancient black tortoise with a serpent intertwined around its shell',
    featuresGold: 'golden shell patterns and golden serpent',
    featuresDark: 'shell and serpent',
    negative: 'tortoise without snake, plain turtle',
  },
  {
    id: 'ying-long',
    name: '應龍',
    visual:
      'A winged dragon of Chinese mythology, classical Chinese dragon serpentine body with LARGE FEATHERED EAGLE-LIKE WINGS (definitively feathered, not bat wings), wings spread wide, four-clawed warrior posture, side view full body',
    subject: 'winged dragon with feathered eagle-like wings spread wide',
    featuresGold: 'golden scales and golden feathered wings',
    featuresDark: 'scales and feathered wings',
    negative: 'bat wings, leathery wings, membrane wings',
  },
  {
    id: 'qilin',
    name: '麒麟',
    visual:
      'A qilin of Chinese mythology, body must show ALL four traits together: deer-like body shape, dragon SCALES covering the body (clearly scaled not furry), single straight antler protruding from forehead, FIRE FLAME mane along the neck (actual visible flames not just orange fur), peaceful sage aura, side view full body',
    subject: 'qilin with deer body, dragon scales, single antler and flame mane',
    featuresGold: 'golden scales and golden flame mane',
    featuresDark: 'scales and mane',
    negative: 'plain horse, deer without scales, deer without antler',
  },
  {
    id: 'nine-tail-fox',
    name: '九尾狐',
    visual:
      'A nine-tailed fox of Chinese mythology, graceful slender fox body with EXACTLY NINE distinct flowing tails fanning out symmetrically (count each tail individually as one separate fluffy tail; nine tails not less), golden-red ink wash, mysterious gaze, side view full body',
    subject: 'fox with exactly nine fanned-out tails',
    featuresGold: 'golden fur and golden nine tails',
    featuresDark: 'fur and tails',
    negative: 'less than nine tails, fewer tails, single tail',
  },
  {
    id: 'kai-ming',
    name: '開明獸',
    visual:
      'A kaiming nine-headed guardian of Chinese mythology, tiger-shaped body with EXACTLY NINE distinct human heads emerging from its neck and shoulders (count each head individually; nine heads not less), each head has a calm human face, fierce gate-keeper stance, side view full body',
    subject: 'tiger-bodied guardian with exactly nine human heads emerging from its neck',
    featuresGold: 'golden fur and golden human heads',
    featuresDark: 'fur and heads',
    negative: 'single head, less than nine heads, fewer heads',
  },
  {
    id: 'he-luo',
    name: '何羅魚',
    visual:
      'A heluo fish of Chinese mythology, anatomically ONE single fish head from which exactly TEN distinct fish bodies fan out symmetrically (count each separate fish body; ten bodies not less), each body has its own tail, hydra-like fan-shaped silhouette, all ten bodies clearly drawn separate from each other, side view full body',
    subject: 'fish with one head and exactly ten fanned-out fish bodies',
    featuresGold: 'golden scales and golden ten-body fan',
    featuresDark: 'scales',
    negative: 'multiple heads, two heads, less than ten bodies, single body',
  },
  {
    id: 'di-jiang',
    name: '帝江',
    visual:
      'A dijiang formless deity of Chinese mythology, completely FACELESS round blob-like body (no eyes, no mouth, no nose, no facial features visible at all on the body), exactly SIX legs visible (count each leg distinctly; six legs not less), exactly FOUR feathered wings spread symmetrically (two on each side), abstract dancing posture, side view full body',
    subject: 'completely faceless round blob deity with exactly six legs and four feathered wings',
    featuresGold: 'golden blob body and golden feathered wings',
    featuresDark: 'blob body and wings',
    negative: 'face, eyes, mouth, nose, facial features, less than six legs, less than four wings',
  },

  // ────── 原創 10 隻(原版 MJ 沒看過 → asc/corrupt 必須吃 idle 當 oref) ──────
  {
    id: 'suanpan-shou',
    name: '算盤獸',
    original: true,
    visual:
      'An original Chinese mythology beast painted in traditional ink wash style, body composed of stacked horizontal abacus rows (wooden frame with sliding bamboo beads visible on each row; clearly an abacus structure that has come alive), four red silk tassels as legs, small calligraphic eyes peeking from the top frame, side view full body, alive moving creature not a static tool',
    subject: 'abacus-bodied beast with stacked bead-row body and silk-tassel legs',
    featuresGold: 'golden bamboo beads and golden silk tassels',
    featuresDark: 'bead rows and tassels',
    negative: 'human holding abacus, person, hand, realistic abacus tool only',
  },
  {
    id: 'yinzhang-ling',
    name: '印章靈',
    original: true,
    visual:
      'An original Chinese mythology spirit creature painted in traditional ink wash style, shaped like a walking vermillion red seal stamp (square solid red ink-stamp body with engraved Chinese seal characters carved on the bottom face), four legs formed of bold calligraphy brush strokes, small expressive eyes on the top face, side view full body, alive moving creature not a static stamp',
    subject: 'walking vermillion seal-stamp spirit with square red body and brush-stroke legs',
    featuresGold: 'golden seal characters and golden brush strokes',
    featuresDark: 'seal body and brush strokes',
    negative: 'person holding seal, hand pressing seal, static stamp tool only',
  },
  {
    id: 'qian-gui',
    name: '錢龜',
    original: true,
    visual:
      'An original Chinese mythology turtle painted in traditional ink wash style, shell entirely composed of stacked square-holed Chinese copper coins (each round coin has a clearly visible square hole in the center; coins layered like roof tiles), small turtle head and four legs emerging from the coin shell, several loose coins falling behind as it walks, side view full body',
    subject: 'small turtle with a shell of stacked square-holed copper coins',
    featuresGold: 'golden copper coins and golden shell',
    featuresDark: 'coin shell',
    negative: 'human holding coins, modern coins, paper money',
  },
  {
    id: 'bi-hu',
    name: '筆狐',
    original: true,
    visual:
      'An original Chinese mythology fox spirit painted in traditional ink wash style, fox-shaped silhouette but the entire body is composed of dynamic flowing calligraphy brush strokes (the fox outline emerges from sweeping ink strokes), tail in the form of an actual upright Chinese calligraphy brush with a wooden handle and pointed bristle tip, faint ink trails behind footprints, side view full body',
    subject: 'calligraphy-stroke fox with a literal Chinese calligraphy brush as its tail',
    featuresGold: 'golden brush strokes and golden brush-tail',
    featuresDark: 'brush strokes and brush-tail',
    negative: 'human, calligrapher person, hand holding brush',
  },
  {
    id: 'bianzhong-shou',
    name: '編鐘獸',
    original: true,
    visual:
      'An original Chinese mythology beast painted in traditional ink wash style, body is a vertical wooden bell-rack hung with rows of small bronze ceremonial bells (bianzhong; the bells dangle from the rack), two legs formed of wooden bell-stand posts, small expressive head emerging from the top of the rack, side view full body, alive moving creature not a static rack',
    subject: 'bell-rack-bodied beast with hanging bronze ceremonial bells and wooden post legs',
    featuresGold: 'golden bronze bells and golden bell rack',
    featuresDark: 'bells and rack',
    negative: 'static bell rack, person striking bells, museum exhibit',
  },
  {
    id: 'denglong-yu',
    name: '燈籠魚',
    original: true,
    visual:
      'An original Chinese mythology fish painted in traditional ink wash style, with a glowing red Chinese paper lantern as its head (Chinese characters faintly visible on the lantern paper, soft candle flame inside softly illuminating from within), fish-like scaled body, fins and tail with red silk tassels, side view full body, swimming pose',
    subject: 'fish with a red Chinese paper lantern for a head and silk-tassel fins',
    featuresGold: 'golden lantern light and golden scales',
    featuresDark: 'scales and lantern paper',
    negative: 'anglerfish, deep sea fish, person holding lantern',
  },
  {
    id: 'qi-ling',
    name: '棋靈',
    original: true,
    visual:
      'An original Chinese mythology spirit creature painted in traditional ink wash style, body composed entirely of stacked black and white weiqi (Go) game stones (clearly recognizable as Go pieces, half black stones half white stones split vertically down the body silhouette), small head with calligraphic eyes, four short legs of stacked stones, side view full body',
    subject: 'weiqi-stone-bodied spirit with half-black-half-white stacked Go stones',
    featuresGold: 'golden replacement stones across the body',
    featuresDark: 'stones',
    negative: 'human Go player, hand placing stones, chess board, western chess',
  },
  {
    id: 'lianhua-shou',
    name: '蓮華獸',
    original: true,
    visual:
      'An original Chinese mythology beast painted in traditional ink wash style, body composed of multiple layered lotus flower petals (a creature shaped from blooming lotus petals; petals form the torso and back), four lotus stem-shaped legs with stylized lotus leaves as feet, small face emerging from the central petal cluster, faint pollen halo around the body, side view full body',
    subject: 'lotus-petal-bodied beast with stem legs and pollen halo',
    featuresGold: 'golden lotus petals and golden pollen',
    featuresDark: 'petals and stems',
    negative: 'static lotus flower, plain flower without creature',
  },
  {
    id: 'shan-tong',
    name: '山童',
    original: true,
    visual:
      'An original Chinese mythology spirit child painted in traditional ink wash style, small humanoid figure made of stone and pine: small stone body, pine branches growing as arms, a tiny pointed mountain peak as a hat on the head, a flowing wisp of cloud trailing as a cape behind, two small stone legs, side view full body, child-sized humanoid',
    subject: 'small humanoid mountain-spirit child with stone body, pine arms, mountain-peak hat and cloud cape',
    featuresGold: 'golden stone body and golden pine branches',
    featuresDark: 'stone and pine branches',
    negative: 'adult, full-grown person, normal human, hiking person',
  },
  {
    id: 'tao-jing',
    name: '桃精',
    original: true,
    visual:
      'An original Chinese mythology peach spirit beast painted in traditional ink wash style, round peach fruit body with a soft pink-vermillion blush, peach blossom petals forming a flowing mane around the neck, peach leaves as wings spread on the back, two slender peach-stem-like legs, small face emerging from the peach, side view full body',
    subject: 'peach-fruit-bodied spirit with peach-blossom mane and peach-leaf wings',
    featuresGold: 'golden peach skin and golden blossom mane',
    featuresDark: 'peach skin and blossom',
    negative: 'static fruit, plain peach without creature, normal peach',
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

function ascendedPrompt(c, charRef) {
  const orefFlag = charRef ? ` --oref ${charRef} --ow 100` : '';
  return (
    `A divine celestial ${c.subject} ascended into ethereal form, body ` +
    `rendered in radiant pale gold and ivory ink with luminous ${c.featuresGold} ` +
    `glowing softly from within, full body clearly visible centered side view, ` +
    `calm transcendent regal pose, subtle vermillion and gold mandorla halo behind ` +
    `without obscuring the body, plain clean uncluttered composition, no smoke ` +
    `no clouds covering the body. ${STYLE_BLOCK_GOLD}\n` +
    `${FOOTER} --sref ${STYLE_REF} --sw 200${orefFlag}${negFlag(c)}`
  );
}

function corruptedPrompt(c, charRef) {
  const orefFlag = charRef ? ` --oref ${charRef} --ow 100` : '';
  return (
    `A corrupted demonic ${c.subject}, body rendered in deep charcoal black ` +
    `throughout with dark corrupted ${c.featuresDark} streaked with crimson red ` +
    `veins of evil corruption, glowing crimson red eyes piercing fiercely, full ` +
    `body clearly visible centered side view, sinister hunched aggressive ` +
    `predatory stance, dark black body color dominant throughout, plain clean ` +
    `uncluttered composition, no smoke no miasma covering the body. ${STYLE_BLOCK_DARK}\n` +
    `${FOOTER} --sref ${STYLE_REF} --sw 200${orefFlag}${negFlag(c)}`
  );
}

function walkPrompt(c, charRef) {
  return (
    `${c.visual}, walking pose mid-stride, body facing right, dynamic balance ` +
    `with one limb lifted, sense of movement. ${STYLE_BLOCK}\n` +
    `${FOOTER} --sref ${STYLE_REF} --sw 100 --oref ${charRef} --ow 100${negFlag(c)}`
  );
}

// ─── 從 docs/art-prompts.md §6 表格抓出每隻 4 個 frame URL ───
function readUrlMap() {
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
    map.set(id, {
      idle: cells[2] && cells[2].startsWith('http') ? cells[2] : null,
      walk: cells[3] && cells[3].startsWith('http') ? cells[3] : null,
      ascended: cells[4] && cells[4].startsWith('http') ? cells[4] : null,
      corrupted: cells[5] && cells[5].startsWith('http') ? cells[5] : null,
    });
  }
  return map;
}

// ─── 主程式 ───
const urlMap = readUrlMap();

console.log('# 待跑 prompt — 自動產生');
console.log('');
console.log('> by `scripts/gen-art-prompts.mjs`,讀 `docs/art-prompts.md` §6 推算下一波。');
console.log('> 只列**現在可以跑**的 prompt(原創的 asc/corrupt 要等該隻 idle URL 填回才會展開)。');
console.log('> 收到新 URL → 我 commit 進 §6 → 重跑這個腳本 → 進入下一波。');
console.log('');

let totalCount = 0;

for (const c of CREATURES) {
  const have = urlMap.get(c.id) ?? { idle: null, walk: null, ascended: null, corrupted: null };
  const sections = [];

  if (!have.idle) {
    sections.push({ name: 'idle', prompt: idlePrompt(c) });
  }

  // 山海經:asc/corrupt 不需要 oref。原創:必須等 idle 才能跑(否則 MJ 自由發揮)。
  const canAscCorrupt = !c.original || !!have.idle;
  if (!have.ascended && canAscCorrupt) {
    sections.push({
      name: 'ascended',
      prompt: ascendedPrompt(c, c.original ? have.idle : null),
    });
  }
  if (!have.corrupted && canAscCorrupt) {
    sections.push({
      name: 'corrupted',
      prompt: corruptedPrompt(c, c.original ? have.idle : null),
    });
  }

  // walk 一律需要 idle URL 當 oref
  if (!have.walk && have.idle) {
    sections.push({ name: 'walk', prompt: walkPrompt(c, have.idle) });
  }

  if (sections.length === 0) continue;

  console.log('---');
  console.log('');
  console.log(`## \`${c.id}\` ${c.name}${c.original ? ' (原創)' : ''}`);
  console.log('');
  for (const s of sections) {
    console.log(`### ${s.name}`);
    console.log('');
    console.log('```');
    console.log(s.prompt);
    console.log('```');
    console.log('');
    totalCount++;
  }
}

console.log('---');
console.log('');
if (totalCount === 0) {
  console.log('**所有 prompt 都跑完了 ✓**');
} else {
  console.log(`**共 ${totalCount} 條 prompt 可跑**`);
}
