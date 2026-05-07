# PROJECT_STATUS.md

> 山海經股票養成（StockGame）目前狀態總覽。所有數字、門檻、欄位皆實際反映 `main` 分支的程式碼，不是泛泛說明。

最後更新對應 commit：`d78730f`（PhaserMap scene boot race 修復 + PWA manifest icons 修復；PR #4 squash merged 到 main）。

部署：https://stockgame-692.pages.dev（Cloudflare Pages，Production = `main` branch，自動部署）。

---

## 一、目前能做什麼 / 不能做什麼

| 範圍 | 狀態 |
|---|---|
| 台股上市 / 上櫃 / ETF 報價 | ✅ |
| 美股、港股、加密 | ❌（依使用者決議只做台股） |
| 買入 / 加碼 / 賣出（含手續費 + 證交稅） | ✅ |
| 當沖 | ❌（依使用者決議不做） |
| 寵物境界進化 / 黑化 / 淨化 | ✅ |
| 紀錄頁 6 圖表 + IRR / 夏普 / MDD | ✅ |
| 50 個成就（7 大類） | ✅ |
| Phaser 沙漠地圖、寵物隨機漫步、可拖曳鏡頭 | ✅ |
| PWA（可加桌面變 App）、本機儲存 | ✅ |
| Cloudflare Pages 部署（含 mis API 反向代理 Function） | ✅ 已上線 `stockgame-692.pages.dev` |
| 盤中自動更新股價(每 30s + 背景回前景補抓) | ✅(`silentRefresh` in `App.tsx`) |
| 「上次更新時間」相對時間提示 + stale 警示 | ✅(`TopBar` + `relativeTime`) |
| 價格變動視覺回饋(寵物 PnL 閃光、Modal 現價閃光) | ✅(`petSprite::flashPnL` + CSS keyframe) |
| PWA 安裝引導(iOS Safari 教學 + Android beforeinstallprompt) | ✅(`InstallPrompt.tsx`) |
| 寵物立繪美術(20 隻原創上古神祇) | ⚠️ 整合代碼已就緒,需本機跑 `download-sprites.mjs` 把 PNG 抓進 repo |
| 雲端帳號(Magic Link)+ 雙向 sync + 衝突 dialog | ✅(Supabase + `cloudSync.ts` + `SyncConflictModal`) |
| 帳號刪除(雲端 + 本地一起清) | ✅(`functions/api/auth/delete-account.ts` + 雙擊確認 UI) |
| 大盤對比（0050 / 加權指數） | ❌ |
| 跨用戶社群 / 排行榜 | ❌（依使用者決議「先單機」） |
| 自動產業分類（半導體 / 金融 / …） | ❌ 新代號全部歸到 `'other'`（ETF 識別 OK） |
| 國定假日 / 颱風假處理 | ❌ 倚賴 mis API 自動回最近一個交易日 |

---

## 二、技術棧 + Bundle 大小

| 層 | 套件 | 版本 | Bundle 影響 |
|---|---|---|---|
| 框架 | Vite + React + TypeScript | 6.x / 18.x / 5.x | 主 chunk 166KB（gz 55KB） |
| 遊戲引擎 | Phaser 3 | 3.87 | 獨立 chunk 1.48MB（gz 340KB） |
| 圖表 | Recharts | 2.15 | 獨立 chunk 565KB（gz 160KB），lazy load |
| 本地資料庫 | Dexie + dexie-react-hooks | 4.0 / 1.1 | — |
| UI | Tailwind CSS | 3.4 | CSS 21KB |
| 狀態管理 | Zustand（已裝、目前未使用，靠 useLiveQuery） | 5.0 | — |
| PWA | vite-plugin-pwa | 0.21 | — |

**首載大小**（Phaser eager + Recharts lazy）：~340KB gz；**紀錄頁打開**才再載 ~160KB gz。

