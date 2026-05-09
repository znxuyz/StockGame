/**
 * 寵物實例。
 *
 * 2026-05 後改版:已移除「境界(tier)/ 黑化 / 淨化」整套系統。
 * 留下的只是「神獸種類 + 持有資訊 + 修為等級數字」,
 * 等下個版本再做新養成機制。
 */
export interface Pet {
  /** 唯一 id（UUID） */
  id: string;
  /** 對應股票代號（與 holding.code 一致） */
  code: string;
  /** 神獸種類 id */
  speciesId: string;
  /** 修為等級 1-99（依累積投入金額計算,純顯示用,沒掛 tier 對應） */
  level: number;
  /** 出生時間（unix millis） */
  bornAt: number;
  /** 退役時間（unix millis）— 賣光股票時設定，非 null 表示已進圖鑑 */
  retiredAt?: number;
}
