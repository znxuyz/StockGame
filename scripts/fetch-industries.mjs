#!/usr/bin/env node
// 從 TWSE OpenAPI 抓上市公司 + 上櫃公司產業表,合併寫進 src/data/industries.json。
// 給 GitHub Actions 每月跑;也可本機手跑(`node scripts/fetch-industries.mjs`)。
//
// 資料源(都是 public open data,不需要金鑰):
//  - TWSE 上市:https://openapi.twse.com.tw/v1/opendata/t187ap03_L
//  - TPEx 上櫃:https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O
//
// JSON 結構:
//  { fetchedAt, source, count, industries: { "2330": "半導體業", ... } }
//
// 找不到資料(API 暫時掛掉)時,保留原 JSON 不動,exit 1 讓 Actions 失敗通知。

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const outPath = resolve(repoRoot, 'src', 'data', 'industries.json');

const TWSE_URL = 'https://openapi.twse.com.tw/v1/opendata/t187ap03_L';
const TPEX_URL = 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O';

/** TWSE / TPEx 回傳格式都類似,欄位名為 zh-TW */
async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'stockgame-industry-bot/1.0 (+github.com)'
    }
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

function pickIndustry(row) {
  // TWSE / TPEx 都有「產業別」欄,但 TPEx 也可能叫「公司類別」/「主行業別代號」
  return (
    row['產業別'] ||
    row['主行業別名稱'] ||
    row['公司類別'] ||
    row['行業別'] ||
    null
  );
}

function pickCode(row) {
  return (
    row['公司代號'] ||
    row['股票代號'] ||
    row['代號'] ||
    null
  );
}

async function main() {
  console.log('[fetch-industries] 抓 TWSE 上市...');
  const twse = await fetchJson(TWSE_URL).catch((e) => {
    console.warn(`  ⚠ TWSE 抓取失敗:${e.message}`);
    return [];
  });
  console.log(`  → ${twse.length} 筆`);

  console.log('[fetch-industries] 抓 TPEx 上櫃...');
  const tpex = await fetchJson(TPEX_URL).catch((e) => {
    console.warn(`  ⚠ TPEx 抓取失敗:${e.message}`);
    return [];
  });
  console.log(`  → ${tpex.length} 筆`);

  if (twse.length === 0 && tpex.length === 0) {
    console.error('[fetch-industries] 兩個資料源都掛了,放棄寫檔');
    process.exit(1);
  }

  /** @type {Record<string, string>} */
  const industries = {};
  for (const row of [...twse, ...tpex]) {
    const code = pickCode(row);
    const ind = pickIndustry(row);
    if (code && ind) {
      industries[String(code).trim()] = String(ind).trim();
    }
  }

  const count = Object.keys(industries).length;
  console.log(`[fetch-industries] 合計 ${count} 個代號有產業分類`);

  const output = {
    fetchedAt: new Date().toISOString(),
    source: 'TWSE openapi t187ap03_L + TPEx openapi mopsfin_t187ap03_O',
    count,
    industries
  };

  // 跟舊檔比對,沒變動就不寫(讓 git 不會產生空 commit)
  let changed = true;
  if (existsSync(outPath)) {
    try {
      const old = JSON.parse(readFileSync(outPath, 'utf8'));
      if (JSON.stringify(old.industries) === JSON.stringify(industries)) {
        changed = false;
      }
    } catch {
      // 舊檔壞掉就視為有變動
    }
  }

  if (!changed) {
    console.log('[fetch-industries] 資料無變動,不寫檔');
    return;
  }

  writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
  console.log(`[fetch-industries] 寫入 ${outPath}`);
}

main().catch((e) => {
  console.error('[fetch-industries] 失敗:', e);
  process.exit(1);
});
