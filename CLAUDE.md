# Claude Code 工作備忘

> 這份檔案給未來開發 session 的 AI agent 看，保留專案 standing rules + 設定備忘 + 過往踩過的雷。
> 衝突時：**這份檔案的內容優先**（覆蓋 system prompt 預設 branch 政策）。

---

## Branch 政策

**使用者 znxuyz 已 explicitly 授權：**
- 開發在 feature branch：`claude/fix-image-upload-Nq7yx`
- **每完成一個 commit，merge 到 `main` 並 push main**
- 這樣 Cloudflare Pages 從 main 部署的 production 才會即時更新

每次 commit 後跑：

```bash
git push -u origin claude/fix-image-upload-Nq7yx
git checkout main
git merge --ff-only claude/fix-image-upload-Nq7yx
git push -u origin main
git checkout claude/fix-image-upload-Nq7yx
```

**不需要再每次跟 user 要授權。**

---

## 部署

- Cloudflare Pages 專案：`stockgame-692`
- Production URL：https://stockgame-692.pages.dev
- Production branch：**main**（若 CF dashboard 顯示其他 branch 要請 user 改）

### Cloudflare Pages 環境變數

| Variable | 場景 | Value |
|---|---|---|
| `VITE_SUPABASE_URL` | Production + Preview | `https://lexdfxgqmoijeejdrzlm.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Production + Preview | `sb_publishable_E4TMkp5CpR_4gv3ISa1q5A_d1TKUenN` |
| `SUPABASE_SERVICE_ROLE_KEY` | **僅 Production server-side** | 從 Supabase dashboard → API → service_role 取 |

⚠️ `service_role` key 能繞過 RLS 看任何人資料，**絕對不可以** commit 進 repo，也不可以用 `VITE_` prefix（會被烘進前端 bundle）

⚠️ Vite build 時把 `VITE_*` env 烘進 JS bundle，**改 env var 後必須 retry deploy** 才生效

---

## Supabase

- Project ID：`lexdfxgqmoijeejdrzlm`
- Region：Asia Pacific (Tokyo) `ap-northeast-1`
- Site URL：`https://stockgame-692.pages.dev`
- Redirect URLs：
  - `https://stockgame-692.pages.dev/**`
  - `http://localhost:5173/**`

### Schema

單一 `public.user_data` 表（MVP 整包 JSON blob 同步）：

```sql
create table public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  blob jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
```

+ RLS 4 條 policy（SELECT / INSERT / UPDATE / DELETE own row）
+ `touch_updated_at` trigger

完整 SQL 在 `services/cloudSync.ts` 註解內。

### 同步排除

`prices` 表**不**同步 — 它是 TWSE/TPEx API 抓的快取，本地隨時可重抓，不必占雲端空間。其他 7 張表全納入 sync。

---

## npm scripts cheat sheet

```bash
# 開發
npm run dev               # localhost:5173
npm run build             # production build
npm run typecheck         # 型別檢查
npm run preview           # 預覽 build

# 資產處理（本機跑）
npm run build:icons       # public/app-icon-source.JPG → public/icons/*.png
npm run process:ui-assets # public/assets/btn/*.JPG → 去背 PNG
npm run download:sprites  # MJ 立繪 → public/sprites/*.png（必須本機跑，CDN 擋 sandbox）
npm run fetch:industries  # TWSE OpenAPI → src/data/industries.json
npm run fetch:holidays    # TaiwanCalendar → src/data/holidays.json

# 沒 npm wrapper，需要時直接跑：
node scripts/flood-fill-sprite-bg.mjs file1.png      # flood-fill + halo 指定檔(限 transp < 5%)
node scripts/flood-fill-sprite-bg.mjs --auto         # 自動偵測 4 角 alpha > 8 OR partial > 4%
node scripts/flood-fill-sprite-bg.mjs --halo         # 全 50 隻只跑 halo cleanup(安全 idempotent)
```

---

## 美術立繪流程

