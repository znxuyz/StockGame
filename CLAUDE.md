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
```

---

## 美術立繪流程

- 20 隻角色立繪 URL 列在 `docs/art-prompts.md` §1 表
- `npm run download:sprites` 把 PNG 抓到 `public/sprites/<id>.png`
  - **必須在使用者本機跑**，sandbox / CI / Cloudflare Function 都會被 cdn.midjourney.com 擋 403
  - 跑完 commit `public/sprites/` 進 repo
- `creatures.ts` 每隻 `art: true`，Phaser 自動載 `/sprites/<id>.png`，沒檔 fallback emoji

---

## Dexie schema 演進

| v | 內容 | upgrade 處理 |
|---|---|---|
| 1 | 初始 8 張表 | — |
| 2 | + marketIndices | 加新表 |
| 3 | Pet 拿掉 `position` / `territory`（神獸座標改 game scene 內管理） | upgrade callback 走訪 pets 刪兩欄位，**保留所有用戶資料** |

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

## Phaser 場景約定

- `WORLD_SIZE = 1400`（世界 1400×1400，camera 可拖可縮）
- `playableArea` = viewport - HUD 90 - BottomBar 110 - 上下 30 padding - 左右 40 padding
- 神獸 hit area = `image.setInteractive(scene.input.makePixelPerfect(1))`（pixel-perfect，點哪到哪）
- 神獸 wandering = `scene.tweens` 拉到 `playableArea` 內隨機目標，停 1-5 秒再下一輪
- 神獸碰撞 = 多圓形 body shape（3 圓覆蓋立繪輪廓）→ 圓-圓相交 → 雙方 `bounceTo` 反方向 60px tween 200ms + 300ms 恢復期
- depth = `container.y`（下方蓋上方，跟視覺一致）

---

## 已知雷 / 過往踩過的坑

- **既有測試資料 schema mismatch**：早期山海經 ID（青龍/白虎...）的 pet record，refactor 後找不到對應物種 → UI 顯示 ❓ emoji。User 已知用 `indexedDB.deleteDatabase('StockGameDB')` 清資料
- **achievement `four-symbols` id 保留**：DB 層用 'four-symbols' 當 key 不能改（舊 user 已存），只把名稱改「天罡四極」、target 4 隻改成 鴻鈞道祖 / 玄黃地母 / 滄溟海尊 / 紫微天樞
- **Vite env var build-time bake**：改 env var **必須** retry deploy 才生效；dev 啟動後改 `.env.local` 也要重啟 dev server
- **Magic link redirect**：Supabase 設定的 Site URL + Redirect URLs 是 hard-coded，新增部署環境（例如 staging）要去 Supabase dashboard 加
- **iOS Safari `navigator.vibrate`**：iOS 不支援，**寫了不會錯但只 Android Chrome / 桌機 Chromium 會震**
- **Phaser Container + pixelPerfect**：`makePixelPerfect` 必須掛在有 texture 的 GameObject（Image / Sprite）。Container 沒 texture，要把 hit 對象從 container 改到內部 image / emoji
- **Phaser tween 跟手動位移衝突**：tween 進行中時手動 `container.x = ...` 會被下一 tick 覆蓋。要修改位置必須先 `scene.tweens.killTweensOf(container)` 再設
- **iOS PWA 全螢幕安全區**：`env(safe-area-inset-top/bottom)` 在桌機 = 0，iOS PWA = 44 / 34。HUD / BottomBar 都要把 padding 加 safe-area 才不會被瀏海 / home indicator 蓋

---

## 已棄用 / 不要再做的事

- ❌ `frame_card.png` 9-slice 邊框（已換玻璃擬態，CSS class `.ornate-frame` 也已移除）
- ❌ `top_banner.png`（已改 fixed `.hud`）
- ❌ `icon.svg`（已改 9 尾狐 PNG）
- ❌ `Pet.position` / `Pet.territory` 欄位（v3 schema 已刪）
- ❌ `Modal variant="sheet" | "center"` prop（全砍，現在都是抽屜式）
- ❌ Phaser `pickNewTarget` / `home` / `territory` 概念（改 tween-based 全地圖漫遊）
- ❌ `setInteractive(new Phaser.Geom.Rectangle/Circle, ...)` 在神獸上（一律 pixelPerfect）
- ❌ Arcade Physics（暫不上，user 要看軟性 body shape 反彈一週是否夠）

---

## 文件分工

- `README.md` → 給人看：玩法 / 特色 / 怎麼開發
- `PROJECT_STATUS.md` → 給人看：實際做了什麼 / 沒做什麼 / 限制
- `CLAUDE.md`（這份）→ 給 AI agent 看：branch 政策 / 雷區 / 慣例
- `SETUP.md` → 給 fork 部署的人看：Supabase + Cloudflare 從零開始
