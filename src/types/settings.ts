/** 全域設定（單例，主鍵固定為 'singleton'） */
export interface Settings {
  /** 主鍵固定為 'singleton'，方便 Dexie put */
  id: 'singleton';
  /** 券商手續費折扣（1.0 = 無折扣，0.28 = 28 折），預設 1.0 */
  brokerageFeeDiscount: number;
  /** 最低手續費（NT$），預設 20 */
  brokerageMinFee: number;
  /** 是否啟用音效 */
  soundEnabled: boolean;
  /** 上次價格更新時間（unix millis） */
  lastPriceUpdateAt?: number;
  /** 上次每日快照寫入日期 YYYY-MM-DD */
  lastSnapshotDate?: string;
  /** 玩家自訂名稱 */
  playerName?: string;
  /** 帳戶建立時間（成就：週年） */
  createdAt: number;
  /** 上次登入日期 YYYY-MM-DD（用於計算連續登入） */
  lastLoginDate?: string;
  /** 目前連續登入天數 */
  consecutiveDays: number;
  /** 歷史最高連續登入天數 */
  maxConsecutiveDays: number;
}
