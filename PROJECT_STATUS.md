# 神獸股市 · 目前狀態

> `main` branch 實況。所有打勾項目都實際跑得起來，未做的明確標 ❌ 不藏。

**Live**：https://stockgame-692.pages.dev（Cloudflare Pages，Production = `main`，自動部署）

---

## 一、做了什麼 / 沒做什麼

### 玩法

| 項目 | 狀態 |
|---|---|
| 台股上市 / 上櫃 / ETF 報價 | ✅ |
| 買入 / 加碼 / 賣出（含手續費 + 證交稅） | ✅ |
| 寵物境界進化 / 黑化 / 淨化（舊系統） | ❌ 2026-05 整套移除（v5 schema 拔欄位） |
| **三維度養成系統**：等級 Lv.1-999 / 魂環境界 6 階 / 魂環特效 5 種 | ✅（階段 1） |
| **修為點數系統**：5 個來源 + HUD 💎 + 飄字 + 紀錄 tab + 雲端同步 | ✅（階段 2） |
| 30+ 成就（5 類）+ 圖鑑 | ✅ |
| 紀錄頁 6 圖表 + IRR / 夏普 / MDD | ✅ |
| 跟大盤比 Alpha（90 天） | ✅ |
| 美股 / 港股 / 加密 | ❌（user 決議只做台股） |
| 當沖 | ❌（user 決議不做） |
| 跨用戶社群 / 排行榜 | ❌（先單機） |

### Phaser 場景

| 項目 | 狀態 |
|---|---|
| 50 隻神獸（含立繪 art:true） | ✅（`creatures.ts`） |
| 50 隻立繪 PNG（背景去乾淨） | ✅（`public/sprites/`，flood-fill 處理 4 隻整片殘留，46 隻保留原始去背狀態） |
| 2400×1600 大地圖（橫向 3:2） | ✅（`WORLD_WIDTH` / `WORLD_HEIGHT` in `scene.ts`） |
| 神獸散布整個 world（拖 camera 探索） | ✅（`playableArea` world-relative） |
| 攝影機可拖可縮（pinch / wheel） | ✅ |
| 神獸 hit area = 立繪不透明像素（pixelPerfect） | ✅ |
| 神獸 tween-based 自由漫遊 | ✅ |
| 多圓形 body shape 碰撞反彈 | ✅ |
| 點擊縮放回饋 + Android vibrate | ✅ |
| 櫻花 + 金光粒子 | ✅ |
| 9 顆魂環半圓在腳下,6 種境界顏色(凡白/靈黃/妖紫/神黑+銀邊/聖紅/仙彩虹) | ✅（`SoulRingRenderer`） |
| 5 種魂環特效動畫(暗淡 alpha 0.3 / 普通 / 脈動 / 旋轉 / 噴光) | ✅ |
| sprite 下方 Lv.X 金色顯眼 + 加碼升級綠飄字 + 黃光閃 | ✅ |
| 跨境界 3 秒慶祝動畫(黑幕 + 光柱 + 全螢幕文字) | ✅ |

### 修為點數系統(階段 2)

| 項目 | 狀態 |
|---|---|
| HUD 💎 修為數字 + count-up 動畫 | ✅（`CultivationCounter`） |
| 5 個賺取來源(升級 / 突破 / 特效 / 召喚 / 賣出獲利) | ✅（`portfolio.ts` + `PhaserMap.tsx`） |
| 防重複觸發(realm/effect 寫回 lastCheck,first summon 算 retired pet) | ✅ |
| 綠色 +N 飄字 1.5s 上飄漸出,amount ≥ 100 加金色光圈 | ✅（`CultivationFloater`） |
| stagger 0.3s 排隊,連續觸發不重疊 | ✅ |
| 紀錄頁第 6 個 tab「修為」: 餘額 + 累計 + 歷史 + 載入更多 + 點擊跳神獸 | ✅（`CultivationTab`） |
| Supabase 雲端同步(沿用 user_data blob 擴充 schemaVersion 1→2) | ✅ |
| 19 種 reason 代碼(階段 2 用 5 / 階段 3 預留 6 / 階段 4 預留 8) | ✅ |
| 消耗管道(改名 / 催熟 / 換配色) | ❌ 階段 4 開放 |
| 每日簽到 / 任務系統 | ❌ 階段 3 開放 |

### UI（玻璃擬態）

