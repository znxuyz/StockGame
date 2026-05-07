# 神獸股市 — 自架部署教學

從 fork repo 到 production 上線的完整步驟。**全程免費**(都在 Supabase + Cloudflare Pages 自由額度內)。

---

## 0. 前置需求

- **GitHub 帳號**(放 repo + Cloudflare Pages 綁 GitHub 自動部署)
- **Supabase 帳號**(免費註冊,GitHub 登入即可):https://supabase.com
- **Cloudflare 帳號**(免費註冊):https://dash.cloudflare.com
- **本機**(可選,只在你想跑 `npm run dev` 才需要):Node.js ≥ 18

> 全程約 **30 分鐘**,大部分時間是等 Supabase / Cloudflare build。

---

## 1. Fork & Clone

1. 到 GitHub 原 repo 頁面 → 右上角 **Fork** → 拉到自己帳號
2. 本機 clone(可選):
   ```bash
   git clone https://github.com/YOUR_USERNAME/stockgame.git
   cd stockgame
   npm install
   ```

---

## 2. Supabase 設定

### 2.1 建專案

1. https://supabase.com/dashboard → **New project**
2. Name:隨意(例如 `stockgame`)
3. Database password:**自己記著**(等下用不到,但忘記日後沒法 reset 直接連 DB)
4. Region:選**離你最近**的 region。台灣建議 `Asia Pacific (Tokyo) ap-northeast-1`
5. 等 1–2 分鐘建好

### 2.2 建表 + RLS policy

進專案 → 左側 **SQL Editor** → New query → 貼下面整段 → 按 **Run**:

```sql
-- 雲端同步用單一 user_data 表(每 user 一個 row,所有資料當 JSON blob)
create table if not exists public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  blob jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 開 RLS
alter table public.user_data enable row level security;

-- 4 條 policy:每個 user 只能讀寫自己的 row
drop policy if exists "user reads own row" on public.user_data;
create policy "user reads own row"
  on public.user_data for select
  using (auth.uid() = user_id);

drop policy if exists "user inserts own row" on public.user_data;
create policy "user inserts own row"
  on public.user_data for insert
  with check (auth.uid() = user_id);

drop policy if exists "user updates own row" on public.user_data;
create policy "user updates own row"
  on public.user_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user deletes own row" on public.user_data;
create policy "user deletes own row"
  on public.user_data for delete
  using (auth.uid() = user_id);

-- updated_at 自動更新 trigger
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists user_data_touch_updated_at on public.user_data;
create trigger user_data_touch_updated_at
  before update on public.user_data
  for each row execute function public.touch_updated_at();
```

跑成功會顯示「Success. No rows returned」。

### 2.3 拿兩把 API key

左側 **Project Settings → API**,記下兩個值(等下要貼進 Cloudflare):

| 名稱 | 用在哪 | 範例值 |
|---|---|---|
| **Project URL** | 前端 + Function 都用 | `https://abcdefgh.supabase.co` |
| **anon / public** key | 前端用(可公開,RLS 把關) | `sb_publishable_...` 或 `eyJ...` |
| **service_role** key | **僅 server**,Phase D 帳號刪除用 | `sb_secret_...` 或 `eyJ...` |

⚠️ **service_role key 絕對不可以放前端 / commit 進 repo / 帶 `VITE_` 前綴**。它有 admin 權限能繞過 RLS 看任何人資料。

### 2.4 設 Auth Redirect URL(magic link 點完跳回 app 用)

左側 **Authentication → URL Configuration**:

- **Site URL**:`https://YOUR_APP.pages.dev`(你 Cloudflare Pages 部署後的網址,先填占位也可,部署後再回來改)
- **Redirect URLs**(每行一個):
  ```
  https://YOUR_APP.pages.dev/**
  http://localhost:5173/**
  ```

按 **Save**。

---

## 3. Cloudflare Pages 部署

### 3.1 建專案

1. https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. 選你 fork 的 repo → **Begin setup**
3. **Build settings**:
   - Framework preset:**Vite**(沒這選項就選 None,然後填下面)
   - Build command:`npm run build`
   - Build output directory:`dist`
   - Production branch:`main`