- 50 隻角色立繪 URL 列在 `docs/art-prompts.md` §1 表
- `npm run download:sprites` 把 PNG 抓到 `public/sprites/<id>.png`
  - **必須在使用者本機跑**，sandbox / CI / Cloudflare Function 都會被 cdn.midjourney.com 擋 403
  - 跑完 commit `public/sprites/` 進 repo
- `creatures.ts` 每隻 `art: true`，Phaser 自動載 `/sprites/<id>.png`，沒檔 fallback emoji
- **若 PNG 有殘留背景 / halo** → 跑 `node scripts/flood-fill-sprite-bg.mjs <file>`
  - **跑前 mandatory backup**：`cp -r public/sprites /tmp/sprites-before`
  - **只能對「整片無去背」(transparent < 5%) 的 sprite 跑** — 別碰已有透明 ring 的 sprite，否則 BFS 會跨 transparent gap 進主體吃白色細節（見下方雷區「flood-fill 不可跨 transparent gap」）
  - BFS 從 4 角 RGB seed 出發，跟 seed 顏色接近 (delta < 32) 清成透明，距離較大 (32-55) 線性淡 alpha 後停止擴散，更大停
  - 透明像素直接停 BFS（**不**跨越），保護已被去背的主體
  - halo cleanup pass 走完 flood-fill 後形態學清理孤立 partial-alpha
  - 跑完 audit：`opaque%` 不應該大幅下降（>15% drop = 主體被吃，restore backup 重來）

---

## Dexie schema 演進

| v | 內容 | upgrade 處理 |
|---|---|---|
| 1 | 初始 8 張表 | — |
| 2 | + marketIndices | 加新表 |
| 3 | Pet 拿掉 `position` / `territory`（神獸座標改 game scene 內管理；後改為 world-relative playableArea） | upgrade callback 走訪 pets 刪兩欄位，**保留所有用戶資料** |
| 4 | tier / 黑化 / 淨化 系統移除 step 1：cursed1/2/3 tier → 'normal'。順便 bulkDelete 9 個 corruption / tier 進化成就紀錄 | upgrade callback 改 tier 字串、刪 achievement |
| 5 | Pet 拔掉 `tier` / `maxNormalTier` / `evolutionCount` / `firstCorruptedAt` / `purificationCount` 五個欄位 + 拔 tier 主鍵索引。新版 Pet 只剩 id / code / speciesId / level / bornAt / retiredAt | stores 改 `'id, code, retiredAt'`(無 tier index) + upgrade callback delete 五欄位 |
| 6 | Pet 加 `customName?` / `lastRealmCheck?` optional 欄位(三維度養成系統用) | no-op upgrade(IndexedDB document store 不需 schema 改) |
| 7 | 修為點數系統 — 加 2 張表 | `userCultivation: 'id'`(singleton 'main')+ `cultivationLog: '++id, createdAt, reason, relatedPetId'` |
| 8 | Pet 加 `lastEffectCheck?: RingEffect` optional(防報酬率震盪洗修為) | no-op upgrade |
| 9 | 簽到任務系統 — 加 3 張表:`userLoginStreak`(id 'main' singleton)、`userTasks`(++id auto, indexed by taskKey/taskType/completed/claimed)、`milestoneRewards`(++id, **&milestoneDay 唯一索引**防重領) |
| 10 | **重大修正** userTasks 拿掉 boolean index — IndexedDB 不接受 boolean 當 valid key,完成寫不進去 → 任務 tab 永遠空。stores 改 `'++id, taskKey, taskType'` | no-op data upgrade(只重建 indexes) |
| 11 | Pet 加 `boostedDays?: number` / `effectBoostUntil?: number` optional 欄位(階段 4A.3 催熟 + 4A.4 淬煉,修為消耗管道) | upgrade callback 把舊資料 `boostedDays` backfill 為 0;`effectBoostUntil` 不 backfill(undefined = 沒 boost) |
| 12 | 進階消耗管道(階段 4B)資料層:Pet 加 `colorVariant?: PetColorVariant`(配色 5 選 1);Settings 加 `unlockedBackgrounds` / `currentBackground` / `hudTheme` / `unlockedHudThemes` 4 個 optional 欄位 | upgrade callback backfill 全部預設值:pet.colorVariant='default';settings.unlockedBackgrounds=['default'] / currentBackground='default' / hudTheme='default' / unlockedHudThemes=['default'] |
| 13 | 深度消耗管道(階段 4C)資料層:Pet 加 `isEternal?: boolean` / `eternalDate?: number` / `finalEffect?: RingEffect`(4C.2 永恆紀念);新增 `creatureUnlocks` 表(4C.3 圖鑑故事解鎖,`++id, &creatureId` 唯一索引防重複) | upgrade callback backfill 舊 pet `isEternal=false`;eternalDate / finalEffect 不 backfill;`creatureUnlocks` 是新表自然空 |

