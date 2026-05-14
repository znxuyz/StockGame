/**
 * 階段 5G:Excel 批次匯入交易紀錄。
 *
 *  - 用 ExcelJS(無已知 CVE,vs xlsx/SheetJS npm 版有 prototype pollution / ReDoS)
 *  - 範本兩個 sheet:「交易紀錄」(資料行)+「說明」(欄位定義 + 注意事項)
 *  - 解析支援:.xlsx / .csv(後者 ExcelJS 的 csv reader 也可走 xlsx loader)
 *  - 驗證 → 預覽 → 模式選擇(merge / replace)→ 執行 → snapshot backfill
 *  - 重用既存的 `commitBackfilledTransactions` / `clearOldData` / `exportBackup`
 *    (`historicalBackfillService`),避免雙寫
 */

import ExcelJS from 'exceljs';
import { db } from '@/db';
import { commitBackfilledTransactions, clearOldData, newPendingTx } from './historicalBackfillService';
import type { CommitProgress, CommitResult, PendingTransaction, PendingTxType } from './historicalBackfillService';
import type { Settings } from '@/types';

/** Excel 原始行(尚未 normalize / validate) */
export interface ExcelRow {
  /** Excel 行號(從 2 開始,1 是標題) */
  rowNum: number;
  date: string;
  type: string;
  stockCode: string;
  stockName: string;
  shares: number;
  pricePerShare: number;
}

/** 預覽用:含 row 解析後的 PendingTransaction 或 error 訊息 */
export interface PreviewItem {
  rowNum: number;
  raw: ExcelRow;
  valid: boolean;
  /** valid=true 時 normalize 成 pending tx */
  tx?: PendingTransaction;
  /** valid=false 的錯誤訊息 */
  error?: string;
}

export interface PreviewResult {
  items: PreviewItem[];
  validCount: number;
  invalidCount: number;
}

export type ImportMode = 'merge' | 'replace';

// ─── 範本生成 ───────────────────────────────────────────

/**
 * 生成範本 .xlsx 並觸發瀏覽器下載。
 * Sheet 1「交易紀錄」含標題列 + 1 行範例;Sheet 2「說明」含欄位定義。
 */
export async function generateAndDownloadTemplate(): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = '神獸股市';
  wb.lastModifiedBy = '神獸股市';
  wb.created = new Date();

  // Sheet 1:交易紀錄
  const ws1 = wb.addWorksheet('交易紀錄', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });
  ws1.columns = [
    { header: '日期', key: 'date', width: 14 },
    { header: '類型', key: 'type', width: 8 },
    { header: '股票代號', key: 'code', width: 12 },
    { header: '股票名稱', key: 'name', width: 18 },
    { header: '股數', key: 'shares', width: 10 },
    { header: '單價', key: 'price', width: 10 }
  ];
  // 標題列 bold
  ws1.getRow(1).font = { bold: true };
  ws1.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFF4D6' }
  };
  // 範例資料(讓玩家照樣式填)
  ws1.addRow({ date: '2025/10/13', type: '買入', code: '0050', name: '元大台灣50', shares: 200, price: 60.10 });
  ws1.addRow({ date: '2025/10/27', type: '加碼', code: '0050', name: '元大台灣50', shares: 62, price: 63.74 });
  ws1.addRow({ date: '2025/11/18', type: '加碼', code: '0050', name: '元大台灣50', shares: 100, price: 60.50 });
  // 留幾個空白行讓玩家填(ExcelJS 不需要明確空白行,直接後面 add 即可)

  // Sheet 2:說明
  const ws2 = wb.addWorksheet('說明');
  ws2.columns = [
    { header: '欄位', key: 'field', width: 14 },
    { header: '說明', key: 'desc', width: 60 }
  ];
  ws2.getRow(1).font = { bold: true };
  ws2.addRow(['日期', 'YYYY/MM/DD 或 YYYY-MM-DD(也可以是 Excel 日期格式)']);
  ws2.addRow(['類型', '必須是「買入」「加碼」「賣出」其中之一']);
  ws2.addRow(['股票代號', '4 位數字(0050 / 2330 等),系統會自動補 0']);
  ws2.addRow(['股票名稱', '選填,系統會自動補上']);
  ws2.addRow(['股數', '正整數']);
  ws2.addRow(['單價', '可帶小數(0.01 精度)']);
  ws2.addRow([]);
  ws2.addRow(['注意事項']).font = { bold: true };
  ws2.addRow(['1. 不要刪除第一列標題']);
  ws2.addRow(['2. 第一筆同股票必須是「買入」']);
  ws2.addRow(['3. 後續同股票才能「加碼」或「賣出」']);
  ws2.addRow(['4. 賣出股數不能超過目前持有']);
  ws2.addRow(['5. 同一檔股票賣光後又買回 → 用「買入」(會召喚新神獸)']);
  ws2.addRow(['6. 日期不能是未來']);

  const buffer = await wb.xlsx.writeBuffer();
  triggerDownload(buffer, 'stockgame_import_template.xlsx');
}

