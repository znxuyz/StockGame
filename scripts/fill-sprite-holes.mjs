#!/usr/bin/env node
/**
 * 修復「flood-fill 吃進主體白色細節」造成的內部破洞。
 *
 * CLAUDE.md 記過的雷:跑 flood-fill-sprite-bg.mjs 時若 BFS 跨越 alpha<5
 * 的透明 gap,會從外圍鑽進主體把跟背景近色的白色細節(白骨 / 白翼 / 高光)
 * 誤殺。修補成空洞看起來像「神獸破洞」。
 *
 * 修法:對每張 sprite,從 4 個角落做 flood-fill 標記「真正的外部背景」,
 * 任何「沒連到角落的透明 pixel」即為**內部破洞**,用白色(255,255,255,255)
 * 填回去。這個邏輯安全:
 *   - 角落保證是 sprite 邊界外的背景
 *   - 從角落 BFS 只標到「跟邊界連通的透明」
 *   - 內部破洞(被 opaque 主體環繞的透明)不連通到角落 → 留下 → 填白
 *
 * 用法:
 *   node scripts/fill-sprite-holes.mjs                    # 跑全部 sprite
 *   node scripts/fill-sprite-holes.mjs file1.png file2.png   # 指定檔案
 *   node scripts/fill-sprite-holes.mjs --dry              # 只報告不寫檔
 *   node scripts/fill-sprite-holes.mjs --color=255,250,240 # 自訂填補色(默白)
 *
 * 跑前 mandatory backup:
 *   cp -r public/sprites /tmp/sprites-before-holefill
 *
 * 跑完肉眼確認;有問題就 cp -r /tmp/sprites-before-holefill/. public/sprites/ 還原。
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const outDir = resolve(repoRoot, 'public', 'sprites');

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const colorArg = args.find((a) => a.startsWith('--color='));
const fillColor = colorArg
  ? colorArg.replace('--color=', '').split(',').map((n) => Number(n.trim()))
  : [255, 255, 255]; // 預設純白
if (fillColor.length !== 3 || fillColor.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
  console.error('--color 格式錯誤,應該是 --color=R,G,B(0-255)');
  process.exit(1);
}

/** 角落像素是「真正背景」的 alpha 門檻 — 小於這個視為背景起點 */
const BG_ALPHA_THRESHOLD = 5;

/**
 * 對一張 sprite 找出「不連到 4 個角的透明 pixel」(內部破洞)填白。
 * 回傳統計:total / exterior / holes / filled。
 */
async function processFile(fp) {
  const raw = await sharp(fp).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = raw;
  const W = info.width;
  const H = info.height;
  const N = W * H;

  // visited bitmap:標記哪些 transparent pixel 已經連到外部 background
  const exterior = new Uint8Array(N);
  let exteriorCount = 0;
  const queue = [];

  function tryEnqueue(x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const idx = y * W + x;
    if (exterior[idx]) return;
    const a = data[idx * 4 + 3];
    if (a >= BG_ALPHA_THRESHOLD) return; // 不透明 = 主體邊界,擋住 BFS
    exterior[idx] = 1;
    exteriorCount++;
    queue.push(idx);
  }

  // seed 從 4 個角落開始
  tryEnqueue(0, 0);
  tryEnqueue(W - 1, 0);
  tryEnqueue(0, H - 1);
  tryEnqueue(W - 1, H - 1);

  // BFS:4 鄰擴散,只走透明 pixel(alpha < threshold)
  while (queue.length > 0) {
    const idx = queue.shift();
    const x = idx % W;
    const y = (idx / W) | 0;
    tryEnqueue(x - 1, y);
    tryEnqueue(x + 1, y);
    tryEnqueue(x, y - 1);
    tryEnqueue(x, y + 1);
  }

  // 統計 + 填補
  let transparentCount = 0;
  let holes = 0;
  for (let i = 0; i < N; i++) {
    if (data[i * 4 + 3] < BG_ALPHA_THRESHOLD) {
      transparentCount++;
      if (!exterior[i]) holes++;
    }
  }

  const stats = {
    total: N,
    transparent: transparentCount,
    exterior: exteriorCount,
    holes,
    transparentPct: ((transparentCount / N) * 100).toFixed(1),
    holesPct: ((holes / N) * 100).toFixed(2)
  };

  if (holes === 0 || dry) {
    return stats;
  }

  // 填補:transparent + non-exterior → 設為 fillColor + alpha=255
  for (let i = 0; i < N; i++) {
    if (data[i * 4 + 3] < BG_ALPHA_THRESHOLD && !exterior[i]) {
      data[i * 4] = fillColor[0];
      data[i * 4 + 1] = fillColor[1];
      data[i * 4 + 2] = fillColor[2];
      data[i * 4 + 3] = 255;
    }
  }

  await sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(fp);

  return stats;
}

async function main() {
  // 決定要處理哪些檔案
  const files = args
    .filter((a) => !a.startsWith('--'))
    .map((a) => (a.includes('/') ? a : resolve(outDir, a)));

  let targets;
  if (files.length > 0) {
    targets = files;
  } else {
    targets = readdirSync(outDir)
      .filter((f) => f.endsWith('.png'))
      .map((f) => resolve(outDir, f));
  }

  console.log(
    `[fill-holes] ${dry ? 'DRY ' : ''}處理 ${targets.length} 個 sprite,填補色 rgba(${fillColor.join(',')},255)`
  );
  console.log('');

  const damaged = [];
  for (const fp of targets) {
    const name = basename(fp);
    try {
      const s = await processFile(fp);
      const flag = s.holes > 0 ? '🔧' : '  ';
      console.log(
        `${flag} ${name.padEnd(28)} transp=${s.transparentPct}% (${s.transparent}) exterior=${s.exterior} holes=${s.holes}(${s.holesPct}%)`
      );
      if (s.holes > 0) damaged.push({ name, holes: s.holes });
    } catch (e) {
      console.error(`✗  ${name}:`, e.message);
    }
  }

  console.log('');
  if (damaged.length === 0) {
    console.log('[fill-holes] 沒有破洞需要修補');
  } else {
    console.log(
      `[fill-holes] ${dry ? '偵測' : '修補'} ${damaged.length} 個 sprite:`
    );
    for (const d of damaged.sort((a, b) => b.holes - a.holes)) {
      console.log(`  - ${d.name}: ${d.holes} 個 hole pixel`);
    }
    if (dry) {
      console.log('');
      console.log('  (dry-run,沒寫檔。拔掉 --dry 才會實際修補)');
    } else {
      console.log('');
      console.log('  跑完肉眼確認;有問題:');
      console.log('    cp -r /tmp/sprites-before-holefill/. public/sprites/');
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