部署需要 **Cloudflare Pages Functions** 解 mis.twse.com.tw 的 CORS（檔案 `functions/api/mis/[[path]].ts`）。GitHub Pages 不支援，會抓不到價。

---

## 三、資料模型（七張 Dexie 表）

宣告於 `src/db/schema.ts` v1。primary key 與索引欄位如下：

| 表 | 主鍵 | 索引欄位 | 用途 |
|---|---|---|---|
| `stocks` | `code` | `market`, `industry`, `isActive` | 股票主檔，玩家輸入新代號時透過 mis API 寫入 |
| `prices` | `code` | `updatedAt` | 即時 / 收盤價 cache |
| `holdings` | `code` | `lastTransactionAt`, `firstPurchasedAt` | **只存 active 持倉**，賣光即刪除 |
| `pets` | `id` (UUID) | `code`, `tier`, `retiredAt` | 含已退役寵物（圖鑑用） |
| `transactions` | `id` (UUID) | `code`, `type`, `timestamp` | append-only，含 buy/feed/sell |
| `achievements` | `id` | `unlockedAt` | 50 個成就的進度 + 解鎖時間 |
| `snapshots` | `date` (`YYYY-MM-DD` 台北時區) | — | 每日資產快照，圖表來源 |
| `settings` | `id` (固定 `'singleton'`) | — | 折扣 / 最低手續費 / 連登 / 帳戶建立時間 |

`holdings` ↔ `pets` 1:1（透過 `holding.petId`）。賣光時 `holdings` 該 row 刪除、`pets[id].retiredAt = now`。

---

## 四、外部 API 來源 + 失敗策略

實作在 `src/api/`。

### 端點

```
GET /api/mis/stock/api/getStockInfo.jsp?ex_ch=tse_2330.tw|otc_5269.tw|...&json=1&delay=0
```

- 一次最多 **50 檔**（`BATCH_SIZE = 50`），超過自動分批
- 上市用 `tse_` prefix、上櫃用 `otc_`、ETF 用 `tse_`（ETF 在台股是上市）
- 用 `q.ex` 與 `q.c.startsWith('00')` 共同判斷市場

### 盤中 / 盤外判斷（`src/api/marketHours.ts`）

| 變數 | 值 |
|---|---|
| `FIRST_FETCH_MINUTES` | 545（即 9:05） |
| `MARKET_CLOSE_MINUTES` | 810（即 13:30） |
| 交易日 | 週一到週五（沒處理國定假日） |

`isMarketOpen()` 為 true 時 `StockPrice.source = 'intraday'`，否則 `'close'`。盤外時 mis API 自然回最近一個交易日的收盤價，符合需求。

### 失敗策略（`src/api/retry.ts`、`src/api/errors.ts`）

```
maxRetries: 3
baseDelayMs: 1000  // 之後 exponential backoff
jitter: 0.3
retryOn: { 'network', 'http', 'rate-limit' }
not retryOn: { 'not-found', 'parse', 'unknown' }
```

錯誤分類後丟 `ApiError`，UI 一律顯示中文敘述（`describeApiError`）。**不靜默吞**。
失敗後 **保留前一次 `prices` 不歸零**，畫面顯示舊價 + 紅色 toast 顯示錯誤。

---

## 五、核心邏輯細節

### 5.1 手續費 / 證交稅（`src/utils/fees.ts`）

| 常數 | 值 |
|---|---|
| `FEE_RATE` | 0.001425 |
| `TAX_RATE_STOCK` | 0.003（一般股票賣方） |
| `TAX_RATE_ETF` | 0.001（ETF 賣方） |
| 預設 `discount` | 1.0（台新無折扣） |
| 預設 `minFee` | NT$20 |

公式：

```
fee  = max(minFee, floor(grossAmount × 0.001425 × discount))
tax  = isSell ? floor(grossAmount × (ETF ? 0.001 : 0.003)) : 0
買入實付 = grossAmount + fee
賣出實收 = grossAmount - fee - tax
```

