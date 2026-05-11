#!/usr/bin/env node
// Process raw ring PNGs into game-ready 128×128 sprites with transparent bg.
//
// 流程(一次性,跑完 raw-rings/ 可刪):
//   1. 讀 public/raw-rings/<id>.png(1024x1024 MJ 輸出,100% opaque)
//   2. flood-fill 去背(BFS 從 4 角擴散,跟 seed 顏色接近的 alpha → 0)
//   3. sharp resize 到 128×128(高品質 lanczos3)
//   4. 寫到 public/assets/rings/ring-<id>.png(PNG quality 90 = compressionLevel 9)
//
// 用法:
//   node scripts/process-rings.mjs
//
// 不接 args,固定處理 6 個境界:fan / ling / yao / shen / sheng / xian。
// 跑之前已備份 raw 檔到 /tmp/raw-rings-before(萬一需要重來)。
//
// 跟 flood-fill-sprite-bg.mjs 的差異:
//   - 後者寫到 public/sprites/(50 隻神獸立繪固定 outDir)
//   - 這個寫到 public/assets/rings/(階段 4B 的魂環 sprite)
//   - 後者保留原解析度;這個 resize 128×128(SoulRingRenderer 顯示尺寸 20×20,
//     2x retina + 一些頭尾餘裕,128 夠用且 < 30KB)
//
// flood-fill 核心邏輯 copy 自 flood-fill-sprite-bg.mjs,
// 6 張 ring 都是 100% opaque 沒去過背,跑 flood-fill 是安全的(CLAUDE.md 雷區 OK)。

import { readFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const inDir = resolve(repoRoot, 'public', 'raw-rings');
const outDir = resolve(repoRoot, 'public', 'assets', 'rings');

const REALMS = ['fan', 'ling', 'yao', 'shen', 'sheng', 'xian'];

const FULL_TRANSPARENT_DELTA = 32;
const FADE_END_DELTA = 55;
const SEED_BLOCK = 24;
const SEED_MIN_ALPHA = 50;
const HALO_RADIUS = 3;
const HALO_OPAQUE_THRESHOLD = 230;
const TARGET_SIZE = 128;

function sampleCornerRgb(data, W, x0, y0, size) {
  let r = 0, g = 0, b = 0, count = 0;
  for (let y = y0; y < y0 + size; y++) {
    for (let x = x0; x < x0 + size; x++) {
      const i = (y * W + x) * 4;
      if (data[i + 3] <= SEED_MIN_ALPHA) continue;
      r += data[i]; g += data[i + 1]; b += data[i + 2];
      count++;
    }
  }
  if (count === 0) return null;
  return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
}

function minDeltaToSeeds(data, i, seeds) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  let min = 999;
  for (const s of seeds) {
    const d = Math.max(Math.abs(r - s[0]), Math.abs(g - s[1]), Math.abs(b - s[2]));
    if (d < min) min = d;
  }
  return min;
}

function haloCleanup(data, W, H) {
  const snapshot = new Uint8ClampedArray(W * H);
  for (let i = 0; i < W * H; i++) snapshot[i] = data[i * 4 + 3];
  let removed = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const a = snapshot[idx];
      if (a < 5 || a > HALO_OPAQUE_THRESHOLD) continue;
      let hasOpaqueNeighbor = false;
      const yMin = Math.max(0, y - HALO_RADIUS);
      const yMax = Math.min(H - 1, y + HALO_RADIUS);
      const xMin = Math.max(0, x - HALO_RADIUS);
      const xMax = Math.min(W - 1, x + HALO_RADIUS);
      outer: for (let ny = yMin; ny <= yMax; ny++) {
        for (let nx = xMin; nx <= xMax; nx++) {
          if (snapshot[ny * W + nx] > HALO_OPAQUE_THRESHOLD) {
            hasOpaqueNeighbor = true;
            break outer;
          }
        }
      }
      if (!hasOpaqueNeighbor) {
        data[idx * 4 + 3] = 0;
        removed++;
      }
    }
  }
  return removed;
}