新增 schema 升級時，務必在 `src/db/schema.ts` 用 `version(N).upgrade(...)` 寫 migration，不要直接改 type 然後爆用戶資料。

---

## 玻璃 UI 約定（class 對齊）

| 元件 | class | alpha | blur |
|---|---|---|---|
| HUD（top） | `.hud` | 0.35（米白） | 20 / saturate 140% |
| BottomBar | `.hud-bottom` | 0.35（米白） | 20 / saturate 140% |
| Modal 抽屜 | `.glass-popup` | 0.75（米白） | 24 / saturate 150% |
| Modal 後幕 | `.modal-backdrop` | 0.25（黑） | 8 |
| Modal 標題列 | `.glass-popup-header` | 0.5（米白） | 8 |
| Modal 內容區 | `.glass-popup-content` | — | — |
| 列表項目卡 | `.item-card` | 白 0.4 | 8 |
| 圖表外殼 | `.data-card` | 白 0.35 | 8 |
| 成就卡 | `.achievement-card[.unlocked]` | 0.35 / 金 0.5 | 6 |
| 解鎖數量列 | `.unlock-counter` | 白 0.4 | 6 |
| 三色 stat pill | `.stat-pill-{rose,blue,amber}` | 各色 0.15 | 6 |
| 圓形 close 鈕 | `.glass-close-btn` | 白 0.4 | 8 |
| 統一輸入欄位 | `.input-field` | 白 0.6 | — |

新增彈窗 / 卡片時優先沿用以上 class，不要自寫 inline style。完整定義在 `src/index.css` `@layer components`。

---

## 三維度養成系統(階段 1)

每隻神獸 derived 三個獨立維度,**全部從 holding + price 即時算,不存 DB**:

| 維度 | 來源 | 範圍 |
|---|---|---|
| 等級 Lv.1-999 | `holding.totalCost / 1000 + 1` | 1-999 |
| 魂環境界 | `monthsHeld`(從 holding.firstPurchasedAt 算) | fan 0 / ling 3 / yao 12 / shen 36 / sheng 60 / xian 120 月 |
| 魂環特效 | `returnRate` | dim < 0 / normal < 0.2 / pulsing < 0.5 / rotating < 1.0 / erupting ≥ 1.0 |

魂環顏色:fan #FFFFFF / ling #FFD700 / yao #9C27B0 / shen #1A1A1A(銀邊) / sheng #E63946 / xian rainbow

API:
- `getRealm(monthsHeld)` / `getRingEffect(returnRate)` / `getPetStatus(pet, holding, price)`
- `realmProgress(monthsHeld)` 算「距下境界還幾月 + 0-1 progress」(進度條用)

Pet 表 derived 不存的欄位:level / monthsHeld / returnRate / realm / effect。
Pet 表存的:`customName?`(階段 4 改名用)、`lastRealmCheck?`(防境界突破動畫重複觸發)、`lastEffectCheck?`(防報酬率震盪洗修為)。

Phaser sprite 視覺:
- 9 顆魂環半圓在腳下(`SoulRingRenderer`),addAt(0) 進 PetSprite.container 最底層
- effect 5 種動畫:dim alpha 0.3 / normal 靜態 / pulsing alpha tween / rotating angle 360° 8s / erupting 4s + 粒子噴發
- sprite 下方獨立 `levelText`(amber-400 金 + bold 黑邊)
- 升級綠色 +N 飄字 + sprite amber-200 黃光閃 0.5s
- 升境界 3 秒慶祝動畫:全螢幕黑幕 + 對應顏色光柱 + 全螢幕中央文字 + sprite scale 1.2x bounce
  - **慶祝期間 sprite.lockDepthAt(9200, 3000)** 鎖 depth 避免 step() 蓋掉(踩過的雷,見下方雷區)