設定彈窗用「幾折」單位輸入（28 折輸入 2.8，UI 內部轉成 0.28）。

### 5.2 買入 / 加碼 / 賣出（`src/services/portfolio.ts`）

全部用 Dexie transaction 包起來確保 holding/pet/transaction 三表一致。

| 動作 | 行為 |
|---|---|
| **買入新檔** | 建 `Holding` + 隨機抽 `CreatureSpecies` + 建 `Pet`（`tier='normal', maxNormalTier='normal'`） |
| **加碼** | `newAvgCost = (oldTotalCost + newNetAmount) / newShares`、`Pet.level` 重算 |
| **賣出（部分）** | `realizedPnL = round(netReceive - avgCost × soldShares)`、`avgCost` 不變、`totalCost` 等比縮減 |
| **賣出（全部）** | `db.holdings.delete(code)` + `pet.retiredAt = now`（進圖鑑） |

驗證：`shares` 必須是正整數、`price > 0`，否則 throw。

### 5.3 進化系統（`src/services/evolution.ts`）

**等級**（連續，與境界獨立）：

```ts
level = clamp(1, 99, floor(holding.totalCost / 1000) + 1)
```

每 NT$ 1,000 累積投入（含手續費）= 1 級，加碼會升級、部分賣出 totalCost 縮減會降級、賣光 holding 刪除（pet 凍結在退役時的 level）。

**正向境界門檻**（同時滿足才升）：

| 境界 | 累積報酬率 | 持有天數 |
|---|---|---|
| 凡獸 normal | 起始 | 0 |
| 靈獸 spirit | +5% | ≥ 30 |
| 妖獸 demon | +15% | ≥ 90 |
| 神獸 god | +30% | ≥ 180 |
| 聖獸 saint | +50% | ≥ 365 |
| 仙獸 celestial | +100% | ≥ 730 |

`Pet.maxNormalTier` 永遠記錄歷史最高（**不會降回**）。

**黑化門檻**（同時滿足）：

| 凶獸階 | 累積報酬率 | 持有天數 |
|---|---|---|
| cursed1 | ≤ -10% | ≥ 30 |
| cursed2 | ≤ -25% | ≥ 90 |
| cursed3 | ≤ -50% | ≥ 180 |

凶獸狀態下若達到 **`PURIFY_RETURN_RATE = 0.05`（+5%）** 立刻淨化回 `maxNormalTier`，`purificationCount += 1`。

**黑化視覺**（依使用者決議方案甲）：原寵物 emoji 變色 + alpha 0.55 + grayscale tint，**不換成四凶獨立種類**。

**評估時機**：每次 `runPriceUpdate()` 跑完後，買入/加碼/賣出當下不評估（沒最新價）。

### 5.4 成就（`src/services/achievements.ts` + `src/data/achievements.ts`）

50 個 evaluator，分七大類：

| 類別 | 數量 | 範例 |
|---|---|---|
| collection | 9 | first-buy、collect-25/50/75/100、four-symbols、pets-10/20/50 |
| profit | 12 | first-profit、profit-10/30/50/100/200、single-10k/100k/1m、monthly-3/6/12 |
| loss | 5 | first-corruption、single-down-50、cursed-3、feed-down-5、realize-loss-10 |
| evolution | 8 | evo-spirit/demon/god/saint/celestial、level-99、purify-1、celestial-3 |
| long-term | 9 | login-7/30/100/365、hold-1y/3y、diamond-hand、anniv-1y/3y |
| operation | 7 | first-sell、first-feed、feed-10/50/100、day-trader、zen-investor |
| social | 0 | （未來雲端化後加入） |

**評估流程**：
1. 一次性載入 `holdings`, `pets`, `transactions`, `prices`, `settings`, `summary`, `snapshots` 共 7 個來源
2. 每個 evaluator 從 ctx 取資料、回 `{ progress, unlocked }`
3. 「**一旦解鎖永久解鎖**」— 即使後來條件不再滿足也不撤銷
4. 觸發點：buy / feed / sell / 價格更新 / app 載入

