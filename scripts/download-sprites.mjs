#!/usr/bin/env node
// 從 docs/art-prompts.md §1 表抓每隻角色立繪 URL,下載到
// public/sprites/<id>.png(縮成 256×256)。
//
// 用法:
//   node scripts/download-sprites.mjs               # 已存在的跳過
//   node scripts/download-sprites.mjs --force       # 全部重抓
//   node scripts/download-sprites.mjs --reprocess   # 不下載,只把 public/sprites/
//                                                   # 既有 PNG 重新縮成 256×256
//   node scripts/download-sprites.mjs --remove-bg   # 對既有 PNG 做色彩閾值去背
//                                                   # (米紙白底 → 透明,中央 ink 保留)
//
// 注意:
//  - cdn.midjourney.com 對非瀏覽器 IP 會 403,**只能在你本機跑**
//  - --remove-bg 是 fallback,品質沒有 iPhone 內建「Lift Subject」高,
//    淺色細節(白眼、金邊)可能被吃掉。最好的去背還是用 iOS 16+「拷貝主體」

import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const outDir = resolve(repoRoot, 'public', 'sprites');
const force = process.argv.includes('--force');
const reprocess = process.argv.includes('--reprocess');
const removeBg = process.argv.includes('--remove-bg');

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

/** 標準化:resize 256×256(不裁切、保留原始 aspect 對 MJ 1024×1024 圖無感) */
async function normalizeImage(input) {
  return sharp(input)
    .resize(256, 256, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * 色彩閾值去背:把接近米紙白的像素改成透明,中央 ink 保留。
 *  - 上限閾值 ABOVE:RGB 全大於 245 視為純背景 → alpha = 0
 *  - 下限閾值 BELOW:RGB 全小於 215 視為純前景 → alpha 不動
 *  - 中間:漸進透明度,讓邊緣自然過渡(避免硬切像剪貼)
 *
 * 適合 MJ 水墨風(深 ink 主體 + 淺米紙底)。對淺色主體不友善
 * (例如金邊、白眼可能被吃掉)。建議跑完用瀏覽器肉眼檢查。
 */
async function removeBackground(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const ABOVE = 245;
  const BELOW = 215;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const minRgb = Math.min(r, g, b);
    if (minRgb >= ABOVE) {
      // 純背景 → 完全透明
      data[i + 3] = 0;
    } else if (minRgb >= BELOW) {
      // 邊緣過渡 → 線性插值
      const fade = (minRgb - BELOW) / (ABOVE - BELOW);
      data[i + 3] = Math.round(255 * (1 - fade));
    }
    // else: 主體保持 alpha 255
  }

  return sharp(data, { raw: { width, height, channels } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

// ─── --remove-bg 模式:不打網路,只對既有 PNG 做色彩閾值去背 ───
if (removeBg) {
  const files = readdirSync(outDir).filter((f) => f.endsWith('.png'));
  if (files.length === 0) {
    console.error('[download-sprites] public/sprites/ 沒有 PNG 可處理');
    process.exit(1);
  }
  console.log(`[download-sprites] --remove-bg 模式:對 ${files.length} 個 PNG 做色彩閾值去背`);
  console.log('  ⚠ 跑完肉眼檢查每張,看細節有沒有被吃掉。建議備份 git 在 commit 前先用 dev 看效果。');
  console.log('');
  let okCount = 0;
  let failCount = 0;
  for (const f of files) {
    const path = resolve(outDir, f);
    try {
      const original = readFileSync(path);
      const processed = await removeBackground(await normalizeImage(original));
      writeFileSync(path, processed);
      const kb = (processed.length / 1024).toFixed(0);
      console.log(`  ✓ ${f} (${kb} KB)`);
      okCount++;
    } catch (err) {
      console.error(`  ✗ ${f}:${err.message}`);
      failCount++;
    }
  }
  console.log('');
  console.log(`完成:${okCount} 處理成功 / ${failCount} 失敗`);
  process.exit(failCount > 0 ? 1 : 0);
}

// ─── --reprocess 模式:不打網路,只重新縮 256×256 ───
if (reprocess) {
  const files = readdirSync(outDir).filter((f) => f.endsWith('.png'));
  if (files.length === 0) {
    console.error('[download-sprites] public/sprites/ 沒有 PNG 可處理');
    process.exit(1);
  }
  console.log(`[download-sprites] --reprocess 模式:處理 ${files.length} 個 PNG`);
  console.log('');
  let okCount = 0;
  let failCount = 0;
  for (const f of files) {
    const path = resolve(outDir, f);
    try {
      const original = readFileSync(path);
      const processed = await normalizeImage(original);
      writeFileSync(path, processed);
      const kb = (processed.length / 1024).toFixed(0);
      console.log(`  ✓ ${f} (${kb} KB)`);
      okCount++;
    } catch (err) {
      console.error(`  ✗ ${f}:${err.message}`);
      failCount++;
    }
  }
  console.log('');
  console.log(`完成:${okCount} 處理成功 / ${failCount} 失敗`);
  process.exit(failCount > 0 ? 1 : 0);
}

const md = readFileSync(resolve(repoRoot, 'docs', 'art-prompts.md'), 'utf8');

// 解析 §1 表 → [{ id, name, url }]
//   表格格式:| # | id | 中文 | 立繪 URL |
const rows = [];
for (const line of md.split('\n')) {
  if (!line.startsWith('| ')) continue;
  // 跳過表頭跟分隔線
  if (line.includes('---') || line.includes('立繪 URL')) continue;
  const cells = line.split('|').map((s) => s.trim());
  if (cells.length < 6) continue;
  const idMatch = cells[2].match(/`([^`]+)`/);
  if (!idMatch) continue;
  const url = cells[4];
  if (!url || !url.startsWith('http')) continue;
  rows.push({ id: idMatch[1], name: cells[3], url });
}

if (rows.length === 0) {
  console.error('[download-sprites] 沒從 docs/art-prompts.md §1 表抓到任何 URL,檢查表格格式。');
  process.exit(1);
}

console.log(`[download-sprites] 找到 ${rows.length} 隻角色,開始下載 → public/sprites/`);
console.log('');

let ok = 0;
let skipped = 0;
let failed = 0;

/** sleep ms 毫秒(MJ CDN 對連續快速請求會 rate limit 回 403,間隔慢一點才穩) */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

for (const row of rows) {
  const filename = `${row.id}.png`;
  const outPath = resolve(outDir, filename);
  if (existsSync(outPath) && !force) {
    console.log(`  ✓ ${filename} (${row.name}):已存在,跳過(--force 可覆蓋)`);
    skipped++;
    continue;
  }
  try {
    const res = await fetch(row.url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        Referer: 'https://www.midjourney.com/'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const optimized = await normalizeImage(buf);
    writeFileSync(outPath, optimized);
    const kb = (optimized.length / 1024).toFixed(0);
    console.log(`  ✓ ${filename} (${row.name},${kb} KB)`);
    ok++;
  } catch (err) {
    console.error(`  ✗ ${filename} (${row.name}):${err.message}`);
    failed++;
  }
  // MJ CDN rate limit 防護:每張之間隔 1 秒(一輪 20 張 = 20 秒,可接受)
  await sleep(1000);
}

console.log('');
console.log(`完成:${ok} 張新下載 / ${skipped} 張已存在 / ${failed} 張失敗`);
if (failed > 0) {
  console.error('');
  console.error('如果失敗訊息是 HTTP 403,代表你不在「能連 MJ CDN」的網路環境(常見於 sandbox / VPS / CI)。');
  console.error('解法:在你個人電腦上跑這個腳本,跑完把 public/sprites/ commit 進 repo 即可。');
  process.exit(1);
}
