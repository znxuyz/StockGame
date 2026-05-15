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
  /**
   * @deprecated 階段 5A.2 起改用雲端 `user_profile.nickname` 統一管理玩家名稱。
   * 欄位保留不刪以相容舊資料;`createProfileIfNeeded` 第一次建 user_profile
   * 時會把這個值寫入新的 nickname,之後 SettingsModal 不再顯示 / 寫入此欄位。
   */
  playerName?: string;
  /** 帳戶建立時間（成就：週年） */
  createdAt: number;
  /** 上次登入日期 YYYY-MM-DD（用於計算連續登入） */
  lastLoginDate?: string;
  /** 目前連續登入天數 */
  consecutiveDays: number;
  /** 歷史最高連續登入天數 */
  maxConsecutiveDays: number;
  /**
   * 階段 4B.4:已解鎖的家園背景 id 清單。預設 ['default'],
   * 每張新背景花 500 修為解鎖一次,append 進此 array,後續切換不再扣費。
   */
  unlockedBackgrounds?: string[];
  /** 階段 4B.4:當前選用的家園背景 id。預設 'default' */
  currentBackground?: string;
  /**
   * 階段 4B.3:HUD 主題色 id。每解一個新主題花 200 修為,切換不重複扣費。
   * data-theme 屬性同步到 <html>,index.css 用 CSS variables 對應。
   */
  hudTheme?: HudTheme;
  /**
   * 階段 4B.3:已解鎖的 HUD 主題 id 清單。預設 ['default'],
   * 解鎖後 append 進此 array,可隨時切換不再扣費。
   */
  unlockedHudThemes?: HudTheme[];
  /**
   * 階段 3B:本機端寫入時間(unix millis)。
   *
   * **不是 Dexie schema 變動**(IndexedDB 對 document store 不檢查 shape),
   * 純 TS 型別新增 optional 欄位。settingsRepo 的 cloud-first 實作每次 `put`/
   * `patch` 自動寫入 `Date.now()`,讓 stale-while-revalidate 能跟雲端
   * `updated_at` 比對誰新。舊資料沒這個欄位 → 視為最舊(0),雲端值勝出。
   */
  updatedAt?: number;
}

/** HUD 主題 4 選 1(階段 4B.3)。CSS variables 在 index.css [data-theme="..."] 區段 */
export type HudTheme = 'default' | 'jade' | 'purple' | 'red';