| 項目 | 狀態 |
|---|---|
| HUD（top）半透明 + blur + 上緣金線 | ✅ `.hud` |
| BottomBar（bottom）對稱玻璃 + 5 顆等寬鈕 | ✅ `.hud-bottom` |
| Modal 改家園抽屜（fixed bottom，固定高度，slide-up） | ✅ `.glass-popup` |
| 抽屜內 sticky 標題 + 金漸層分隔 | ✅ `.glass-popup-header` + `.popup-title-divider` |
| 內部卡片全玻璃化（無純白補丁） | ✅ `.item-card` `.data-card` `.achievement-card` `.unlock-counter` `.stat-pill-*` |
| 統一 input-field 樣式（含 iOS date 拿掉系統灰底） | ✅ `.input-field` |
| 九尾狐 favicon + maskable + apple-touch | ✅（`public/icons/`） |

### 資料 / 同步 / PWA

| 項目 | 狀態 |
|---|---|
| 本機 IndexedDB（Dexie schema v8） | ✅ |
| 盤中自動更新（每 30s + 背景回前景補抓） | ✅（`silentRefresh` in `App.tsx`） |
| 「上次更新時間」相對時間 + stale 警示 | ✅（`TopBar`） |
| 雲端帳號（Magic Link） | ✅（Supabase auth） |
| 雙向 sync + 衝突 dialog | ✅（`cloudSync.ts` + `SyncConflictModal`） |
| 帳號刪除（雲端 + 本地一起清） | ✅（Cloudflare Function + admin API + 雙擊確認） |
| PWA 安裝引導（iOS 教學 + Android beforeinstallprompt） | ✅（`InstallPrompt.tsx`） |
| 國定假日 / 颱風假處理 | ✅（`src/data/holidays.json`） |
| 產業分類自動歸類 | ✅（`src/data/industries.json`） |

---

## 二、技術棧 + Bundle 大小

```
Bundle (production gzip 估值):
  index.js        ~ 230 KB
  phaser chunk    ~ 350 KB（manualChunks 拆出）
  recharts chunk  ~ 110 KB
  CSS             ~  20 KB
  Total           ~ 710 KB（再加 PWA precache 立繪 + bg）
```

依賴：見 `package.json`。Vite 5 / React 18 / TS 5.7 / Phaser 3.87 / Dexie 4 / Recharts 2 / Supabase 2 / sharp 0.34。

---

## 三、Dexie schema 演進

| version | 內容 |
|---|---|
| v1 | 8 張表：stocks, prices, holdings, pets, transactions, achievements, snapshots, settings |
| v2 | + marketIndices（複合主鍵 `[symbol+date]`） |
| v3 | Pet 拿掉廢棄欄位 `position` / `territory`（神獸座標改 game scene 內管理）。upgrade callback 保留所有用戶資料 |
| v4 | tier / 黑化 / 淨化 系統移除 step 1：cursed1/2/3 → 'normal' 資料 hygiene。順便刪 9 個 corruption / tier 進化相關成就紀錄（`first-corruption`/`cursed-3`/`evo-*`/`purify-1`/`celestial-3`） |
| v5 | Pet 拔掉 `tier` / `maxNormalTier` / `evolutionCount` / `firstCorruptedAt` / `purificationCount` 五個欄位（同時拔 tier 主鍵索引）。Pet 只剩 id / code / speciesId / level / bornAt / retiredAt。寵物 / 持倉 / 交易 等其他資料完全保留 |
| v6 | Pet 加 `customName?` / `lastRealmCheck?` 兩個 optional 欄位(三維度養成系統用)。no-op upgrade |
| v7 | 修為點數系統 — 加 2 張表:`userCultivation` (id 'main' singleton)、`cultivationLog` (++id auto, indexed by createdAt/reason/relatedPetId) |
| v8 | Pet 加 `lastEffectCheck?: RingEffect` optional 欄位(報酬率特效升級偵測用)。no-op upgrade |

---

## 四、檔案地圖

