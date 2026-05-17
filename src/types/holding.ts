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
  /**
   * 對應寵物 id(同一個 holding 一隻寵物)。
   *
   * **本機快取限定欄位 — 不上雲**(階段 6 保留):
   * - portfolio.ts buyOrFeed/sell 用此 PK 找對應 active pet
   * - 雲端 `holdings` 表沒這 column;`holdingRepo.toLocal` 從雲端拉時
   *   找對應本機 pet (by code) 或 mint placeholder uuid
   * - 跨裝置 sync 後 pet 用 code 對齊,petId 重新生成不影響功能
   */
  petId: string;
}