`monthly-X` 特殊：從 `snapshots` 表取每月最後一筆 `totalPnL`，從最近往回數連續正報酬月份。

### 5.5 紀錄頁圖表

`src/components/charts/`，6 個元件 + 圖鑑：

| 元件 | 來源 | 計算邏輯 |
|---|---|---|
| `ReturnCurve.tsx` | `snapshots` | `returnRate = totalPnL / totalCost`；> 60 筆每隔 N 取樣 |
| `AllocationPie.tsx` | `holdings × prices × stocks` | 按 `industry` 或 `market` group by；圓餅 + Legend |
| `MonthlyPnL.tsx` | `snapshots` | 每月最後一筆 PnL 差值；最近 12 月 |
| `TopHoldings.tsx` | `holdings × prices` | 按未實現損益排序；TOP 5 賺 / 賠 |
| `HoldTimeDistribution.tsx` | `holdings.firstPurchasedAt` | 短(<30d) / 中(<365d) / 長(<1095d) / 超長 |
| `AdvancedMetrics.tsx` | `transactions + snapshots + summary` | XIRR + Sharpe + MaxDrawdown |

進階指標細節（`src/utils/finance.ts`）：

```
XIRR：Newton-Raphson 求解，cashflow = 買賣 netAmount + 當前市值
       100 次迭代或 |Δ| < 1e-9 收斂
Sharpe：dailyReturns.mean / std × sqrt(252)，rfRate 預設 0
MaxDrawdown：歷史權益曲線 (peak - current) / peak 取最大
```

資料不足回 `null`，UI 顯示「—」。

### 5.6 連續登入（`src/services/login.ts`）

`Settings` 三個欄位處理：

```
lastLoginDate?: string         // YYYY-MM-DD（台北時區）
consecutiveDays: number
maxConsecutiveDays: number
```

`checkInLoginToday()` 在 App 載入時呼叫一次（idempotent，同日多次不重複加）。
判斷方式：用 `Asia/Taipei` 時區的 `YYYY-MM-DD` 字串差 1 天即連續。

### 5.7 每日快照（`src/services/snapshot.ts`）

`recordDailySnapshot()` 在每次 `runPriceUpdate()` 之後呼叫。同日寫入會直接覆蓋當日快照（最後一次反映當日結尾）。`snapshots` 表用 `date` 當主鍵。

---

## 六、UI / Phaser 場景

### 6.1 Phaser World（`src/game/scene.ts`）

| 常數 | 值 |
|---|---|
| `WORLD_SIZE` | 1500 × 1500 |
| `GRID_CELL` | 220 |
| `COLS` | 6（floor(1500/220)） |
| 拖曳判定門檻 | 6 px（小於此距離視為點擊） |
| 沙漠裝飾 | 60 個（仙人掌 / 石頭 / 草），用 `Math.sin` 偽亂數 deterministic 散佈 |

寵物座標：`grid_index → 格子中心 + petId 雜湊偏移`，避免完全格狀也避免重疊。

### 6.2 Pet Sprite（`src/game/petSprite.ts`）

| 常數 | 值 |
|---|---|
| `TERRITORY_RADIUS` | 80 |
| `MOVE_SPEED` | 18 px/sec |
| `RING_RADIUS` | 38 |
| `EMOJI_SIZE` | 56 px |
| 抵達後停留 | 500–3000 ms 隨機 |

組成：Container = `[光環圈, emoji, 損益標籤, 名稱+Lv]`。走動時 emoji 依 dx 左右翻轉。
**境界顏色**（光環 ring stroke）：

```
normal      0xd1d5db
spirit      0x22c55e
demon       0xa855f7
god         0xeab308
saint       0xf97316
celestial   0xec4899
cursed1     0x6b21a8
cursed2     0x991b1b
cursed3     0x111111
```

