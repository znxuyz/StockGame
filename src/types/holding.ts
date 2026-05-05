/**
 * 當前持倉。
 * 一檔股票一筆 holding，shares 歸零時保留紀錄但移到圖鑑（pet.retiredAt 設值）。
 * 即每次同代號買入時若已有 holding 就走加碼路徑，沒有才新建 holding。
 */
export interface Holding {
  /** 主鍵：股票代號（每檔股票一筆） */
  code: string;
  /** 目前持有股數（賣光後設 0；之後再買會建新 holding） */
  shares: number;
  /** 平均每股成本（含手續費） */
  avgCost: number;
  /** 累積投入金額（包含每次加碼的成本與手續費） */
  totalCost: number;
  /** 累積已實現損益（多次部分賣出累積） */
  realizedPnL: number;
  /** 該檔首次購入日（unix millis） */
  firstPurchasedAt: number;
  /** 最近一次交易時間（unix millis） */
  lastTransactionAt: number;
  /** 對應的寵物 id（同一個 holding 一隻寵物） */
  petId: string;
}
