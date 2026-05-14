/**
 * 階段 5G:股票主檔服務 — Excel 匯入 / BuyModal 補名稱 / 任何「驗證代號是否有效」場景共用。
 *
 * 資料來源(由低到高優先順序):
 *  1. **內建 hardcoded fallback**(最低保底,~30 筆,寫死在這檔案,
 *     即使 fetch 全失敗也保證能用)
 *  2. **`/data/stock_master.json`**(來自 build-time `scripts/fetch-stock-master.mjs`
 *     抓 TWSE + TPEx OpenAPI 完整清單,~2000 筆)
 *  3. **`db.stocks`**(玩家透過 BuyModal 走 `lookupStock` 已 cache 過的,
 *     涵蓋上面兩個都沒有的冷門 / 退市股,因為玩家曾經買過)
 *
 * 查詢時依序聯集:master → fallback → db.stocks。任一找到就回。
 *
 *  - 載入策略:第一次呼叫時 fetch `/data/stock_master.json`(瀏覽器自帶
 *    HTTP cache,通常瞬間從 disk 拿)+ memoize 進 module-level Map
 *  - localStorage 24 小時 cache:加快第二次載入(不打 disk),localStorage
 *    pollute 太久 → 清掉重抓
 *  - 全失敗仍能用 BUILTIN_FALLBACK 提供 ~30 筆熱門代號
 */

import { db } from '@/db';

/** 縮減後的 master entry — 給 UI / 驗證用,不必包到原 Stock type */
export interface StockMasterEntry {
  code: string;
  name: string;
  /** 'TWSE' 上市 / 'TPEX' 上櫃 / 'ETF' */
  market: 'TWSE' | 'TPEX' | 'ETF';
  type: 'stock' | 'etf';
}

/**
 * 內建保底清單 — 即使網路全壞,玩家輸入 2330 / 0050 等熱門代號仍可匯入。
 *
 * 別人改這份 JSON 我會看見,所以這 30 筆都是我**手動驗證過**的常見代號。
 * 不確定的代號不放進來,避免「假代號通過驗證」更糟糕。
 *
 * 玩家想要完整清單(~2000 筆)→ 本機跑 `npm run fetch:stocks`,
 * `public/data/stock_master.json` 會被覆寫成 TWSE/TPEx 官方完整清單。
 */
const BUILTIN_FALLBACK: StockMasterEntry[] = [
  // 熱門 ETF
  { code: '0050', name: '元大台灣50', market: 'ETF', type: 'etf' },
  { code: '0056', name: '元大高股息', market: 'ETF', type: 'etf' },
  { code: '006208', name: '富邦台50', market: 'ETF', type: 'etf' },
  { code: '00713', name: '元大台灣高息低波', market: 'ETF', type: 'etf' },
  { code: '00878', name: '國泰永續高股息', market: 'ETF', type: 'etf' },
  { code: '00919', name: '群益台灣精選高息', market: 'ETF', type: 'etf' },
  { code: '00929', name: '復華台灣科技優息', market: 'ETF', type: 'etf' },
  // 上市熱門
  { code: '1101', name: '台泥', market: 'TWSE', type: 'stock' },
  { code: '1102', name: '亞泥', market: 'TWSE', type: 'stock' },
  { code: '1216', name: '統一', market: 'TWSE', type: 'stock' },
  { code: '1301', name: '台塑', market: 'TWSE', type: 'stock' },
  { code: '1303', name: '南亞', market: 'TWSE', type: 'stock' },
  { code: '2002', name: '中鋼', market: 'TWSE', type: 'stock' },
  { code: '2207', name: '和泰車', market: 'TWSE', type: 'stock' },
  { code: '2303', name: '聯電', market: 'TWSE', type: 'stock' },
  { code: '2308', name: '台達電', market: 'TWSE', type: 'stock' },
  { code: '2317', name: '鴻海', market: 'TWSE', type: 'stock' },
  { code: '2330', name: '台積電', market: 'TWSE', type: 'stock' },
  { code: '2357', name: '華碩', market: 'TWSE', type: 'stock' },
  { code: '2382', name: '廣達', market: 'TWSE', type: 'stock' },
  { code: '2412', name: '中華電', market: 'TWSE', type: 'stock' },
  { code: '2454', name: '聯發科', market: 'TWSE', type: 'stock' },
  { code: '2603', name: '長榮', market: 'TWSE', type: 'stock' },
  { code: '2609', name: '陽明', market: 'TWSE', type: 'stock' },
  { code: '2615', name: '萬海', market: 'TWSE', type: 'stock' },
  { code: '2618', name: '長榮航', market: 'TWSE', type: 'stock' },
  { code: '2880', name: '華南金', market: 'TWSE', type: 'stock' },
  { code: '2881', name: '富邦金', market: 'TWSE', type: 'stock' },
  { code: '2882', name: '國泰金', market: 'TWSE', type: 'stock' },
  { code: '2885', name: '元大金', market: 'TWSE', type: 'stock' },
  { code: '2886', name: '兆豐金', market: 'TWSE', type: 'stock' },
  { code: '2887', name: '台新金', market: 'TWSE', type: 'stock' },
  { code: '2891', name: '中信金', market: 'TWSE', type: 'stock' },
  { code: '2912', name: '統一超', market: 'TWSE', type: 'stock' },
  { code: '3008', name: '大立光', market: 'TWSE', type: 'stock' },
  { code: '6505', name: '台塑化', market: 'TWSE', type: 'stock' }
];