黑化視覺：emoji.alpha = 0.55、tint = 0x444444。

### 6.3 React 元件（`src/components/`）

| 元件 | 對應功能 |
|---|---|
| `TopBar.tsx` | 5 個資產數字 + 盤中狀態 + 連登 + 成就計數 |
| `BottomBar.tsx` | 4 大按鈕 + 設定齒輪；無持倉時加碼/賣出禁用 |
| `Modal.tsx` | sheet（手機底部滑入 90vh） / center（彈出 92vw 85vh）兩變體 |
| `BuyModal.tsx` | 代號查詢（onBlur 自動）+ 股數 + 成本價 + 手續費試算 |
| `FeedModal.tsx` | 持倉下拉選 + 加碼，計算新均價 |
| `SellModal.tsx` | 「全部」「帶入現價」快捷 + 手續費 / 證交稅 / 已實現損益試算 |
| `PetInfoModal.tsx` | 點寵物開的個股資訊；含進化次數、淨化次數、首次黑化日期 |
| `RecordsModal.tsx` | 4 tab：圖表 / 成就 / 圖鑑 / 交易（最近 200 筆） |
| `SettingsModal.tsx` | 折扣（幾折）+ 最低手續費 + 玩家名稱 + 清除所有資料 |
| `Bestiary.tsx` | 圖鑑，依 8 大類分區，未收集顯示灰階 ??? |
| `HoldingPicker.tsx` | 加碼/賣出共用持倉清單下拉 |
| `Toast.tsx` | 4 秒自動消失，info/error 兩變體 |

---

## 七、神獸清單（20 隻原創上古神祇）

定義於 `src/data/creatures.ts`。從原山海經 40 隻路線轉成 **20 隻原創上古神祇** 主題(MJ 立繪 + 道家宇宙觀命名)。**黑化採方案甲（原寵物變色）**,所以沒有獨立的凶獸種類。

| # | id | 中文 | category | 兜底 emoji |
|---|---|---|---|---|
| 1 | `tai-chu-yan-jun` | 太初炎君 | spirit | 🔥 |
| 2 | `tai-su-xuan-lu` | 太素玄鹿 | beast | 🦌 |
| 3 | `wu-shi-zhi-die` | 無始之蝶 | spirit | 🦋 |
| 4 | `wu-ji-jin-zun` | 無極金尊 | lucky | 🪙 |
| 5 | `ji-zhi-ming` | 寂之鳴 | spirit | 🔔 |
| 6 | `tai-xuan-zhi-zhu` | 太玄之主 | spirit | 🌑 |
| 7 | `yuan-shi-lei-ting` | 原始雷霆 | spirit | ⚡ |
| 8 | `wu-zi-zhi-long` | 無字之龍 | dragon | 🐉 |
| 9 | `heng-chun-zhi-gui` | 恆春之龜 | aquatic | 🐢 |
| 10 | `wu-xiang-zhi-hu` | 無相之狐 | beast | 🦊 |
| 11 | `hong-meng-xue-huang` | 鴻濛血皇 | spirit | 🩸 |
| 12 | `tai-bai-jian-xian` | 太白劍仙 | spirit | ⚔️ |
| 13 | `xuan-huang-di-mu` | 玄黃地母 | spirit | 🌍 |
| 14 | `cang-ming-hai-zun` | 滄溟海尊 | aquatic | 🌊 |
| 15 | `huang-quan-meng-po` | 黃泉孟婆 | spirit | 🍵 |
| 16 | `zi-wei-tian-shu` | 紫微天樞 | spirit | ⭐ |
| 17 | `hong-meng-qin-zun` | 鴻蒙琴尊 | spirit | 🎵 |
| 18 | `ye-huo-luo-cha` | 業火羅剎 | spirit | 👹 |
| 19 | `tai-xu-jing-jun` | 太虛鏡君 | spirit | 🪞 |
| 20 | `hong-jun-dao-zu` | 鴻鈞道祖 | spirit | ☯️ |

