/**
 * 寵物實例。
 *
 * 三維度養成系統(階段 1.1)欄位約定:
 *  - 等級(Lv.1-999)            從 holding.totalCost derived,不存
 *  - 魂環境界(凡/靈/妖/神/聖/仙) 從 holding.firstPurchasedAt derived,不存
 *  - 魂環特效(暗/普通/脈動/旋轉/噴光) 從 holding × price derived,不存
 *
 * 真正存 pet 表的:基本資訊 + 兩個養成系統用的欄位。
 */
export interface Pet {
  /** 唯一 id（UUID） */
  id: string;
  /** 對應股票代號（與 holding.code 一致） */
  code: string;
  /** 神獸種類 id */
  speciesId: string;
  /** 修為等級 1-999(buy/feed 時用 calculateLevel(totalCost) 寫入,賣出後不下降) */
  level: number;
  /** 出生時間（unix millis） */
  bornAt: number;
  /** 退役時間（unix millis）— 賣光股票時設定，非 null 表示已進圖鑑 */
  retiredAt?: number;
  /** 玩家自訂名(階段 4 改名儀式用,目前不開放編輯) */
  customName?: string;
  /**
   * 上次境界檢查值。每次 PetSprite.applyData 拿 status.realm 跟這個比,
   * 升級了就觸發突破慶祝動畫,然後寫回 lastRealmCheck。
   * 防止「同一境界突破」反覆觸發動畫。
   */
  lastRealmCheck?: import('@/services/petTier').SoulRealm;
  /**
   * 上次魂環特效檢查值(階段 2.3)。effect 升級才 earn 修為,
   * 從低升高才獎勵,從高降低不扣。防報酬率震盪洗修為。
   */
  lastEffectCheck?: import('@/services/petTier').RingEffect;
}
