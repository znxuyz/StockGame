#!/usr/bin/env node
/**
 * 小型孤立 blob 清理:殺掉跟主體不連通的小面積 opaque 元件(典型 iOS Lift Subject
 * 去背後殘留的「白色 1-3 px 雜訊點」),保留主體跟有設計意義的較大粒子。
 *
 * 用法:
 *   node scripts/cleanup-isolated-blobs.mjs <file.png> [maxBlobSize=20]
 *   node scripts/cleanup-isolated-blobs.mjs --scan          # 掃描列出疑似有雜訊的 sprite
 *
 * 演算法:
 *   1. BFS 走訪所有 alpha > 50 的連通元件
 *   2. 任一元件 size < maxBlobSize 就視為孤立雜訊,把元件 + 周圍 1px partial-alpha
 *      halo 全部設 alpha=0
 *   3. 主體(最大元件)永遠不動 — size 一般 5,000–50,000 px,遠超門檻
 *
 * **警告**:有些 sprite 設計上有星星 / 粒子點綴(如 `xing-he-ju-jiao` 星河巨蛟,
 * `ru-lai-fo-zu` 如來佛祖),小元件可能是 INTENTIONAL,不是雜訊。建議:
 *   1. 先 `--scan` 看疑似名單
 *   2. 個別 sprite 視覺確認後再針對性跑(別 `--all`)
 *   3. 跑前 `cp public/sprites/<file>.png /tmp/<file>.before.png` 備份
 *
 * maxBlobSize 預設 20 偏保守:1-3 px 點點都會清,大於 20 px 的星星留著。
 * 若主體仍殘留明顯雜訊可調到 30-50;有設計感星星的 sprite 用 10 或別跑。
 */

import sharp from 'sharp';
import { readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const spritesDir = resolve(here, '..', 'public', 'sprites');

async function findSmallBlobs(fp) {
  const { data, info } = await sharp(fp).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const N = W * H;
  const visited = new Uint8Array(N);
  const components = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (visited[idx]) continue;
      if (data[idx * 4 + 3] <= 50) { visited[idx] = 1; continue; }
      const pixels = [];
      const queue = [idx];
      while (queue.length > 0) {
        const cidx = queue.shift();
        if (visited[cidx]) continue;
        visited[cidx] = 1;
        if (data[cidx * 4 + 3] <= 50) continue;
        pixels.push(cidx);
        const cx = cidx % W;
        const cy = Math.floor(cidx / W);
        if (cx > 0) queue.push(cidx - 1);
        if (cx < W - 1) queue.push(cidx + 1);
        if (cy > 0) queue.push(cidx - W);
        if (cy < H - 1) queue.push(cidx + W);
      }
      if (pixels.length > 0) components.push(pixels);
    }
  }
  return { data, W, H, components };
}

async function cleanFile(fp, maxBlobSize) {
  const { data, W, H, components } = await findSmallBlobs(fp);
  components.sort((a, b) => b.length - a.length);
  const main = components[0];
  let killed = 0;
  let blobsKilled = 0;
  for (let i = 1; i < components.length; i++) {
    const comp = components[i];
    if (comp.length >= maxBlobSize) continue;
    blobsKilled++;
    for (const p of comp) {
      data[p * 4 + 3] = 0;
      killed++;
      // 順手清掉 1-pixel halo(arq 邊緣 partial-alpha pixel)
      const px = p % W;
      const py = Math.floor(p / W);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const ni = (ny * W + nx) * 4;
          if (data[ni + 3] > 0 && data[ni + 3] < 230) {
            data[ni + 3] = 0;
            killed++;
          }
        }
      }
    }
  }
  await sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(fp);
  return { mainSize: main ? main.length : 0, blobsKilled, pxKilled: killed };
}

const args = process.argv.slice(2);

if (args[0] === '--scan') {
  const files = readdirSync(spritesDir).filter((f) => f.endsWith('.png'));
  const results = [];
  for (const f of files) {
    const { components } = await findSmallBlobs(resolve(spritesDir, f));
    const small = components.filter((c) => c.length < 20);
    if (small.length > 0) {
      const totalPx = small.reduce((s, c) => s + c.length, 0);
      results.push({ f, blobs: small.length, px: totalPx });
    }
  }
  results.sort((a, b) => b.blobs - a.blobs);
  console.log(`找到 ${results.length} / ${files.length} 隻 sprite 有 < 20 px 孤立元件:`);
  for (const r of results.slice(0, 50)) {
    console.log(`  ${r.f.padEnd(40)} blobs=${r.blobs} px=${r.px}`);
  }
  console.log('(僅前 50)。視覺確認後跑 `node scripts/cleanup-isolated-blobs.mjs <file>`');
  process.exit(0);
}

if (args.length === 0) {
  console.error('用法:');
  console.error('  node scripts/cleanup-isolated-blobs.mjs <file.png> [maxBlobSize=20]');
  console.error('  node scripts/cleanup-isolated-blobs.mjs --scan');
  process.exit(1);
}

const fname = basename(args[0]);
const maxBlobSize = args[1] ? Number(args[1]) : 20;
const fp = resolve(spritesDir, fname);
console.log(`處理 ${fname}(maxBlobSize=${maxBlobSize})...`);
const { mainSize, blobsKilled, pxKilled } = await cleanFile(fp, maxBlobSize);
console.log(`主體 ${mainSize} px;清掉 ${blobsKilled} 個小 blob,共 ${pxKilled} px(含 halo)`);
