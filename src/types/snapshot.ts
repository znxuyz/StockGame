/**
 * 每日資產快照（畫累積報酬率折線圖用）。
 * 每天最多一筆，後寫的覆寫先寫的（用日期當主鍵）。
 */
export interface DailySnapshot {
  /** 日期字串 YYYY-MM-DD（台北時區），主鍵 */
  date: string;
  /** 當日總市值 */
  totalMarketValue: number;
  /** 當日累積投入成本 */
  totalCost: number;
  /** 當日未實現損益 */
  unrealizedPnL: number;
  /** 當日累積已實現損益 */
  realizedPnL: number;
  /** 當日總損益 = 未實現 + 已實現 */
  totalPnL: number;
  /** 當日報酬率 = totalPnL / totalCost（totalCost = 0 時為 0） */
  returnRate: number;
  /** 紀錄寫入時間 */
  recordedAt: number;
}