全 20 隻都有對應 MJ 立繪(`docs/art-prompts.md` §1 表),`art: true`,Phaser 自動載 `public/sprites/<id>.png`,載不到 fallback 用上表 emoji。

`pickRandomCreature()` 從這 20 隻平均抽取,新檔買入時呼叫。

**「天罡四極」成就**(原「四象齊聚」,id 不變保留 `four-symbols`):同時擁有 鴻鈞道祖、玄黃地母、滄溟海尊、紫微天樞 即解鎖。`src/services/achievements.ts:96` 寫死這 4 個 ID。

---

## 八、已知限制 / 偏差

| 項目 | 影響 | 嚴重度 |
|---|---|---|
| `mis.twse.com.tw` 是非官方端點 | 哪天改格式或停用就會 break | 🟡 中 |
| 沒處理國定假日 / 颱風假 | 倚賴 mis 自然回最近交易日，目前看起來 OK | 🟢 低 |
| 新代號的 `industry` 全歸 `'other'`（除 ETF） | 圓餅圖按產業時都壓在「其他」 | 🟡 中（影響資產配置圖表體驗） |
| 進化判定只在價格更新時跑 | 買入/加碼後不會立刻顯示新境界，要按 🔄 | 🟢 低 |
| `monthly-X` 成就用 `totalPnL` 差值 | 月中有大筆現金注入會虛灌月損益 | 🟡 中 |
| XIRR 同上 | 大筆現金注入日造成假報酬 | 🟡 中 |
| `single-Xk` profit evaluator 只看當前持倉 | 已賣光的股票歷史最大獲利沒記錄 | 🟢 低（漏記但不誤算） |
| 圖鑑的「曾黑化過」用 species 集合判斷 | 同 species 多隻寵物中只要任一黑化就會打 hint | 🟢 低 |
| `lookupStock` cache 後 ETF/上市/上櫃判斷依賴 prefix `00` | `00` 開頭非 ETF（極少見）會誤判 | 🟢 低 |
| 沒重複買入再進化的「新寵物」隔離 | 賣光後再買，新寵物可能抽到同 species；無上鎖 | 🟢 低 |
| Bundle Phaser 1.48MB | 首載約 340KB gz（含 Phaser），手機 4G 約 2-3 秒 | 🟡 中 |
| 沒做螢幕方向鎖 | 橫屏時 layout 會走鐘 | 🟡 中 |

---

## 九、待辦清單（優先順序排序）

### A. 上線必要

- [x] **部署到 Cloudflare Pages**（`stockgame-692.pages.dev`，main 自動部署）
- [x] 修 PhaserMap scene boot race（讀 `scene.scene.isActive()` 在 SceneManager 注入 plugin 前會炸 undefined；改用 `game.scene.isBooted` 判斷，PR #4）
- [x] 修 PWA manifest icons 404（改用既有 `favicon.svg`，加現代 `mobile-web-app-capable` meta）
- [ ] 第一次部署後實機測試：抓 2330 / 0050 / 5269（上市/ETF/上櫃各一檔）
- [ ] 設置自訂 domain（可選，免費 `*.pages.dev` 就夠）

### B. 體驗優化（1-2 週）

- [x] ~~**自動排程更新股價**:盤中每 5 分鐘 tick;用 Page Visibility API 在背景關掉,回前台再啟動~~
      → **已完成**(`App.tsx::silentRefresh`,實際間隔 30s)
- [x] ~~上次抓價時間提示(「N 秒前 / N 分前」,超過 10 分鐘標紅)~~
      → **已完成**(`TopBar` + `utils/format::relativeTime`)
