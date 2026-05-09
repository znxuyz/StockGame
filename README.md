<div align="center">

<img src="public/icons/icon-192.png" alt="神獸股市" width="120" />

# 神獸股市 · StockGame

**台股投資組合 → 上古神祇動物園 PWA**

[![Live](https://img.shields.io/badge/Live-stockgame--692.pages.dev-pink?style=for-the-badge)](https://stockgame-692.pages.dev)
[![Stack](https://img.shields.io/badge/Vite_+_React_18_+_TypeScript-grey?style=for-the-badge)](#技術棧)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

買股票召喚神獸 · 賺錢進化 · 虧損黑化 · 賣出進圖鑑
台股盤中即時更新 · 雲端帳號跨裝置同步 · 毛玻璃 HUD UI

[**線上玩**](https://stockgame-692.pages.dev) · [**自架部署**](SETUP.md) · [**目前進度**](PROJECT_STATUS.md) · [**AI 開發備忘**](CLAUDE.md)

</div>

---

## 特色

- 🐾 **50 隻原創上古神祇** — 鴻鈞道祖、玄黃地母、滄溟海尊、紫微天樞⋯ 搭配 AI 立繪，無立繪自動 fallback emoji
- 🗺️ **2400×1600 大地圖** — 神獸散布整個世界，玩家拖曳 camera 探索（公主連結家園感）
- 📈 **真實台股報價** — 上市 / 上櫃 / ETF。盤中 9:05–13:30 每 30 秒自動更新，盤後用最新收盤
- ✨ **境界進化系統** — 凡 → 靈 → 妖 → 神 → 聖 → 仙 六階；長期虧損黑化成凶獸（一/二/三階），淨化可變回
- 🏆 **成就 + 圖鑑** — 50+ 成就（7 類）、50 隻神祇圖鑑、交易明細、跟大盤比 Alpha
- ☁ **雲端帳號** — Supabase Magic Link 登入，換手機無痛接續，可整帳號刪除
- 📱 **PWA** — 加到桌面變 App，離線可用（不上 App Store）
- 🪞 **毛玻璃 UI** — HUD / BottomBar / 抽屜彈窗統一玻璃擬態語言，半透明 + backdrop-blur

## 寵物系統

| 機制 | 規則 |
|---|---|
| **境界** | 凡 → 靈 → 妖 → 神 → 聖 → 仙（六階正向） |
| **修為** | 每境界 Lv.1–99，依累積投入金額計算 |
| **黑化** | 長期虧損變凶獸（一階 → 二階 → 三階） |
| **淨化** | 凶獸回正報酬可變回原境界 |
| **退役** | 全數賣出進歷史圖鑑 |
| **互動** | 點任一神獸開個股資訊（hit area = 立繪不透明像素，點哪到哪） |
| **活動範圍** | 散布整個 2400×1600 world，不再黏 viewport 中央。玩家拖 camera + zoom 才能看到所有神獸 |
| **動作** | tween-based 自由漫遊，目標選 world-relative 矩形 (40,120) → (2360,1460) 內 |
| **碰撞** | 多圓形 body shape 反彈（3 圓覆蓋立繪輪廓，碰到才彈，不是中心距離） |

## UI 設計

整個 app 統一玻璃擬態語言（Glass morphism），靈感是 iOS 控制中心 + 手遊家園抽屜：

```
┌── HUD（fixed top, glass）─────────────────────┐
│ 🐾 神獸 N · 投入 NN · 總市值 NN · 報酬 NN    │
│ ─────────────────────                          │
│ 盤中 · 更新 2h前 · 今 ±NN · 🏆 12/50 · 🔥 1d │
└────────────────────────────────────────────────┘

         ┌────  Phaser 場景  ────┐
         │  20 隻神獸自由漫步    │
         │  櫻花飄落 + 金光粒子  │
         │  攝影機可拖可縮       │
         └────────────────────────┘

╔══ Bottom Sheet Drawer（fixed bottom, glass）═══╗
║ 紀錄                                  × 鈕    ║
║ ─────────金漸層分隔─────────                  ║
║ tabs(玻璃 sticky) │ 圖表 對比 成就 圖鑑 交易  ║
║ ─────────────────────────────────────         ║
║ [data-card 半透明] [achievement-card]         ║
╚════════════════════════════════════════════════╝

┌── BottomBar（fixed bottom, glass）─────────────┐
│ 🥚買入  🍖餵食  📦售出  📜紀錄  💎設定         │
└────────────────────────────────────────────────┘
```

| Glass class | alpha | blur | 邊 |
|---|---|---|---|
| `.hud` | 0.35 | 20 / saturate 140% | bottom 1px 金線 |
| `.hud-bottom` | 0.35 | 20 / saturate 140% | top 1px 金線 |
| `.glass-popup` | 0.75 | 24 / saturate 150% | 1px 金線 + radius 24/24/0/0 |
| `.modal-backdrop` | 黑 0.25 | 8 | — |
| `.glass-popup-header` | 0.5 | 8 | sticky 底 1px 金線 |
| `.item-card` | 白 0.4 | 8 | 1px 白半透明 |
| `.data-card` | 白 0.35 | 8 | 1px 金細線 |
| `.achievement-card[.unlocked]` | 0.35 / 金 0.5 | 6 | — |
| `.stat-pill-{rose,blue,amber}` | 各色 0.15 | 6 | 各色 0.3 |

## 技術棧

| 層 | 工具 |
|---|---|
| 框架 | Vite 5 + React 18 + TypeScript |
| 遊戲引擎 | Phaser 3（pixelPerfect hit + tween wander + multi-circle collision） |
| UI | Tailwind CSS + 自訂玻璃 utility |
| 圖表 | Recharts |
| 本地資料庫 | Dexie（IndexedDB），目前 schema v3 |
| 雲端帳號 / 同步 | Supabase（Auth + Postgres + RLS） |
| 部署 | Cloudflare Pages + Pages Functions |
| PWA | vite-plugin-pwa |
| 圖示處理 | sharp（npm scripts） |

## 資料來源（公開、無金鑰）

| 資料 | 來源 | 更新頻率 |
|---|---|---|
| 台股即時報價 | 證交所 `mis.twse.com.tw` | 盤中每 30 秒 |
| 個股基本資料 | 證交所 OpenAPI 上市清單 / TPEX 上櫃清單 | 月更（GitHub Actions） |
| 產業分類 | 同上 → `src/data/industries.json` | 月更 |
| 加權指數歷史 | 證交所 OpenAPI | on-demand |
| 國定假日 | TaiwanCalendar (jsdelivr) → `src/data/holidays.json` | 月更 |

> 沒上券商 API（不下單）。預設台新證券手續費（無折扣、最低 NT$20），可在設定改。

## 本機開發

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production build
npm run preview      # 預覽 build
npm run typecheck    # 型別檢查
```

### 資產處理 scripts

```bash
npm run build:icons         # public/app-icon-source.JPG → public/icons/*.png（PWA / favicon）
npm run process:ui-assets   # public/assets/btn/*.JPG → 去背 PNG（5 顆底部按鈕）
npm run download:sprites    # docs/art-prompts.md → public/sprites/*.png（50 隻立繪 / MJ）
npm run fetch:industries    # 月跑：證交所 OpenAPI → src/data/industries.json
npm run fetch:holidays      # 月跑：TaiwanCalendar → src/data/holidays.json

# 立繪去背修補（沒 npm wrapper，直接跑）
node scripts/flood-fill-sprite-bg.mjs --auto      # BFS flood-fill 修 4 角殘留 / halo
node scripts/flood-fill-sprite-bg.mjs file1.png   # 指定單檔
```

> `download:sprites` **必須本機跑**，sandbox / CI 會被 MJ CDN 擋 403。

雲端同步要先建 `.env.local`（複製 `.env.example` 填 Supabase 值），沒設也能跑離線。詳見 [SETUP.md](SETUP.md)。

## 部署

- **Production**：Cloudflare Pages 綁 `main` branch，push 即自動部署
- **Preview**：每個 feature branch 獨立 preview URL
- **PWA**：`vite-plugin-pwa` 自動產 `manifest.webmanifest` + service worker
- **Function**：`functions/api/auth/delete-account.ts` 跑 Supabase admin API 整帳號刪除

完整步驟（從 Supabase 開帳號到 Cloudflare 上線約 30 分鐘，**全程免費**）→ [SETUP.md](SETUP.md)

## 開發流程

```bash
# 1. feature branch 開發
git checkout -b feature/xxx
# ... edit ...
git commit && git push

# 2. fast-forward 合 main
git checkout main && git merge --ff-only feature/xxx && git push

# 3. Cloudflare Pages 自動部署 main 到 production
```

## 專案結構

```
StockGame/
├── public/
│   ├── app-icon-source.JPG       ← favicon 原圖（九尾狐）
│   ├── icons/                    ← PWA icons（npm run build:icons 產出）
│   ├── assets/btn/*.JPG / *.png  ← 5 顆底部按鈕原圖 + 去背 PNG
│   ├── assets/bg/main.JPG        ← Phaser 場景背景（粉紅雲紋庭院 1344×896）
│   ├── assets/particles/         ← 櫻花 / 金光粒子
│   └── sprites/<id>.png          ← 50 隻神祇立繪
├── src/
│   ├── components/               ← React UI
│   │   ├── Modal.tsx             ← 抽屜 Modal（.glass-popup）
│   │   ├── TopBar.tsx            ← HUD（.hud）
│   │   ├── BottomBar.tsx         ← 5 顆功能鈕（.hud-bottom）
│   │   ├── BuyModal/Sell/Feed/Settings/Records/PetInfo
│   │   └── charts/               ← Recharts 圖表
│   ├── game/                     ← Phaser 場景
│   │   ├── scene.ts              ← WorldScene + playableArea + 碰撞
│   │   └── petSprite.ts          ← PetSprite（pixelPerfect + tween wander + body collision）
│   ├── data/
│   │   ├── creatures.ts          ← 50 神祇定義
│   │   ├── achievements.ts       ← 50+ 成就
│   │   ├── industries.json       ← npm run fetch:industries 產出
│   │   └── holidays.json         ← npm run fetch:holidays 產出
│   ├── services/                 ← 業務邏輯（buy / sell / cloudSync 等）
│   ├── api/                      ← TWSE / TPEX API 包裝
│   ├── db/schema.ts              ← Dexie schema（目前 v3）
│   ├── lib/                      ← supabase / auth
│   └── index.css                 ← Tailwind + 玻璃 utility class
├── scripts/                      ← 資產處理 / 資料抓取
├── functions/api/auth/           ← Cloudflare Pages Functions
└── docs/                         ← 立繪 prompts、設計筆記
```

## License

[MIT](LICENSE)