async function floodFillTransparent(inPath) {
  const { data, info } = await sharp(inPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const N = W * H;

  const seedsRaw = [
    sampleCornerRgb(data, W, 0, 0, SEED_BLOCK),
    sampleCornerRgb(data, W, W - SEED_BLOCK, 0, SEED_BLOCK),
    sampleCornerRgb(data, W, 0, H - SEED_BLOCK, SEED_BLOCK),
    sampleCornerRgb(data, W, W - SEED_BLOCK, H - SEED_BLOCK, SEED_BLOCK)
  ];
  const seeds = seedsRaw.filter((s) => s !== null);
  if (seeds.length === 0) {
    return { data, W, H, cleared: 0, faded: 0, haloRemoved: 0 };
  }

  const visited = new Uint8Array(N);
  const queue = [];
  const seedPx = [
    [0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1],
    [Math.floor(W / 2), 0], [Math.floor(W / 2), H - 1],
    [0, Math.floor(H / 2)], [W - 1, Math.floor(H / 2)]
  ];
  for (const [x, y] of seedPx) queue.push(y * W + x);

  let cleared = 0, faded = 0;
  while (queue.length > 0) {
    const idx = queue.shift();
    if (visited[idx]) continue;
    visited[idx] = 1;
    const i = idx * 4;
    const x = idx % W, y = Math.floor(idx / W);
    if (data[i + 3] < 5) continue;
    const delta = minDeltaToSeeds(data, i, seeds);
    if (delta < FULL_TRANSPARENT_DELTA) {
      data[i + 3] = 0;
      cleared++;
    } else if (delta < FADE_END_DELTA) {
      const fade = (delta - FULL_TRANSPARENT_DELTA) / (FADE_END_DELTA - FULL_TRANSPARENT_DELTA);
      data[i + 3] = Math.min(data[i + 3], Math.round(255 * fade));
      faded++;
      continue;
    } else {
      continue;
    }
    if (x > 0) queue.push(idx - 1);
    if (x < W - 1) queue.push(idx + 1);
    if (y > 0) queue.push(idx - W);
    if (y < H - 1) queue.push(idx + W);
  }

  const haloRemoved = haloCleanup(data, W, H);
  return { data, W, H, cleared, faded, haloRemoved };
}

mkdirSync(outDir, { recursive: true });

console.log('處理 6 個境界魂環…\n');
let totalIn = 0, totalOut = 0;

for (const realm of REALMS) {
  const inPath = resolve(inDir, `${realm}.png`);
  const outPath = resolve(outDir, `ring-${realm}.png`);

  const inSize = statSync(inPath).size;
  totalIn += inSize;

  const { data, W, H, cleared, faded, haloRemoved } = await floodFillTransparent(inPath);
  const N = W * H;

  // flood-fill 完成的 raw buffer → sharp 縮成 128×128(lanczos3 高品質)
  await sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .resize(TARGET_SIZE, TARGET_SIZE, { kernel: 'lanczos3', fit: 'inside' })
    .png({ compressionLevel: 9, quality: 90 })
    .toFile(outPath);

  const outSize = statSync(outPath).size;
  totalOut += outSize;

  console.log(
    `  ✓ ${realm.padEnd(6)} ` +
      `flood ${((cleared / N) * 100).toFixed(1).padStart(5)}% ` +
      `fade ${((faded / N) * 100).toFixed(1).padStart(5)}% ` +
      `halo ${((haloRemoved / N) * 100).toFixed(1).padStart(5)}% ` +
      `| ${(inSize / 1024).toFixed(0).padStart(4)}KB → ${(outSize / 1024).toFixed(1).padStart(5)}KB`
  );
}

console.log(`\n總計 ${(totalIn / 1024 / 1024).toFixed(2)}MB → ${(totalOut / 1024).toFixed(0)}KB`);
console.log(`輸出:public/assets/rings/ring-{fan,ling,yao,shen,sheng,xian}.png`);
console.log(`\n下一步:確認效果後 rm -rf public/raw-rings/`);
