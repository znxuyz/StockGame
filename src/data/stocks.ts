import type { Stock } from '@/types';

/**
 * 起手包：常見台股 + ETF（約 80 檔）。
 *
 * 為什麼不直接抓 TWSE/TPEx 全清單？
 *  - 全清單約 1700 檔，啟動就抓會慢且大部分用不到
 *  - 起手包讓買入彈窗一開啟就有 autocomplete
 *  - 使用者輸入未列在起手包中的代號時，會即時打 API 補齊（API client 會處理）
 *
 * 來源：依 TWSE 上市、TPEx 上櫃公開資料整理。
 * isActive 預設 true；若日後有下市再從 API 同步狀態。
 */
export const STARTER_STOCKS: Stock[] = [
  // 半導體
  { code: '2330', name: '台積電', market: 'TWSE', industry: 'semiconductor', isActive: true },
  { code: '2454', name: '聯發科', market: 'TWSE', industry: 'semiconductor', isActive: true },
  { code: '2308', name: '台達電', market: 'TWSE', industry: 'semiconductor', isActive: true },
  { code: '2303', name: '聯電', market: 'TWSE', industry: 'semiconductor', isActive: true },
  { code: '3711', name: '日月光投控', market: 'TWSE', industry: 'semiconductor', isActive: true },
  { code: '6669', name: '緯穎', market: 'TWSE', industry: 'semiconductor', isActive: true },
  { code: '3034', name: '聯詠', market: 'TWSE', industry: 'semiconductor', isActive: true },
  { code: '3035', name: '智原', market: 'TWSE', industry: 'semiconductor', isActive: true },
  { code: '6488', name: '環球晶', market: 'TPEX', industry: 'semiconductor', isActive: true },
  { code: '2379', name: '瑞昱', market: 'TWSE', industry: 'semiconductor', isActive: true },
  { code: '3037', name: '欣興', market: 'TWSE', industry: 'semiconductor', isActive: true },
  { code: '3105', name: '穩懋', market: 'TPEX', industry: 'semiconductor', isActive: true },
  { code: '8016', name: '矽創', market: 'TWSE', industry: 'semiconductor', isActive: true },
  { code: '5269', name: '祥碩', market: 'TPEX', industry: 'semiconductor', isActive: true },
  { code: '6415', name: '矽力-KY', market: 'TWSE', industry: 'semiconductor', isActive: true },
  { code: '2344', name: '華邦電', market: 'TWSE', industry: 'semiconductor', isActive: true },
  { code: '6770', name: '力積電', market: 'TWSE', industry: 'semiconductor', isActive: true },
  { code: '5347', name: '世界', market: 'TPEX', industry: 'semiconductor', isActive: true },
  { code: '2337', name: '旺宏', market: 'TWSE', industry: 'semiconductor', isActive: true },
  { code: '6239', name: '力成', market: 'TWSE', industry: 'semiconductor', isActive: true },

  // 電子下游
  { code: '2317', name: '鴻海', market: 'TWSE', industry: 'electronics', isActive: true },
  { code: '2382', name: '廣達', market: 'TWSE', industry: 'electronics', isActive: true },
  { code: '2354', name: '鴻準', market: 'TWSE', industry: 'electronics', isActive: true },
  { code: '2376', name: '技嘉', market: 'TWSE', industry: 'electronics', isActive: true },
  { code: '2474', name: '可成', market: 'TWSE', industry: 'electronics', isActive: true },
  { code: '2356', name: '英業達', market: 'TWSE', industry: 'electronics', isActive: true },
  { code: '2353', name: '宏碁', market: 'TWSE', industry: 'electronics', isActive: true },
  { code: '2357', name: '華碩', market: 'TWSE', industry: 'electronics', isActive: true },
  { code: '4938', name: '和碩', market: 'TWSE', industry: 'electronics', isActive: true },
  { code: '3231', name: '緯創', market: 'TWSE', industry: 'electronics', isActive: true },
  { code: '3017', name: '奇鋐', market: 'TWSE', industry: 'electronics', isActive: true },
  { code: '2360', name: '致茂', market: 'TWSE', industry: 'electronics', isActive: true },
  { code: '2383', name: '台光電', market: 'TWSE', industry: 'electronics', isActive: true },
  { code: '6274', name: '台燿', market: 'TWSE', industry: 'electronics', isActive: true },
  { code: '6116', name: '彩晶', market: 'TWSE', industry: 'electronics', isActive: true },
  { code: '2367', name: '燿華', market: 'TWSE', industry: 'electronics', isActive: true },
  { code: '5289', name: '宜鼎', market: 'TPEX', industry: 'electronics', isActive: true },
  { code: '3138', name: '耀登', market: 'TPEX', industry: 'electronics', isActive: true },
  { code: '3211', name: '順達', market: 'TWSE', industry: 'electronics', isActive: true },
  { code: '6163', name: '華電網', market: 'TPEX', industry: 'electronics', isActive: true },
  { code: '8110', name: '華東', market: 'TPEX', industry: 'electronics', isActive: true },

  // 金融
  { code: '2880', name: '華南金', market: 'TWSE', industry: 'finance', isActive: true },
  { code: '2881', name: '富邦金', market: 'TWSE', industry: 'finance', isActive: true },
  { code: '2882', name: '國泰金', market: 'TWSE', industry: 'finance', isActive: true },
  { code: '2884', name: '玉山金', market: 'TWSE', industry: 'finance', isActive: true },
  { code: '2885', name: '元大金', market: 'TWSE', industry: 'finance', isActive: true },
  { code: '2886', name: '兆豐金', market: 'TWSE', industry: 'finance', isActive: true },
  { code: '2887', name: '台新金', market: 'TWSE', industry: 'finance', isActive: true },
  { code: '2890', name: '永豐金', market: 'TWSE', industry: 'finance', isActive: true },
  { code: '2891', name: '中信金', market: 'TWSE', industry: 'finance', isActive: true },
  { code: '2892', name: '第一金', market: 'TWSE', industry: 'finance', isActive: true },
  { code: '2883', name: '開發金', market: 'TWSE', industry: 'finance', isActive: true },
  { code: '2888', name: '新光金', market: 'TWSE', industry: 'finance', isActive: true },

  // 食品
  { code: '1216', name: '統一', market: 'TWSE', industry: 'food', isActive: true },
  { code: '1227', name: '佳格', market: 'TWSE', industry: 'food', isActive: true },
  { code: '2912', name: '統一超', market: 'TWSE', industry: 'food', isActive: true },

  // 電信
  { code: '2412', name: '中華電', market: 'TWSE', industry: 'telecom', isActive: true },
  { code: '3045', name: '台灣大', market: 'TWSE', industry: 'telecom', isActive: true },
  { code: '4904', name: '遠傳', market: 'TWSE', industry: 'telecom', isActive: true },

  // 塑膠
  { code: '1301', name: '台塑', market: 'TWSE', industry: 'plastic', isActive: true },
  { code: '1303', name: '南亞', market: 'TWSE', industry: 'plastic', isActive: true },
  { code: '1326', name: '台化', market: 'TWSE', industry: 'plastic', isActive: true },
  { code: '6505', name: '台塑化', market: 'TWSE', industry: 'plastic', isActive: true },

  // 鋼鐵
  { code: '2002', name: '中鋼', market: 'TWSE', industry: 'steel', isActive: true },
  { code: '2027', name: '大成鋼', market: 'TWSE', industry: 'steel', isActive: true },

  // 航運
  { code: '2603', name: '長榮', market: 'TWSE', industry: 'shipping', isActive: true },
  { code: '2609', name: '陽明', market: 'TWSE', industry: 'shipping', isActive: true },
  { code: '2615', name: '萬海', market: 'TWSE', industry: 'shipping', isActive: true },

  // 觀光 / 餐飲
  { code: '2731', name: '雄獅', market: 'TWSE', industry: 'tourism', isActive: true },
  { code: '2723', name: '美食-KY', market: 'TWSE', industry: 'tourism', isActive: true },

  // 紡織
  { code: '1402', name: '遠東新', market: 'TWSE', industry: 'textile', isActive: true },

  // 生技
  { code: '6446', name: '藥華藥', market: 'TWSE', industry: 'biotech', isActive: true },
  { code: '4174', name: '浩鼎', market: 'TPEX', industry: 'biotech', isActive: true },
  { code: '1722', name: '台肥', market: 'TWSE', industry: 'biotech', isActive: true },

  // ETF（證交稅 0.1%，市場標 ETF）
  { code: '0050', name: '元大台灣50', market: 'ETF', industry: 'etf', isActive: true },
  { code: '0056', name: '元大高股息', market: 'ETF', industry: 'etf', isActive: true },
  { code: '00878', name: '國泰永續高股息', market: 'ETF', industry: 'etf', isActive: true },
  { code: '00919', name: '群益台灣精選高息', market: 'ETF', industry: 'etf', isActive: true },
  { code: '00929', name: '復華台灣科技優息', market: 'ETF', industry: 'etf', isActive: true },
  { code: '00940', name: '元大臺灣價值高息', market: 'ETF', industry: 'etf', isActive: true },
  { code: '00713', name: '元大台灣高息低波', market: 'ETF', industry: 'etf', isActive: true },
  { code: '00692', name: '富邦公司治理', market: 'ETF', industry: 'etf', isActive: true },
  { code: '00881', name: '國泰台灣5G+', market: 'ETF', industry: 'etf', isActive: true },
  { code: '00891', name: '中信關鍵半導體', market: 'ETF', industry: 'etf', isActive: true },
  { code: '00900', name: '富邦特選高股息30', market: 'ETF', industry: 'etf', isActive: true }
];

/** 起手包索引（O(1) 查詢） */
const STOCK_MAP = new Map(STARTER_STOCKS.map((s) => [s.code, s]));

/** 從起手包中查股票（DB 內可能還有更多，這只是 fallback） */
export function getStarterStock(code: string): Stock | undefined {
  return STOCK_MAP.get(code);
}