4. 先 **Save and Deploy**,讓它跑一次 build(會缺 env var 但 build 應該過,只是雲端同步功能藏起來)

### 3.2 設環境變數

進 project → **Settings → Variables and Secrets**(或 Environment variables)。

加 4 個變數(2 個 × 2 個 environment):

| Variable name | Value | Environment |
|---|---|---|
| `VITE_SUPABASE_URL` | 你的 Project URL | Production |
| `VITE_SUPABASE_ANON_KEY` | 你的 anon key | Production |
| `VITE_SUPABASE_URL` | 同上 | Preview |
| `VITE_SUPABASE_ANON_KEY` | 同上 | Preview |

**外加一個 server-only 用於 Phase D 帳號刪除**:

| Variable name | Value | Environment | Type |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | 你的 service_role key | **Production only** | **Secret**(若可選) |

⚠️ Vite 在 build time 把 `VITE_*` 烘進 JS bundle,所以**改 env var 後必須觸發新 build** 才會生效:Deployments → 最上面那筆 → ⋯ → **Retry deployment**。

### 3.3 拿你的網址 + 回 Supabase 補 Redirect URL

Cloudflare 部署完會給你一個網址,類似 `your-app.pages.dev`(你 project 名 + .pages.dev)。

**回 Supabase Authentication → URL Configuration**,把 `YOUR_APP.pages.dev` 占位換成實際網址,Save。

(沒這步驟 magic link 點完不會跳回你的 app)

---

## 4. 驗證

打開你的 `https://YOUR_APP.pages.dev`:

- [ ] 看到首頁、地圖、買入神獸 / 餵食加碼 / 售出神獸 / 紀錄 4 個底部按鈕
- [ ] 點「設定」應該看到「☁ 雲端同步」section + 「登入以同步資料」橘色按鈕
- [ ] 點登入 → 輸入信箱 → 寄出 → 收信(若沒收到看垃圾信件夾)→ 點連結 → 跳回 app 自動登入
- [ ] 右上 TopBar 出現 ☁ ✓ icon
- [ ] 隨便買一檔股票 → 1 秒後 ☁ icon 短暫變 ⟳ 又變回 ✓
- [ ] Supabase Dashboard → Database → Tables → `user_data` → 看到一筆 row

**走完 = 部署成功 ✓**

---

## 5. 寵物立繪(可選)

預設用 emoji 兜底(🐉🐯🦊⚡ 之類),app 可玩但不夠精緻。要自己上立繪:

### 選項 A:用我提供的 Midjourney 圖

1. 確認你個人電腦/手機**能連 cdn.midjourney.com**(sandbox / VPS / CI 通常會被擋 403)
2. 跑:
   ```bash
   npm install
   node scripts/download-sprites.mjs
   ```
3. 確認 `public/sprites/` 出現 20 個 PNG
4. `git add public/sprites/` → commit → push → Cloudflare 自動 deploy

### 選項 B:用自己畫的

1. 準備 20 張正方形 PNG(建議 256×256 或更大,Phaser 自動縮),檔名對應 `src/data/creatures.ts` 的 `id`(例如 `tai-chu-yan-jun.png`)
2. 直接放進 `public/sprites/`
3. commit + push

### 選項 C:不要立繪,只用 emoji

1. 改 `src/data/creatures.ts`,把每隻的 `art: true` 改成 `art: false`(或刪掉這行)
2. Phaser 不會嘗試載 PNG,直接顯示 emoji

---

## 6. 客製化

### 改 app 名稱 / 主題色

- `index.html`:`<title>` 跟 `<meta name="apple-mobile-web-app-title">` 改
- `vite.config.ts`:`manifest.name` / `short_name` / `theme_color` / `background_color` 改
- `public/icon.svg`:換成你自己的 icon SVG;然後跑 `node scripts/build-icons.mjs` 重新烘 192/512/180 PNG

### 改 20 隻神獸名單

