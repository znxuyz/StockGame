#!/usr/bin/env node
// 從 TWSE / TPEx OpenAPI 抓**完整台股主檔**(上市 + 上櫃 + ETF/ETN),
// 寫進 `public/data/stock_master.json`,給 Excel 匯入驗證用。
//
// 資料源(都是 public open data,不需要金鑰):
//  - TWSE 上市:https://openapi.twse.com.tw/v1/opendata/t187ap03_L
//  - TPEx 上櫃:https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O
//  - TWSE ETF :https://openapi.twse.com.tw/v1/opendata/t187ap46_L
//
// 注意 stock_master.json 跟 src/data/industries.json **不同用途**:
//  - industries.json 是「代號 → 產業別」對照(畫圖用)
//  - stock_master.json 是「完整代號清單 + 中文名 + 市場」(驗證用 + Excel 匯入)
//
// 出錯處理:某個 source 抓不到就跳過,保留現有 stock_master.json 不動 + warn
// 全部都抓不到 → exit 1 讓 CI fail

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const outDir = resolve(repoRoot, 'public', 'data');
const outPath = resolve(outDir, 'stock_master.json');

const TWSE_LISTED = 'https://openapi.twse.com.tw/v1/opendata/t187ap03_L';
const TPEX_OTC = 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O';
const TWSE_ETF = 'https://openapi.twse.com.tw/v1/opendata/t187ap46_L';

const UA = 'StockGame fetch-stock-master/1.0';

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * TWSE 上市 t187ap03_L:回傳一陣列,每筆物件有
 *  公司代號 / 公司簡稱 / 公司名稱 / 產業別 / 產業別代碼 / ...
 */
async function fetchTWSEListed() {
  const data = await fetchJson(TWSE_LISTED);
  if (!Array.isArray(data)) throw new Error('TWSE listed response not array');
  return data
    .map((s) => ({
      code: String(s['公司代號'] ?? '').trim(),
      name: String(s['公司簡稱'] ?? s['公司名稱'] ?? '').trim(),
      market: 'TWSE',
      type: 'stock'
    }))
    .filter((s) => s.code && s.name);
}

/**
 * TPEx 上櫃 mopsfin_t187ap03_O:回傳一陣列,欄位名稱可能不同版本
 * 嘗試常見 key:SecuritiesCompanyCode / 公司代號 / Code,
 *           CompanyName / 公司簡稱 / Name
 */
async function fetchTPExOTC() {
  const data = await fetchJson(TPEX_OTC);
  if (!Array.isArray(data)) throw new Error('TPEx OTC response not array');
  return data
    .map((s) => {
      const code = String(
        s['SecuritiesCompanyCode'] ?? s['公司代號'] ?? s['Code'] ?? ''
      ).trim();
      const name = String(
        s['CompanyAbbreviation'] ??
          s['公司簡稱'] ??
          s['公司名稱'] ??
          s['CompanyName'] ??
          s['Name'] ??
          ''
      ).trim();
      return { code, name, market: 'TPEX', type: 'stock' };
    })
    .filter((s) => s.code && s.name);
}

/**
 * TWSE ETF / ETN t187ap46_L:欄位 證券代號 / 證券簡稱 / 受益人數 / ...
 */
async function fetchTWSEETF() {
  const data = await fetchJson(TWSE_ETF);
  if (!Array.isArray(data)) throw new Error('TWSE ETF response not array');
  return data
    .map((s) => ({
      code: String(s['證券代號'] ?? s['Code'] ?? '').trim(),
      name: String(s['證券簡稱'] ?? s['Name'] ?? '').trim(),
      market: 'ETF',
      type: 'etf'
    }))
    .filter((s) => s.code && s.name);
}

async function trySource(label, fn) {
  try {
    const result = await fn();
    console.log(`✓ ${label}:${result.length} 筆`);
    return result;
  } catch (e) {
    console.warn(`✗ ${label} 失敗:${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

(async () => {
  const [listed, otc, etf] = await Promise.all([
    trySource('TWSE 上市', fetchTWSEListed),
    trySource('TPEx 上櫃', fetchTPExOTC),
    trySource('TWSE ETF', fetchTWSEETF)
  ]);

  const sources = [listed, otc, etf].filter(Boolean);
  if (sources.length === 0) {
    console.error('❌ 三個 source 全部失敗,放棄');
    process.exit(1);
  }

  // 去重(同代號可能在多源出現;ETF 優先因為它有「證券簡稱」更精確)
  const map = new Map();
  // 順序:先加 stock,再加 etf 覆寫(讓 ETF 標籤勝出)
  for (const s of listed ?? []) map.set(s.code, s);
  for (const s of otc ?? []) map.set(s.code, s);
  for (const s of etf ?? []) map.set(s.code, s);
  const all = Array.from(map.values()).sort((a, b) =>
    a.code.localeCompare(b.code)
  );

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const payload = {
    fetchedAt: new Date().toISOString(),
    source: 'TWSE OpenAPI t187ap03_L + TPEx mopsfin_t187ap03_O + TWSE t187ap46_L',
    count: all.length,
    stocks: all
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`✓ 寫入 ${outPath}(${all.length} 檔)`);
})();
