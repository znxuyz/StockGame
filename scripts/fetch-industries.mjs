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

/**
 * TWSE 產業類別代號 → 中文名稱對照。
 *
 * 來源:公開資訊觀測站「產業別」分類碼。TWSE / TPEx 共用同一套(數字略有
 * 出入,有的代號只 TPEx 用);沒在這表的代號保留原始代號當值,日後再補。
 *
 * 維護備忘:TWSE 偶爾會新增產業類別(例如近年加的 33 農業科技、34 電子商務、
 * 35 綠能環保 等)。沒加進這表會在前端顯示成數字,不會壞,但分類會有誤導。
 * 不確定哪些新代號要補,可以從 src/data/industries.json 拿剩餘原始代號去
 * Google「產業類別碼 XX 上市」。
 */
const INDUSTRY_NAMES = {
  '01': '水泥工業',
  '02': '食品工業',
  '03': '塑膠工業',
  '04': '紡織纖維',
  '05': '電機機械',
  '06': '電器電纜',
  '07': '化學工業',
  '08': '玻璃陶瓷',
  '09': '造紙工業',
  '10': '鋼鐵工業',
  '11': '橡膠工業',
  '12': '汽車工業',
  '13': '電子工業',
  '14': '建材營造',
  '15': '航運業',
  '16': '觀光餐旅',
  '17': '金融保險業',
  '18': '貿易百貨',
  '19': '綜合',
  '20': '其他',
  '21': '化學工業',
  '22': '生技醫療業',
  '23': '油電燃氣業',
  '24': '半導體業',
  '25': '電腦及週邊設備業',
  '26': '光電業',
  '27': '通信網路業',
  '28': '電子零組件業',
  '29': '電子通路業',
  '30': '資訊服務業',
  '31': '其他電子業',
  '32': '文化創意業',
  '33': '農業科技業',
  '34': '電子商務',
  '35': '綠能環保',
  '36': '數位雲端',
  '37': '運動休閒',
  '38': '居家生活',
  '80': '管理股票',
  '91': '存託憑證'
};

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
  let unmappedCodes = new Set();
  for (const row of [...twse, ...tpex]) {
    const code = pickCode(row);
    const ind = pickIndustry(row);
    if (!code || !ind) continue;
    const trimmed = String(ind).trim();
    // 若是純數字代號,翻成中文;查不到就保留原值並記下來方便日後補表
    const name = /^\d+$/.test(trimmed)
      ? INDUSTRY_NAMES[trimmed.padStart(2, '0')] ??
        (unmappedCodes.add(trimmed), trimmed)
      : trimmed;
    industries[String(code).trim()] = name;
  }

  const count = Object.keys(industries).length;
  console.log(`[fetch-industries] 合計 ${count} 個代號有產業分類`);
  if (unmappedCodes.size > 0) {
    console.warn(
      `[fetch-industries] 有 ${unmappedCodes.size} 個產業代號沒在 INDUSTRY_NAMES 表內(顯示原代號):`,
      [...unmappedCodes].sort().join(', ')
    );
  }

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