- `src/data/creatures.ts`:整個陣列重寫,每隻要有 `id` / `name` / `category` / `description` / `emoji` / 可選 `art`
- 不影響資料庫 schema,但**舊用戶寵物 speciesId 會變孤兒**(顯示 ❓)。建議只在「全新 launch」階段改

### 改券商手續費預設

- `src/services/portfolio.ts` 找 `brokerageFeeDiscount` 跟 `brokerageMinFee` 預設值
- 或進設定頁改(每個用戶各自設定,存在自己的 settings)

---

## 7. NPM Scripts 參考

```bash
npm run dev                       # 本機 http://localhost:5173
npm run build                     # production build → dist/
npm run preview                   # 預覽 build 結果
npx tsc --noEmit                  # 型別檢查
node scripts/download-sprites.mjs # 從 docs/art-prompts.md 抓 MJ PNG
node scripts/build-icons.mjs      # 從 public/icon.svg 烘 PWA icon PNG
```

---

## 8. 架構速覽

```
src/
  api/         # TWSE / TPEx 報價 + 重試 / 錯誤處理
  components/  # React UI 元件(modals、charts、TopBar、BottomBar 等)
  data/        # 靜態資料(creatures.ts、achievements.ts、stocks.ts)
  db/          # Dexie schema + seed
  game/        # Phaser scene、PetSprite
  lib/         # supabase client、auth hook
  services/    # 業務邏輯(portfolio、evolution、achievements、cloudSync 等)
  types/       # TypeScript 型別定義
  utils/       # 純函式 helper(format、finance、fees)

functions/api/  # Cloudflare Pages Functions(server-side)
  auth/delete-account.ts  # 帳號刪除(用 service_role 跑 admin.deleteUser)
  mis/[[path]].ts         # 證交所 mis API CORS proxy

public/
  icon.svg / icons/  # PWA icon
  sprites/           # 寵物立繪(可選,缺檔 fallback emoji)

docs/
  art-prompts.md   # 立繪 URL 對照表 + 下載流程

scripts/
  download-sprites.mjs  # 從 docs/art-prompts.md 抓 PNG 進 public/sprites/
  build-icons.mjs       # 從 icon.svg 烘各尺寸 PNG
  gen-art-prompts.mjs   # (歷史包袱)Midjourney prompt 產生器
```

---

## 9. Troubleshooting

### Magic link 點完跳到 Supabase 預設頁,沒回我的 app

- Supabase Authentication → URL Configuration 沒設 / Site URL 寫錯
- 確認 Site URL = `https://YOUR_APP.pages.dev`、Redirect URLs 含 `https://YOUR_APP.pages.dev/**`

### 設定頁看不到「☁ 雲端同步」section

- Cloudflare 環境變數沒設(`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`)
- 設了但**沒 retry deployment** — Vite 只在 build time 烘進 bundle
- DevTools console 看 `[supabase] 未設定...` 警告就確認此原因

### 雲端登入了但同步沒動 / TopBar 沒 ☁ icon

- 看 console 有沒有 RLS / 連線錯誤
- 確認 SQL 跑完整段(`user_data` 表 + 4 條 policy + trigger)
- Supabase Dashboard → Database → Tables → user_data → Policies 應該有 4 條

### `download-sprites.mjs` 跑了所有 URL 都 403

- cdn.midjourney.com 對 datacenter / VPN / 部分 ISP IP block,**只能在你個人電腦本機跑**
- 換手機網路 hotspot 也會通(行動 IP 通常被允許)
- 不能在 sandbox / GitHub Actions / Cloudflare Workers 等 server 環境跑

### 帳號刪除 API 回 500 Server not configured

- Cloudflare 環境變數沒加 `SUPABASE_SERVICE_ROLE_KEY`(或加錯了名字、加錯了 environment)
- 加了沒 retry deployment

### 買股票後 toast 顯示「⚠️ 證交所連線失敗」

- mis 即時報價 API 偶爾不穩,通常重試一次就好
- 假日 / 凌晨會回最後交易日資料(正常,UI 會標「盤外」)

---

## 10. License

MIT(看 LICENSE 檔)。fork 後想拿去做別的用途也歡迎。
