/**
 * 台股市場分類
 *  - TWSE：上市
 *  - TPEX：上櫃（興櫃也歸這）
 *  - ETF：ETF（雖然多半在 TWSE，但證交稅 0.1% 與一般股票 0.3% 不同，獨立分類）
 */
export type Market = 'TWSE' | 'TPEX' | 'ETF';

/**
 * 產業分類。
 *
 * 從 src/data/industries.json(TWSE/TPEx OpenAPI 月更)抓的字串會直接落這欄,
 * 例如「半導體業」、「電腦及週邊設備業」、「金融業」等繁中原始名稱。
 * 特例:
 *  - 'etf'   ETF 全部歸這
 *  - 'other' 找不到產業 / 新代號的兜底
 */
export type Industry = string;

/** 台股股票主檔 */
export interface Stock {
  /** 股票代號（含 ETF），主鍵 */
  code: string;
  /** 中文名稱 */
  name: string;
  /** 市場分類 */
  market: Market;
  /** 產業分類 */
  industry: Industry;
  /** 是否仍在上市 */
  isActive: boolean;
}

/** 即時價格快取（每次 API 抓回來覆寫） */
export interface StockPrice {
  /** 股票代號，主鍵 */
  code: string;
  /** 當前價（盤後等於收盤價） */
  currentPrice: number;
  /** 昨日收盤 */
  previousClose: number;
  /** 漲跌金額 */
  change: number;
  /** 漲跌幅（小數，0.05 = +5%） */
  changePercent: number;
  /** 最後更新時間（unix millis） */
  updatedAt: number;
  /** 來源：盤中即時 / 收盤價（盤後/假日） */
  source: 'intraday' | 'close';
}