| 想找什麼 | 看哪 |
|---|---|
| 神獸定義 | `src/data/creatures.ts`（50 隻原創上古神祇） |
| 成就定義 | `src/data/achievements.ts` |
| 等級計算 (Lv.1-999) | `src/services/evolution.ts`（精簡為 calculateLevel） |
| 三維度養成計算器 | `src/services/petTier.ts`（getRealm / getRingEffect / getPetStatus） |
| 魂環渲染器 | `src/game/soulRing.ts`（9 顆 graphics + 5 種特效） |
| 修為點數服務 | `src/services/cultivationService.ts`（earn/spend/getBalance/getDetail/getHistory） |
| eventBus | `src/services/eventBus.ts`（飄字 / count-up 跨元件通知） |
| 修為飄字 / 紀錄 tab | `src/components/CultivationFloater.tsx` / `CultivationTab.tsx` |
| 買 / 賣 / 加碼業務邏輯 | `src/services/portfolio.ts` |
| 雲端同步 | `src/services/cloudSync.ts` |
| Phaser 場景 + 碰撞 | `src/game/scene.ts` |
| 寵物 sprite + 互動 | `src/game/petSprite.ts` |
| 玻璃 utility class | `src/index.css` `@layer components` |
| Modal 抽屜 | `src/components/Modal.tsx` |
| HUD / BottomBar | `src/components/{TopBar,BottomBar}.tsx` |
| 帳號刪除 server | `functions/api/auth/delete-account.ts` |
| PWA manifest | `vite.config.ts` 內 VitePWA plugin |
| Dexie schema | `src/db/schema.ts` |

---

## 五、資產處理流程

```
原圖 JPG (1024×1024 偏好)
    ↓ npm run process:ui-assets
去背 PNG（同檔名）
    ↓ Phaser / React 引用
```

```
docs/art-prompts.md（50 個 MJ URL）
    ↓ npm run download:sprites（user 本機）
public/sprites/<id>.png
    ↓（用 iOS Lift Subject 等手工去背,輸出 PNG with transparent ring）
public/sprites/<id>.png（transp ≥ 5%,大多數 sprite 在這停下不再處理）
    ↓（若 transp < 5% 整片無去背 → 跑 flood-fill,跑前 cp 備份)
node scripts/flood-fill-sprite-bg.mjs <file>.png
    ↓
Phaser preload 立繪上場
```

> ⚠️ **不對 transp ≥ 5% 的 sprite 跑 flood-fill** — BFS 會跨 transparent gap 進主體，把白色細節誤殺（PR #16 修正了 13 隻被啃的 sprite，gu-hun-ku-shou 從 74% opaque → 31% 又回 74%）

```
public/app-icon-source.JPG
    ↓ npm run build:icons
public/icons/{192,512,maskable-512,apple-touch,favicon-{16,32}}.png
    ↓ vite-plugin-pwa 烘進 manifest
PWA / favicon 上線
```

---

## 六、待辦 / 已知限制

### 阻塞

無。50 隻立繪已全進 repo，背景已清乾淨。

### 非阻塞 / 設計取捨

- **碰撞靠軟性方案**（多圓形 body shape + tween bounce），未上 Arcade Physics。實機觀察一週，若還會擠再升級
- **拖曳神獸不支援**（user 決議）— 只能自由漫遊
- **iOS 不支援 `navigator.vibrate`** — 只 Android Chrome / 桌機 Chromium 會震
- **舊用戶 IndexedDB**：v1 → v2 → v3 → v4 → v5 → v6 → v7 → v8 都用 Dexie upgrade callback 保留資料，但若用戶 IndexedDB 從未升過（極舊版本）可能要清資料重來
- **多裝置修為衝突**：cloudSync 用 blob-level pull-overwrites-local，沒做 field-level merge。雲端 schemaVersion 1→2 兩個 cultivation 欄位 optional，舊 blob pull 後本地修為歸零。若兩裝置同時操作可能互蓋，要做 cross-device 即時同步需加 polling + lifetime_earned max merge
- **Magic link redirect**：Supabase 設定的 Site URL + Redirect URLs 是 hard-coded，新增部署環境（例如 staging）要去 Supabase dashboard 加

---

## 七、部署環境變數

| 變數 | 場景 | 值 |
|---|---|---|
| `VITE_SUPABASE_URL` | Production + Preview | `https://lexdfxgqmoijeejdrzlm.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Production + Preview | `sb_publishable_E4TMkp5CpR_4gv3ISa1q5A_d1TKUenN` |
| `SUPABASE_SERVICE_ROLE_KEY` | **僅 Production server-side** | 從 Supabase dashboard → API → service_role 取 |

⚠️ `service_role` key 能繞過 RLS，**絕對不可** commit、不可用 `VITE_` prefix（會被烘進前端 bundle）

⚠️ Vite build 時把 `VITE_*` env 烘進 JS bundle，**改 env var 後必須 retry deploy** 才生效