- [x] ~~價格變動視覺回饋(寵物 PnL 標籤閃光 + Modal 現價閃光)~~
      → **已完成**(`petSprite::flashPnL` + `index.css::flash-up/down`)
- [x] ~~PWA 安裝引導 banner(iOS Safari 教學 + Android beforeinstallprompt)~~
      → **已完成**(`InstallPrompt.tsx`,啟動 30s 後浮出)
- [ ] 進化判定改成 buy/feed 後立即跑(用最新 `prices` cache,可能有點舊但 UX 較好)
- [ ] 把「孵化動畫」/「進化光效」做成 Phaser Tween(目前生成寵物無視覺反饋)
- [ ] 設定頁加「測試手續費試算機」(輸入金額看結果)
- [ ] 螢幕方向鎖到 portrait(PWA manifest 已設 portrait,但網頁版橫屏仍會壞)

### C. 數據準確性（1-2 週）

- [ ] **產業分類資料源**：寫一個 GitHub Actions 每月跑 TWSE OpenAPI 抓上市產業表，commit 進 `src/data/industries.json`
- [ ] `monthly-X` 成就改用「以月份分桶的 transactions 累積差」而非 totalPnL diff
- [ ] XIRR 在大筆現金注入日的修正：現金注入不算「新增本金」就好，再評估
- [ ] 國定假日表 `src/data/holidays.json` + 假日不嘗試抓盤中

### D. 美術 / 動畫

從原計畫的「山海經 40 隻 × 4 frame」(走/站/進化/黑化)改成 **「20 隻原創上古神祇 × 單一立繪」** 簡化版。立繪 + 整合架構已完成。

**已完成:**
- [x] 20 隻原創上古神祇命名 + emoji 兜底 + 簡介(`creatures.ts`)
- [x] 立繪 PNG 整合(`PetSprite` 載 `public/sprites/<id>.png`,沒檔自動 fallback emoji)
- [x] PWA app icon(朱紅印章 + 「獸」字 SVG → 烘 192/512/maskable PNG)
- [x] 場景米紙底色(`#efe6cf`,跟立繪米紙底融合)
- [x] 「天罡四極」成就(取代「四象齊聚」)
- [x] 下載腳本(`scripts/download-sprites.mjs`,從 `art-prompts.md` §1 表自動讀)

**待辦(部分需本機操作):**
- [ ] **本機跑 `node scripts/download-sprites.mjs` 把 20 張 PNG 抓進 `public/sprites/`** —
      sandbox 連 MJ CDN 會 403,只能在玩家自己電腦跑,跑完 commit
- [ ] 進化「渡劫」全螢幕動畫(雷光、光柱、變身光效)
- [ ] 黑化動畫(黑霧、紅眼、震動)
- [ ] 沙漠地圖背景圖(替換目前 emoji decoration、可分區域:沙丘 / 綠洲 / 廢墟)
- [ ] 圖鑑 modal 的格子改成卡片翻面 / 收集進度動畫
- [ ] 走路動畫(目前移動時 sprite 不變,只有方向 flipX)— MVP 不做,日後可補

### E. 雲端 / 社群（長期，依使用者「先單機」決議延後）

- [ ] Firebase Auth + Firestore 帳號雲端同步
- [ ] 邀請朋友看「動物園」
- [ ] 排行榜（總報酬率、收集進度）
- [ ] 推播通知（個股觸及目標報酬時）— iOS PWA 不支援，要考慮原生包

### F. 資料安全 / 維運

- [ ] **自動匯出備份**：每週寫入 IndexedDB 同時匯出 JSON 到使用者瀏覽器下載資料夾
- [ ] 設定頁加「匯入 / 匯出 JSON」按鈕（避免清快取就資料全失）
- [ ] mis API 改版偵測：parse 失敗時記入錯誤 log（之後若加雲端可上報）
- [ ] PWA service worker 升級流程測試（避免使用者卡在舊版）

---

## 十、檔案總表（依目錄）

