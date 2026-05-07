/**
 * 大盤 / 指數歷史資料(目前只追蹤加權指數 TAIEX)。
 *
 * 主鍵 = 複合 [symbol+date],這樣 (TAIEX, 2026-05-06) 唯一。
 * Dexie 的 [symbol+date] 寫法支援 array key,查單筆用 db.marketIndices.get([sym, date])。
 */

export type MarketIndexSymbol = 'TAIEX'; // 之後想加 0050 / 加權報酬指數再擴

export interface MarketIndexBar {
  symbol: MarketIndexSymbol;
  /** YYYY-MM-DD(台北時區) */
  date: string;
  /** 收盤指數值(盤中時用最新值代替) */
  close: number;
  /** 抓取時間 unix ms */
  fetchedAt: number;
  /** intraday = 盤中即時, close = 已收盤定案 */
  source: 'intraday' | 'close';
}