---

## 修為點數系統(階段 2)

統一貨幣 `cultivation`,跨全 app 行為的回饋系統。

### 賺取來源(階段 2 已上線 5 個)
| 來源 | reason 代碼 | 金額 |
|---|---|---|
| 神獸升級 | `pet_level_up` | (newLv - oldLv) × 5 |
| 境界突破 | `realm_breakthrough` | +200 |
| 報酬率特效升級 pulsing/rotating/erupting | `effect_unlock` | +50 / +50 / +100 |
| 第一次召喚某 species | `pet_added_codex` | +20 |
| 賣出該次有獲利 | `sell_profit` | floor(realizedPnL / 1000) |

### 消耗來源
階段 4A / 4B / 4C 全部實作完畢,共 8 個 reason 代碼。階段 4A 三顆 button 在 `PetInfoModal` 底部(每隻神獸獨立花費);階段 4B 三項在 `SettingsModal`(全域設定);階段 4C 兩項在 `BestiaryPetModal`(圖鑑詳細頁)。
| 按鈕位置 | reason | 金額 | 效果 |
|---|---|---|---|
| PetInfoModal:改名 | `rename` | 50 | 寫 `pet.customName`,1-10 字限中英數,不可同原名 |
| PetInfoModal:催熟 | `realm_boost` | 100 | `pet.boostedDays += 30`,monthsHeld 跳 1 月,可能跨境界 |
| PetInfoModal:淬煉 | `effect_boost` | 500 | `pet.effectBoostUntil = now + 7d`,魂環特效強制升一階 |
| PetInfoModal:換色 | `recolor` | 300 | `pet.colorVariant` 5 選 1,Phaser sprite 套對應 tint |
| SettingsModal:HUD 主題 | `theme` | 200 | 解鎖一次永久持有;切換時 `<html data-theme>` 即時切 CSS 變數 |
| SettingsModal:家園背景 | `background` | 500 | 解鎖一次永久持有;切換時 `WorldScene.setBackgroundId` 動態載入 texture |
| BestiaryPetModal:永恆紀念 | `eternal` | 2000 | `pet.isEternal=true`,圖鑑卡金邊 + ✨ 角標 + finalEffect 永久動態 |
| BestiaryPetModal:解鎖傳說 | `unlock_story` | 100 | `creatureUnlocks` 表 append,per-creatureId 永久解鎖(賣光重買仍解鎖) |

**淬煉雙重給付防護**:`PetStatus` 拆 `effect`(渲染用,boost 套用後)/ `naturalEffect`(報酬率原值);`PhaserMap` 的 `effect_unlock` 比對改用 `naturalEffect`,玩家花 500 淬煉不會拿回 +50 自然 reward。`pet.lastEffectCheck` 永遠存 naturalEffect。

### 防重複觸發
- **levelUp**:newLevel > oldLevel 才發,寫入新 level 後下次比對自然 = 不重發
- **firstSummon**:`db.pets.where('speciesId').count() === 0` 才發,**包括 retired pet 也算 count**,所以賣光重買不會重發 +20
- **realm/effect**:寫回 `pet.lastRealmCheck` / `pet.lastEffectCheck`,新值跟舊值不同才進判斷,只有 rank 升才發,降級不扣修為(但仍寫回)
- **報酬率震盪 pulsing → normal → pulsing**:第一次 +50,跌回不扣,再升又 +50(算重新解鎖,符合 spec)

### 視覺
- HUD 💎 數字 count-up 動畫(`CultivationCounter`,800ms easeOutCubic,連續變動 cleanup flag 避免 race)
- 綠色 +N 飄字(`CultivationFloater`,1.5s 漸入上飄漸出,amount ≥ 100 加 18px 金色光圈三層 text-shadow)
- stagger 300ms 排隊,連續觸發不重疊(`useRef nextEmitAtRef`)
- 紀錄頁第 6 個 tab(`CultivationTab`):當前餘額 + 累計 + 歷史(50 筆 + 載入更多)+ 點擊跳該 pet 詳細頁

