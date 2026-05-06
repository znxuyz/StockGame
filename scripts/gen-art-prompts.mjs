#!/usr/bin/env node
// 產生 Midjourney v7 prompts for 20 隻精選神獸(10 山海經 + 10 原創)。
// 用法:
//   node scripts/gen-art-prompts.mjs           > docs/art-prompts-batch1.md   (idle/asc/corrupt)
//   node scripts/gen-art-prompts.mjs --batch=2 > docs/art-prompts-batch2.md   (walk,吃 §6 idle URL)
//
// batch1 會跳過 batch1Done=true 的 8 隻已完成神獸;batch2 對 20 隻全跑(walk 都還沒做)。

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
//   visual       §3.1 / §3.2 模板的 {visual}(完整描述,含 side view full body)
//   subject      §3.3 / §3.4 模板的 {visual_subject}(去掉 "A majestic" 之類冠詞)
//   featuresGold §3.3 模板 {features_in_gold}
//   featuresDark §3.4 模板 {features_dark}
//   negative     可選,組進 --no flag(用於強制 anatomy / 排除常見錯誤)
//   batch1Done   true = idle/asc/corrupt 已完成,batch1 跳過,batch2 仍要跑 walk
const CREATURES = [
  // ────── 山海經 8 隻(batch1 已完成) ──────
  {
    id: 'azure-dragon',
    name: '青龍',
    batch1Done: true,
    visual:
      'An azure dragon (青龍) of Chinese mythology, sinuous serpentine body coiling with quiet power, four-clawed legs, prominent deer-like antlers branching back, long flowing whiskers from the snout, scales rendered with delicate ink brush strokes, side view full body',
    subject: 'azure dragon with serpentine body, four-clawed legs and deer antlers',
    featuresGold: 'golden scales and golden antlers',
    featuresDark: 'scales and antlers',
  },
  {
    id: 'white-tiger',
    name: '白虎',
    batch1Done: true,
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
    batch1Done: true,
    visual:
      'A vermillion phoenix-like sacred bird of Chinese mythology, fiery red plumage with golden highlights, long elegant tail feathers TRAILING ACTUAL FLAMES (visible flame trails not just colored feathers), side view full body',
    subject: 'vermillion phoenix-like bird with flames trailing from its tail',
    featuresGold: 'golden plumage and golden flame-trail tail',
    featuresDark: 'feathers',
  },
  {
    id: 'black-tortoise',
    name: '玄武',
    batch1Done: true,
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
    batch1Done: true,
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
    batch1Done: true,
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
    batch1Done: true,
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
    batch1Done: true,
    visual:
      'A kaiming nine-headed guardian of Chinese mythology, tiger-shaped body with EXACTLY NINE distinct human heads emerging from its neck and shoulders (count each head individually; nine heads not less), each head has a calm human face, fierce gate-keeper stance, side view full body',
    subject: 'tiger-bodied guardian with exactly nine human heads emerging from its neck',
    featuresGold: 'golden fur and golden human heads',
    featuresDark: 'fur and heads',
    negative: 'single head, less than nine heads, fewer heads',
  },

  // ────── 山海經 2 隻(batch1 待跑,強化 anatomy prompt) ──────
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

  // ────── 原創 10 隻(visual 都注入 "ink wash style" 確保畫風一致) ──────
  {
    id: 'suanpan-shou',
    name: '算盤獸',
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
  console.log('> 跳過 batch1Done=true 的 8 隻已完成神獸,只列出 12 隻待跑(2 山海經 + 10 原創)。');
  console.log('> 跑完每隻就把 4 個動作的 image link 填回 `docs/art-prompts.md` §6 表格。');
  console.log('> walk 在 idle 跑完之後另外用 `--batch=2` 產生(吃 idle URL 當 oref)。');
  console.log('');
  for (const c of CREATURES) {
    if (c.batch1Done) continue;
    console.log(`---\n`);
    console.log(`## \`${c.id}\` ${c.name}\n`);
    console.log('### idle\n');
    console.log('```');
    console.log(idlePrompt(c));
    console.log('```\n');
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
