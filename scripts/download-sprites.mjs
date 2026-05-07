#!/usr/bin/env node
// 從 docs/art-prompts.md §1 表抓每隻角色立繪 URL,下載到
// public/sprites/<id>.png(縮成 256×256)。
//
// 用法:
//   node scripts/download-sprites.mjs            # 已存在的跳過
//   node scripts/download-sprites.mjs --force    # 全部重抓
//
// 注意:cdn.midjourney.com 對非瀏覽器 IP 會 403,**只能在你本機跑**,
//       不能在 sandbox / CI / Cloudflare Functions 等環境跑。

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const outDir = resolve(repoRoot, 'public', 'sprites');
const force = process.argv.includes('--force');

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

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
    const optimized = await sharp(buf)
      .resize(256, 256, { fit: 'cover' })
      .png({ compressionLevel: 9 })
      .toBuffer();
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
