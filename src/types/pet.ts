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
  /** 玩家自訂名(階段 4A.2 改名儀式;空字串 / undefined → 用 species.name 預設) */
  customName?: string;
  /**
   * **本機快取限定欄位 — 不上雲**(階段 6 保留:純 UI 防抖)。
   *
   * 上次境界檢查值。PetSprite.applyData 拿 status.realm 跟這個比,
   * 升級了才觸發突破慶祝動畫 + 寫回 lastRealmCheck;防同境界突破反覆放動畫。
   *
   * 為什麼**不上雲**:1) frame-write 級別頻率 2) 純 UI 狀態,跨裝置無意義
   *(換裝置重新 fetch pet 時 lastRealmCheck=undefined → 不放動畫,正確行為)。
   * petRepo.CLOUD_FIELDS_OF_PET whitelist 排除此欄位。
   */
  lastRealmCheck?: import('@/services/petTier').SoulRealm;
  /**
   * **本機快取限定欄位 — 不上雲**(階段 6 保留:純修為防抖)。
   *
   * 上次魂環特效檢查值。effect 升級才 earn 修為,從低升高才獎勵,
   * 從高降低不扣。防報酬率震盪洗修為(同 lastRealmCheck 不上雲理由)。
   */
  lastEffectCheck?: import('@/services/petTier').RingEffect;
  /**
   * 累積催熟天數(階段 4A.3 境界催熟)。
   * 計算 monthsHeld 時加上 `boostedDays * 86400000 ms`,等同神獸提早幾天出生。
   * 預設 0;每次催熟 +30(消耗 100 修為)。仙境神獸不能再催熟。
   */
  boostedDays?: number;
  /**
   * 魂環淬煉到期時間(unix ms,階段 4A.4 魂環淬煉)。
   * `effectBoostUntil > now` → 強制把 natural ring effect 升一階
   * (dim→normal, normal→pulsing, pulsing→rotating, rotating→erupting,
   * erupting→erupting 已最高不變)。
   * `<= now` 或 undefined → 用自然 effect。
   * 一次淬煉持續 7 天(消耗 500 修為);重複淬煉 = 重新計時 7 天。
   */
  effectBoostUntil?: number;
  /**
   * 神獸配色(階段 4B.2 配色淬煉)。Phaser sprite 套對應 tint 顏色。
   *  default → 不套 tint(原始立繪顏色)
   *  cyan / gold / purple / rose → 套對應 tint
   * 每次換色花 300 修為,可反覆換。預設 'default'。
   */
  colorVariant?: PetColorVariant;
  /**
   * 永恆紀念旗標(階段 4C.2)。退役神獸花 2000 修為「永恆封印」,
   * 圖鑑卡的魂環從靜態變回退役當下的動態特效。
   * true 後不可逆,沒「取消紀念」操作。
   */
  isEternal?: boolean;
  /** 永恆紀念時間(unix ms),配合 isEternal=true 才有意義 */
  eternalDate?: number;
  /**
   * 退役當下的魂環特效快照(階段 4C.2)。
   * 賣光神獸時 portfolio.sell 寫入,圖鑑卡用這個還原原本動態效果
   * (不再依賴 holding/price 即時算,因為已退役沒持倉資料)。
   */
  finalEffect?: import('@/services/petTier').RingEffect;
}

/** 神獸配色 5 選 1(階段 4B.2)。tint 對應顏色在 services/pets/petColor.ts */
export type PetColorVariant = 'default' | 'cyan' | 'gold' | 'purple' | 'rose';