### Cloud sync
沿用既有 `user_data.blob` 不開新表,擴充 `CloudBlob.userCultivation` + `cultivationLog`,**SCHEMA_VERSION 1→2**。

衝突解決限制:blob-level pull-overwrites-local,沒做 field-level merge。多裝置同時操作可能互蓋,做 cross-device 即時同步要加 polling + lifetime_earned max merge(現有 7 表都這個限制)。

### eventBus
`src/services/eventBus.ts` 50 行輕量 type-safe event bus,EventMap 集中註冊事件 payload。
事件:`'cultivation:earn'` / `'cultivation:spend'` / `'task:trigger'` / `'task:completed'`。

---

## 簽到 + 任務系統(階段 3)

每天打開 App → 領簽到 → 推任務 → 累積修為 → 養神獸的日常循環。

### 連登

App.tsx 啟動 await `checkAndUpdateStreak()`:
  - 第一次玩 → 建 row, currentStreak = 1
  - lastLoginDate === today → 同日重開,`isNewDay=false`
  - lastLoginDate === yesterday → currentStreak += 1, longestStreak 取 max
  - 更早 → 斷簽,currentStreak = 1
  - todayClaimed reset = false(進新一天才能再簽)

`isNewDay && !todayClaimed` → 跳 `DailyCheckInModal` 自動。

### 簽到 modal

7 日進度格用 `((currentStreak - 1) % 7) + 1` 算「目前在本週第幾天」。
streak=8 → 第 1 格(進入下週)。

點「領取今日修煉」呼叫 `claimTodayLogin()`:
  1. `earnCultivation(10, 'daily_login', ...)` — 基礎簽到
  2. 命中里程碑(7/14/30/60/100)→ 額外 `earnCultivation(reward, 'streak_milestone', ...)`
     用 `milestoneRewards.milestoneDay` 唯一索引防重領,
     race 時 db.add 第二筆 throw catch 跳過
  3. todayClaimed = true

### 連登中斷 UX
顯示「歷史最長 N 日」當激勵,不羞辱玩家。

### 里程碑全螢幕慶祝
`MilestoneCelebration` 訂閱 `eventBus 'cultivation:earn'` 過濾 reason='streak_milestone',
3 秒全螢幕:黑幕(0.6 alpha)+ 金色光柱(從下往上)+ 中央 🎉 + 文字。
跟 CultivationFloater 平行 emit,飄字在 HUD 旁、慶祝在中央,不打架。

### 任務池與生成

| 池 | 數量 | 重置時機 | 抽幾個 |
|---|---|---|---|
| `DAILY_TASK_POOL` | 8 | 每日凌晨 0:00 | 3 |
| `WEEKLY_TASK_POOL` | 7 | 每週日凌晨 0:00 | 4 |

App.tsx 啟動 await `checkAndGenerateDailyTasks()` + `checkAndGenerateWeeklyTasks()`:
  - 拉現有 taskType,若有 generatedAt >= 本期 start → 不重抽
  - 否則清舊 + shuffle pool 抽 N 個寫進 db.userTasks

`getThisWeekStart` 退到上一個週日 0:00,週日當天就是今天 0:00。

### 統一 task:trigger event

11 個業務點 emit `'task:trigger'` { triggerEvent, delta },
1 個訂閱者(`taskService.attachTaskListeners`)接 → `incrementTaskProgress`。
sugar fn `emitTaskTrigger(triggerEvent, delta=1)`,呼叫端不需碰 eventBus 細節。