const LS_KEY = 'stock_master_cache_v1';
const LS_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheShape {
  ts: number;
  stocks: StockMasterEntry[];
}

let memoryCache: Map<string, StockMasterEntry> | null = null;
let loadingPromise: Promise<Map<string, StockMasterEntry>> | null = null;

async function loadMaster(): Promise<Map<string, StockMasterEntry>> {
  if (memoryCache) return memoryCache;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const map = new Map<string, StockMasterEntry>();
    // 1. 從 hardcoded fallback 起手(永遠存在)
    for (const s of BUILTIN_FALLBACK) map.set(s.code, s);

    // 2. 試 localStorage 24h cache
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CacheShape;
        if (Date.now() - parsed.ts < LS_TTL_MS && Array.isArray(parsed.stocks)) {
          for (const s of parsed.stocks) map.set(s.code, s);
          memoryCache = map;
          return map;
        }
      }
    } catch {
      // localStorage 壞 / 私密模式 → 跳過,改 fetch JSON
    }

    // 3. fetch public/data/stock_master.json(build-time 產出)
    try {
      const res = await fetch('/data/stock_master.json');
      if (res.ok) {
        const payload = (await res.json()) as { stocks?: StockMasterEntry[] };
        if (Array.isArray(payload.stocks)) {
          for (const s of payload.stocks) {
            if (s && s.code && s.name) map.set(s.code, s);
          }
          // 寫入 localStorage 24h
          try {
            localStorage.setItem(
              LS_KEY,
              JSON.stringify({ ts: Date.now(), stocks: Array.from(map.values()) })
            );
          } catch {
            // 略
          }
        }
      }
    } catch (e) {
      console.warn('[stockMaster] fetch /data/stock_master.json failed:', e);
    }

    memoryCache = map;
    return map;
  })();

  return loadingPromise;
}

/**
 * 標準化代號:trim + uppercase + 補 0(1-3 位數字 → 4 位)
 *  - "50"     → "0050"
 *  - "2330"   → "2330"
 *  - "00631L" → "00631L"(已 6 位 / 含字母 → 不改)
 *  - "  2330 " → "2330"
 */
export function normalizeStockCode(input: string | number): string {
  let code = String(input ?? '').trim().toUpperCase();
  if (/^[0-9]{1,3}$/.test(code)) code = code.padStart(4, '0');
  return code;
}

export interface ValidateStockResult {
  /** 是否合法(可匯入) */
  valid: boolean;
  /** 標準化後的代號 */
  normalizedCode: string;
  /** 命中時的官方資料(優先級 master > db.stocks) */
  hit?: StockMasterEntry;
  /** 錯誤訊息;valid=true 時 undefined */
  error?: string;
}

/**
 * 驗證股票代號是否有效。
 *  1. 格式檢查:trim/uppercase/補 0
 *  2. master(JSON + 內建)有 → valid
 *  3. master 沒 → 退 db.stocks(玩家先前用 BuyModal 加過)→ 有 → valid
 *  4. 都沒 → invalid + 「查無此股票,請確認代號」
 */
export async function validateStockCode(input: string | number): Promise<ValidateStockResult> {
  const normalizedCode = normalizeStockCode(input);

  // 格式:不是純數字或英數字組合 → 格式錯
  if (!/^[0-9A-Z]{2,8}$/.test(normalizedCode)) {
    return {
      valid: false,
      normalizedCode,
      error: `股票代號「${normalizedCode}」格式不對(應為 4-6 位數字或英數字)`
    };
  }

  const master = await loadMaster();
  const hit = master.get(normalizedCode);
  if (hit) {
    return { valid: true, normalizedCode, hit };
  }

  // 退 db.stocks(玩家先前用 BuyModal/lookup 已 cache 過的)
  try {
    const dbStock = await db.stocks.get(normalizedCode);
    if (dbStock) {
      return {
        valid: true,
        normalizedCode,
        hit: {
          code: dbStock.code,
          name: dbStock.name,
          market: (dbStock.market === 'TPEX' ? 'TPEX' : dbStock.market === 'ETF' ? 'ETF' : 'TWSE'),
          type: dbStock.market === 'ETF' ? 'etf' : 'stock'
        }
      };
    }
  } catch {
    // ignore;Dexie 沒這欄就退到下面
  }

  return {
    valid: false,
    normalizedCode,
    error: `股票代號「${normalizedCode}」查無此股票,請確認代號正確(若已下市可能不在主檔)`
  };
}

/** 給 dev / 設定頁手動觸發重抓 */
export function clearStockMasterCache(): void {
  memoryCache = null;
  loadingPromise = null;
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // ignore
  }
}

/** 批次預載(Excel 匯入時用)— 觸發一次 fetch + 回 Map */
export async function preloadStockMaster(): Promise<Map<string, StockMasterEntry>> {
  return loadMaster();
}