```
StockGame/
├── functions/api/mis/[[path]].ts     # CF Pages Function：mis.twse 反向代理
├── public/favicon.svg                # PWA icon 占位
├── src/
│   ├── api/
│   │   ├── errors.ts                 # ApiError + describeApiError
│   │   ├── marketHours.ts            # 盤中 / 盤外 / 台北時區字串
│   │   ├── twseMis.ts                # mis.twse 抓即時報價
│   │   ├── priceFetcher.ts           # 對外統一介面 fetchPrices()
│   │   ├── stockLookup.ts            # 新代號查詢 + cache 寫入
│   │   ├── retry.ts                  # exponential backoff
│   │   └── index.ts
│   ├── components/
│   │   ├── Modal.tsx, Toast.tsx      # 通用
│   │   ├── TopBar.tsx, BottomBar.tsx # 主畫面
│   │   ├── BuyModal/FeedModal/SellModal/SettingsModal/PetInfoModal/RecordsModal
│   │   ├── HoldingPicker.tsx         # 加碼 / 賣出共用
│   │   ├── Bestiary.tsx              # 山海經圖鑑
│   │   └── charts/
│   │       ├── ReturnCurve.tsx
│   │       ├── AllocationPie.tsx
│   │       ├── MonthlyPnL.tsx
│   │       ├── TopHoldings.tsx
│   │       ├── HoldTimeDistribution.tsx
│   │       └── AdvancedMetrics.tsx
│   ├── data/
│   │   ├── creatures.ts              # 40 隻神獸定義
│   │   └── achievements.ts           # 50 個成就定義
│   ├── db/
│   │   ├── schema.ts                 # Dexie 7 表 v1
│   │   ├── seed.ts                   # 初次啟動寫入預設 settings
│   │   └── index.ts
│   ├── game/
│   │   ├── PhaserMap.tsx             # React 容器
│   │   ├── scene.ts                  # WorldScene（地圖 / 拖曳 / sync）
│   │   └── petSprite.ts              # PetSprite class
│   ├── services/
│   │   ├── portfolio.ts              # buyOrFeed / sell
│   │   ├── evolution.ts              # 進化 / 黑化 / 淨化 純函式
│   │   ├── priceUpdate.ts            # 抓價 + 寫 DB + 觸發進化
│   │   ├── summary.ts                # PortfolioSummary 計算
│   │   ├── achievements.ts           # 50 個 evaluator + orchestrator
│   │   ├── snapshot.ts               # recordDailySnapshot
│   │   ├── login.ts                  # 連續登入計數
│   │   └── index.ts
│   ├── types/
│   │   ├── market.ts                 # Stock, StockPrice, Market, Industry
│   │   ├── creature.ts               # Tier, CreatureSpecies
│   │   ├── pet.ts                    # Pet, NormalTier, isCorrupted()
│   │   ├── holding.ts                # Holding
│   │   ├── transaction.ts            # Transaction
│   │   ├── achievement.ts            # AchievementDef, AchievementProgress
│   │   ├── snapshot.ts               # DailySnapshot
│   │   ├── settings.ts               # Settings
│   │   └── index.ts
│   ├── utils/
│   │   ├── fees.ts                   # 手續費 / 證交稅
│   │   ├── format.ts                 # 千位逗號、百分比、天數
│   │   ├── finance.ts                # XIRR / Sharpe / MDD
│   │   ├── uuid.ts                   # crypto.randomUUID 包裝
│   │   └── index.ts
│   ├── App.tsx                       # Game shell + modal 路由
│   ├── main.tsx
│   ├── index.css                     # Tailwind + safe-area + reset
│   └── vite-env.d.ts
├── index.html                        # PWA meta、字型 preload
├── tailwind.config.js                # 台股紅綠 + 沙漠色 + 境界色
├── postcss.config.js
├── vite.config.ts                    # PWA + manualChunks + dev proxy
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── package.json
└── README.md
```
