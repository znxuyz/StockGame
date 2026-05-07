/**
 * 產業分類查詢。
 *
 * 資料來源:`src/data/industries.json`,由 GitHub Actions 每月 1 號從
 * TWSE / TPEx OpenAPI 自動抓 + commit 進 repo(`scripts/fetch-industries.mjs`)。
 *
 * 設計:
 *  - 找不到產業 → 回 'other'(跟原行為一致,不會打壞 stocks 表)
 *  - ETF (代號 00 開頭) 特殊處理,直接歸 'etf'
 *  - 產業名稱保持 TWSE 原始字串(例如「半導體業」、「電腦及週邊設備業」)
 *  - 不在 build time 額外處理,JSON 直接 import 進 bundle(目前約 1000 筆 ≈ 30 KB)
 */

import data from './industries.json';

interface IndustriesFile {
  fetchedAt: string | null;
  source: string;
  count: number;
  industries: Record<string, string>;
}

const file = data as IndustriesFile;

/** 透過股票代號查產業名稱;查不到回 fallback */
export function lookupIndustry(stockCode: string): string {
  const code = stockCode.trim().toUpperCase();
  // ETF 多數代號 00 開頭,直接歸 etf
  if (code.startsWith('00')) return 'etf';
  return file.industries[code] ?? 'other';
}

/** Debug 用:回傳資料抓取時間戳記 + 筆數 */
export function getIndustryDataMeta(): { fetchedAt: string | null; count: number } {
  return { fetchedAt: file.fetchedAt, count: file.count };
}
