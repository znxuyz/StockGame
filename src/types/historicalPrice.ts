/**
 * 歷史日收盤價快取(階段 5H)— 給「累積報酬率 / 月度損益」歷史曲線回推用。
 *
 *  - 主鍵 [code+date](compound)— 一檔股票一天最多一筆
 *  - close 是調整後收盤價(adjusted close,Yahoo Finance 提供,已 forward-adjust
 *    除權息影響,可直接用來算「持有期間的真實漲跌」)
 *  - source 標來源,日後若需要對帳能追溯
 */
export interface HistoricalPrice {
  /** 股票代號(同 db.stocks.code) */
  code: string;
  /** YYYY-MM-DD(台北時區),不含小時 */
  date: string;
  /** 調整後收盤價 */
  close: number;
  /** 'yahoo' | 'twse' | 'manual' — 抓不到的來源不會寫,所以這欄一定有值 */
  source: 'yahoo' | 'twse' | 'manual';
  /** 寫入時間,debug 用 */
  fetchedAt: number;
}