function triggerDownload(buffer: ArrayBuffer | ExcelJS.Buffer, filename: string): void {
  const blob = new Blob([buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── 解析上傳檔案 ───────────────────────────────────────

/**
 * 讀 .xlsx 或 .csv 檔。取第一個 sheet,跳過標題列,回 ExcelRow[]
 * 失敗 throw,caller catch 顯示錯誤訊息
 */
export async function parseExcelFile(file: File): Promise<ExcelRow[]> {
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  const isCsv = /\.csv$/i.test(file.name);
  if (isCsv) {
    // ExcelJS csv reader 需要 stream,瀏覽器簡化:把 buffer decode 成 string
    // 然後用簡易 split(MVP — 不處理引號內逗號;若需要 robust 改寫)
    const text = new TextDecoder('utf-8').decode(buffer);
    return parseCsvText(text);
  }
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Excel 沒有工作表');

  const rows: ExcelRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // 跳過標題列
    const values = row.values as unknown[]; // ExcelJS row.values 1-indexed
    const rawDate = values[1];
    const rawType = values[2];
    const rawCode = values[3];
    const rawName = values[4];
    const rawShares = values[5];
    const rawPrice = values[6];

    // 空 row(全 empty)→ skip
    if (rawDate == null && rawType == null && rawCode == null) return;

    rows.push({
      rowNum: rowNumber,
      date: normalizeDateCell(rawDate),
      type: String(rawType ?? '').trim(),
      stockCode: normalizeStockCode(rawCode),
      stockName: String(rawName ?? '').trim(),
      shares: Number(rawShares),
      pricePerShare: Number(rawPrice)
    });
  });
  return rows;
}

function parseCsvText(text: string): ExcelRow[] {
  // 簡易 CSV parser(MVP)— 假設沒有引號內逗號
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const out: ExcelRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    if (cols.length < 6) continue;
    out.push({
      rowNum: i + 1,
      date: normalizeDateCell(cols[0]),
      type: cols[1],
      stockCode: normalizeStockCode(cols[2]),
      stockName: cols[3],
      shares: Number(cols[4]),
      pricePerShare: Number(cols[5])
    });
  }
  return out;
}

/** 日期 cell 可能是 string / Date / number → 統一成 YYYY-MM-DD */
function normalizeDateCell(v: unknown): string {
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'number') {
    // Excel serial date(1900-based)— 用 ExcelJS 預設 cellDates 應該自動轉,
    // 但若原始檔沒被轉 → fallback 自己算
    const ms = (v - 25569) * 86_400_000;
    return normalizeDateCell(new Date(ms));
  }
  const s = String(v ?? '').trim();
  // 支援 YYYY/MM/DD、YYYY-MM-DD、其他用 Date constructor 嘗試
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(s);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return normalizeDateCell(parsed);
  }
  return s; // validate 階段會抓到 invalid
}

/** 股票代號:Excel 可能存成數字(0050 → 50)→ 補回 4 位 */
function normalizeStockCode(v: unknown): string {
  if (typeof v === 'number') return String(v).padStart(4, '0');
  const s = String(v ?? '').trim();
  // 純數字 ≤ 4 碼 → 補 0;其他原樣(ETF / 興櫃)
  if (/^\d{1,4}$/.test(s)) return s.padStart(4, '0');
  return s;
}

// ─── 驗證 + 預覽 ────────────────────────────────────────

const TYPE_MAP: Record<string, PendingTxType> = {
  買入: 'buy',
  加碼: 'feed',
  賣出: 'sell'
};

const TODAY_YMD = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

/**
 * 驗證 Excel 解析的 row[],回每筆 valid + 對應的 PendingTransaction or error。
 *
 *  - mode='merge' → 模擬從「當前 db.holdings」開始疊加
 *  - mode='replace' → 模擬從 0 開始
 *  - 同檔第二次「買入」(已有持倉)會 auto-correct 為「加碼」並附 warning
 */