11 個 emit 點:
  - `portfolio.buyOrFeed` 新檔 → `pet_buy_new` + `pet_buy_amount`
  - `portfolio.buyOrFeed` 加碼 → `pet_feed` + `pet_buy_amount`
  - `portfolio.buyOrFeed` 升級 → `pet_level_up`(levelsGained)
  - `portfolio.sell` 該次獲利 → `pet_sell_profit`
  - `PhaserMap` realm 升級 → `realm_breakthrough`
  - `PhaserMap` effect 升級 → `effect_unlock`
  - `RecordsModal` overview/bestiary/transactions tab → `view_chart`/`view_codex`/`view_records`
  - `PetInfoModal` open(pet)→ `open_pet_info`
  - `App.tsx` 新一天 → `login`

### 任務完成 UX

`TaskCompletedToast` 訂閱 `'task:completed'`,右上角 emerald-500 卡片滑入 3 秒。
連續多任務完成 stack 往下,各自 3s 自動消失。

`BottomBar` 紀錄按鈕 badge:`useLiveQuery` 拉全 userTasks,memory filter completed && !claimed count。
Dexie 不索引 boolean,直接 toArray + filter(任務量小)。

### 雲端同步
`CloudBlob` 加 3 欄(`userLoginStreak` / `userTasks` / `milestoneRewards`)。
SCHEMA_VERSION 2 → 3。沿用既有 blob 模式不開新 Supabase 表。

`App.tsx` useLiveQuery 訂閱 3 表:
  - `userLoginStreak.get('main')`
  - **`userTasks.toArray()`**(用 toArray 不用 count,Dexie liveQuery 對 count 在 update 時不 retrigger,任務 progress 推進也要 push)
  - `milestoneRewards.count()`(append-only)

useEffect deps 加進去,任何變動 → pushDebounced 1s。

---

## Phaser 場景約定

- `WORLD_WIDTH = 2400` × `WORLD_HEIGHT = 1600`（橫向 3:2 大地圖，camera 可拖可縮，類公主連結家園）
- `playableArea` = **world-relative 固定矩形** (40, 120) → (2360, 1460)
  - 不再隨 viewport 變動 — 神獸散布整個 world，玩家拖 camera 才看得到所有神獸
  - 從 world 邊緣保留 HUD 90 + buffer 30 / BottomBar 110 + buffer 30 / 兩側 40，避免 camera 拖到角落時神獸被 UI 完全蓋住
- 背景圖 `assets/bg/main.JPG` 1344×896（3:2）對 world 2400×1600 做 cover-fit，scale 1.786x 兩軸無裁切
- 神獸 hit area = `image.setInteractive(scene.input.makePixelPerfect(1))`（pixel-perfect，點哪到哪）
- 神獸 wandering = `scene.tweens` 拉到 `playableArea` 內隨機目標，停 1-5 秒再下一輪
- 神獸碰撞 = 多圓形 body shape（3 圓覆蓋立繪輪廓）→ 圓-圓相交 → 雙方 `bounceTo` 反方向 60px tween 200ms + 300ms 恢復期
- depth = `container.y`（下方蓋上方，跟視覺一致）

---

## 已知雷 / 過往踩過的坑

