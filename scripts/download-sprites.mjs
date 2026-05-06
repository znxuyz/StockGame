#!/usr/bin/env node
// 從 docs/art-prompts.md §6 表格抓 idle / ascended / corrupted 三欄 URL,
// 下載到 public/sprites/<id>__<frame>.png(縮成 256×256)。
// walk 欄不下載(MVP 不做走路動畫)。
//
// 用法:
//   node scripts/download-sprites.mjs
//
// 已存在的檔案會跳過(idempotent),除非加 --force。

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

// 解析 §6 表格 → { id: { idle, ascended, corrupted } }
// 表格欄位:| id | idle | walk | ascended | corrupted |
const rows = [];
for (const line of md.split('\n')) {
  if (!line.startsWith('| `')) continue;
  const cells = line.split('|').map((s) => s.trim());
  if (cells.length < 6) continue;
  const idMatch = cells[1].match(/`([^`]+)`/);
  if (!idMatch) continue;
  const id = idMatch[1];
  const pickUrl = (cell) => (cell && cell.startsWith('http') ? cell : null);
  rows.push({
    id,
    idle: pickUrl(cells[2]),
    ascended: pickUrl(cells[4]),
    corrupted: pickUrl(cells[5]),
  });
}

console.log(`[download-sprites] 找到 ${rows.length} 隻神獸,準備下載 idle/asc/corrupt 三欄。`);
console.log('');

let ok = 0;
let skipped = 0;
let failed = 0;

for (const row of rows) {
  for (const frame of ['idle', 'ascended', 'corrupted']) {
    const url = row[frame];
    if (!url) {
      console.log(`  - ${row.id} ${frame}: 空欄,跳過`);
      continue;
    }
    const filename = `${row.id}__${frame}.png`;
    const outPath = resolve(outDir, filename);
    if (existsSync(outPath) && !force) {
      console.log(`  ✓ ${filename}: 已存在,跳過(--force 可覆蓋)`);
      skipped++;
      continue;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const optimized = await sharp(buf)
        .resize(256, 256, { fit: 'cover' })
        .png({ compressionLevel: 9 })
        .toBuffer();
      writeFileSync(outPath, optimized);
      const kb = (optimized.length / 1024).toFixed(0);
      console.log(`  ✓ ${filename} (${kb} KB)`);
      ok++;
    } catch (err) {
      console.error(`  ✗ ${filename}: ${err.message}`);
      failed++;
    }
  }
}

console.log('');
console.log(`完成:${ok} 張新下載 / ${skipped} 張已存在 / ${failed} 張失敗`);
if (failed > 0) process.exit(1);
