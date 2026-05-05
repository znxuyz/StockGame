/** 交易類型 */
export type TransactionType = 'buy' | 'feed' | 'sell';

/** 交易紀錄（不可變更，只追加） */
export interface Transaction {
  /** UUID */
  id: string;
  /** 股票代號 */
  code: string;
  /** 交易類型 */
  type: TransactionType;
  /** 股數（一律正數） */
  shares: number;
  /** 成交價（每股） */
  price: number;
  /** 成交金額（不含費用 = shares * price） */
  grossAmount: number;
  /** 手續費（買賣都收，台新預設 0.1425%、最低 NT$20） */
  fee: number;
  /** 證交稅（賣才收，一般股票 0.3%、ETF 0.1%） */
  tax: number;
  /** 實付/實收金額（買 = grossAmount + fee；賣 = grossAmount - fee - tax） */
  netAmount: number;
  /** 已實現損益（賣才有值；買/加碼為 0） */
  realizedPnL: number;
  /** 交易發生時間（unix millis） */
  timestamp: number;
  /** 備註（可選） */
  note?: string;
}