- **既有測試資料 schema mismatch**：早期山海經 ID（青龍/白虎...）的 pet record，refactor 後找不到對應物種 → UI 顯示 ❓ emoji。User 已知用 `indexedDB.deleteDatabase('StockGameDB')` 清資料
- **achievement `four-symbols` id 保留**：DB 層用 'four-symbols' 當 key 不能改（舊 user 已存），只把名稱改「天罡四極」、target 4 隻改成 鴻鈞道祖 / 玄黃地母 / 滄溟海尊 / 紫微天樞
- **Vite env var build-time bake**：改 env var **必須** retry deploy 才生效；dev 啟動後改 `.env.local` 也要重啟 dev server
- **Auth redirect**：Supabase 設定的 Site URL + Redirect URLs 是 hard-coded，新增部署環境（例如 staging）要去 Supabase dashboard 加。OAuth (Apple/Google) 跟密碼重設信都用同一份 redirect allowlist
- **Apple / Google OAuth provider 預設藏起來**:`SignInModal` 用 `VITE_ENABLE_APPLE_LOGIN` / `VITE_ENABLE_GOOGLE_LOGIN` 兩個 env flag 控制按鈕渲染,預設不顯示。要顯示 → Supabase Dashboard 先啟用 provider,再去 Cloudflare Pages env var 設成 `true` + retry deploy。沒同步好(flag=true 但 provider 沒啟用)點下去會被 `mapAuthError` 翻成「這個登入方式尚未啟用,請改用 Email 登入」
- **Email confirm 預設開**：Supabase 預設 signUp 後要點 email 確認連結才能登入。SETUP.md 建議關掉（Authentication → Providers → Email → Confirm email），不然 `signUp` 完 session 不會立刻 fire,使用者以為註冊失敗
- **iOS Safari `navigator.vibrate`**：iOS 不支援，**寫了不會錯但只 Android Chrome / 桌機 Chromium 會震**
- **Phaser Container + pixelPerfect**：`makePixelPerfect` 必須掛在有 texture 的 GameObject（Image / Sprite）。Container 沒 texture，要把 hit 對象從 container 改到內部 image / emoji
- **Phaser tween 跟手動位移衝突**：tween 進行中時手動 `container.x = ...` 會被下一 tick 覆蓋。要修改位置必須先 `scene.tweens.killTweensOf(container)` 再設
- **iOS PWA 全螢幕安全區**：`env(safe-area-inset-top/bottom)` 在桌機 = 0，iOS PWA = 44 / 34。HUD / BottomBar 都要把 padding 加 safe-area 才不會被瀏海 / home indicator 蓋
- **MJ sprite 整片殘留純白閾值修不了**：`download-sprites.mjs --remove-bg` 用 RGB > 245 → 透明，但 MJ 直接吐的 JPG 背景常是漸變色 / 米黃 / 不純白，主體周圍 halo 也清不掉。改用 `flood-fill-sprite-bg.mjs` BFS 從 4 角 seed 蔓延，能修整片殘留 + halo
- **flood-fill seed 採樣要過濾全透明像素**：早期版本從角落 RGB 平均當 seed，但全透明像素的 RGB 是 garbage，會把 seed 染成非殘留色，BFS 失準。改用「4 角各取 24×24，僅 alpha>50 的像素平均」
- **flood-fill 不可跨 transparent gap（最痛的雷）**：早期版本 BFS 在 `alpha < 5` 時繼續向 4 鄰擴散，理由是「讓 BFS 走過已透明邊界帶抵達內側殘留」。**錯**。原始 sprite 通常已被 iOS Lift Subject 處理過、主體被一圈透明 gap 包圍。BFS 跨越這圈 gap 進到主體內部，把跟 bg 顏色相近的淺色細節（白骨、白翼、淺色高光）誤殺。`gu-hun-ku-shou` 從 74% opaque 被啃到 31%（PR #16 修正）。**正解**：BFS 遇 `alpha < 5` 就停，只走「跟 edge 經 opaque 路徑連通」的 bg。主體被透明 gap 完整保護
- **不要對已被去背的 sprite 跑 flood-fill**：transparent > 5% 的 sprite 視為「已處理」，重跑 flood-fill 沒好處（BFS 在邊界停下）但有風險（一旦 gap 不完整就鑽進主體）。`--auto` 模式預先過濾，但若手動指定檔案要先看 `transp%`
- **constructor 內 prev/curr 偵測 first-time skip 陷阱**：PetSprite constructor 先 `this.data = data` 然後 call `this.applyData(data)`,applyData 內 `const prev = this.data` 拿到的就是同一個 `data`,**任何 `prev !== data` 比對全 false → first-time render 被跳過**。階段 1.2 的 9 顆魂環 graphics 整個沒被 draw,在 production 看不到任何環(PR #28 修)。**正解**:constructor 末尾手動 call `ringRenderer.render(realm, effect)` 補第一次。其他「prev !== data 才做」的偵測(flashPnL / levelUp 飄字)維持 skip 是正確的(出生不該閃 / 不該飄)
- **scene step() 每 frame setDepth 蓋外部 setDepth**:PetSprite.step() 每 tick `setDepth(container.y)` 排序。慶祝動畫想把 sprite 拉到 overlay 之上 `setDepth(9200)` 會立刻被下一 frame 蓋掉,sprite 反而被埋在黑幕下(PR #29 修)。**正解**:用 `sprite.lockDepthAt(value, durationMs)` API,step() 內檢查 `scene.time.now < depthLockUntil` 就 skip 一陣子,讓 setDepth 能維持。
- **修為 earnCultivation 不能在 db.transaction 內 await**:`earnCultivation` 自己會寫 db.userCultivation + db.cultivationLog,如果包進外層 portfolio 的 `db.transaction` 會 Dexie scope 衝突卡住。**正解**:transaction 內收集獎勵 array(in scope 之外 declare),tx commit 後才 `for ... await earnCultivation(...)` 順發。飄字事件也應該 tx commit 後才出,讓玩家看到的數字跟 DB 狀態一致
- **Dexie liveQuery 對 count() 在 update 時不 retrigger**:`useLiveQuery(() => db.X.count())` 只在新增/刪除時變,update(同一筆改欄位)不 trigger。如果要偵測「進度推進」這種 update,改用 `toArray()` 拉整 array 當 deps。階段 3.8 雲端同步 userTasks 用 toArray 而非 count 就是這個原因
- **task:trigger event 設計取捨**:不開 11 個 event 各對應 11 種 trigger,而是用一個統一 `'task:trigger'` event payload `{ triggerEvent, delta }`。1 個訂閱者(`taskService.attachTaskListeners`)attach 一次,11 個業務點 emit 同 channel。優點維護成本低 + 未來改機制只動兩處;缺點每個 emit 要寫 `triggerEvent` 字串(但 TaskTriggerEvent union 確保打字錯誤被 TS 抓)

---

## 已棄用 / 不要再做的事

- ❌ `frame_card.png` 9-slice 邊框（已換玻璃擬態，CSS class `.ornate-frame` 也已移除）
- ❌ `top_banner.png`（已改 fixed `.hud`）
- ❌ `icon.svg`（已改 9 尾狐 PNG）
- ❌ `Pet.position` / `Pet.territory` 欄位（v3 schema 已刪）
- ❌ `Pet.tier` / `Pet.maxNormalTier` / `Pet.evolutionCount` / `Pet.firstCorruptedAt` / `Pet.purificationCount` 欄位（v5 schema 已刪）
- ❌ `Tier` / `NormalTier` / `TIER_ORDER` / `CURSED_ORDER` / `isCorrupted()` 型別與工具（整套 tier 系統移除）
- ❌ 「凡獸境/靈獸境/妖獸境/神獸境/聖獸境/仙獸境」六階文字標籤 + 「凶獸一/二/三階」黑化標籤（不再使用）
- ❌ 「進化 / 黑化 / 淨化」事件 toast 與相關成就（first-corruption / cursed-3 / evo-* / purify-1 / celestial-3 都已移除）
- ❌ `Modal variant="sheet" | "center"` prop（全砍，現在都是抽屜式）
- ❌ Phaser `pickNewTarget` / `home` / `territory` 概念（改 tween-based 全地圖漫遊）
- ❌ `setInteractive(new Phaser.Geom.Rectangle/Circle, ...)` 在神獸上（一律 pixelPerfect）
- ❌ Arcade Physics（暫不上，user 要看軟性 body shape 反彈一週是否夠）
- ❌ flood-fill BFS 跨越 `alpha < 5` 透明像素（PR #16 拔掉，會吃進主體白色細節）
- ❌ 對 `transparent > 5%` 的已去背 sprite 跑 flood-fill（沒好處有風險）
- ❌ 跑 sprite 處理 script 不先 `cp -r public/sprites /tmp/sprites-before` 備份（爆掉 50 隻就回不去）

---

## 文件分工

- `README.md` → 給人看：玩法 / 特色 / 怎麼開發
- `PROJECT_STATUS.md` → 給人看：實際做了什麼 / 沒做什麼 / 限制
- `CLAUDE.md`（這份）→ 給 AI agent 看：branch 政策 / 雷區 / 慣例
- `SETUP.md` → 給 fork 部署的人看：Supabase + Cloudflare 從零開始