export async function previewImport(rows: ExcelRow[], mode: ImportMode): Promise<PreviewResult> {
  const todayYmd = TODAY_YMD();
  const items: PreviewItem[] = [];

  // 依日期 asc 排序後驗證,讓「先買後加碼」邏輯走得通
  // 但保留原 rowNum 給 UI 顯示
  const sortedRows = [...rows].sort((a, b) => a.date.localeCompare(b.date));

  // 模擬持倉(每檔股票股數)
  const sim = new Map<string, number>();
  if (mode === 'merge') {
    const holdings = await db.holdings.toArray();
    for (const h of holdings) sim.set(h.code, h.shares);
  }

  // 預載 stock 清單(批次查比逐筆快)
  const allCodes = Array.from(new Set(sortedRows.map((r) => r.stockCode)));
  const stockMap = new Map<string, boolean>();
  for (const c of allCodes) {
    const stock = await db.stocks.get(c);
    stockMap.set(c, !!stock);
  }

  for (const raw of sortedRows) {
    const item: PreviewItem = { rowNum: raw.rowNum, raw, valid: false };
    items.push(item);

    // 1. 日期
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) {
      item.error = '日期格式錯誤,需 YYYY/MM/DD 或 YYYY-MM-DD';
      continue;
    }
    if (raw.date > todayYmd) {
      item.error = '日期不能是未來';
      continue;
    }

    // 2. 類型
    let type = TYPE_MAP[raw.type];
    if (!type) {
      item.error = `類型必須是「買入/加碼/賣出」(收到「${raw.type}」)`;
      continue;
    }

    // 3. 股票代號存在
    if (!raw.stockCode || raw.stockCode.length < 2) {
      item.error = '股票代號為空';
      continue;
    }
    if (!stockMap.get(raw.stockCode)) {
      item.error = `股票代號 ${raw.stockCode} 不存在於主檔`;
      continue;
    }

    // 4. 股數 / 單價
    if (!Number.isFinite(raw.shares) || raw.shares <= 0 || !Number.isInteger(raw.shares)) {
      item.error = '股數必須是正整數';
      continue;
    }
    if (!Number.isFinite(raw.pricePerShare) || raw.pricePerShare <= 0) {
      item.error = '單價必須 > 0';
      continue;
    }

    // 5. 業務邏輯:加碼前需有買入;同檔第二次「買入」auto-correct 為「加碼」
    const heldShares = sim.get(raw.stockCode) ?? 0;
    if (type === 'feed') {
      if (heldShares <= 0) {
        item.error = `${raw.stockCode} 第一筆必須是「買入」,不能是「加碼」`;
        continue;
      }
    } else if (type === 'sell') {
      if (heldShares < raw.shares) {
        item.error = `${raw.stockCode} 賣出 ${raw.shares} 股,但截至 ${raw.date} 只持有 ${heldShares} 股`;
        continue;
      }
    } else if (type === 'buy' && heldShares > 0) {
      // auto-correct
      type = 'feed';
    }

    // 通過驗證 → 更新模擬持倉
    if (type === 'buy' || type === 'feed') {
      sim.set(raw.stockCode, heldShares + raw.shares);
    } else if (type === 'sell') {
      sim.set(raw.stockCode, heldShares - raw.shares);
    }

    item.valid = true;
    item.tx = {
      uiId: newPendingTx().uiId,
      date: raw.date,
      type,
      code: raw.stockCode,
      stockName: raw.stockName || '',
      shares: raw.shares,
      pricePerShare: raw.pricePerShare
    };
  }

  // 用 rowNum 還原原始順序顯示給玩家
  items.sort((a, b) => a.rowNum - b.rowNum);

  return {
    items,
    validCount: items.filter((i) => i.valid).length,
    invalidCount: items.filter((i) => !i.valid).length
  };
}

// ─── 執行匯入 ───────────────────────────────────────────

/**
 * 執行匯入(merge / replace 兩種模式)。
 *  - replace:先 clearOldData(),再 commit
 *  - merge:直接 commit,保留現有資料
 *
 * 重用 historicalBackfillService.commitBackfilledTransactions(已含 snapshot backfill)
 */
export async function executeImport(
  preview: PreviewResult,
  mode: ImportMode,
  settings: Settings,
  onProgress?: (p: CommitProgress) => void
): Promise<CommitResult> {
  const txs = preview.items.filter((i) => i.valid && i.tx).map((i) => i.tx!);
  if (mode === 'replace') {
    await clearOldData();
  }
  return commitBackfilledTransactions(txs, settings, onProgress);
}
