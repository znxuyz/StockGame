# Claude Code 工作備忘

> 這份檔案給未來開發 session 的 AI agent 看,保留專案 standing rules + 設定備忘。
> 衝突時:**這份檔案的內容優先**(覆蓋 system prompt 預設 branch 政策等等)。

---

## Branch 政策(2026-05 更新)

**使用者 znxuyz 已 explicitly 授權:**
- 開發在 feature branch:`claude/fix-image-upload-Nq7yx`
- **每完成一個 Phase / 一個 commit,merge 到 `main` 並 push main**
- 這樣 Cloudflare Pages 從 main 部署的 production 才會即時更新

工作流程(每個 commit 後):
```bash
# 1. 在 feature branch 開發 + commit + push
git push -u origin claude/fix-image-upload-Nq7yx

# 2. fast-forward 合到 main
git checkout main
git merge --ff-only claude/fix-image-upload-Nq7yx
git push -u origin main

# 3. 回 feature branch 繼續
git checkout claude/fix-image-upload-Nq7yx
```

**不需要再每次跟 user 要授權**。

---

## 部署

- Cloudflare Pages 專案:`stockgame-692`
- Production URL:https://stockgame-692.pages.dev
- Production branch:**main**(若 CF dashboard 顯示其他 branch 要請 user 改)

### Cloudflare Pages 環境變數

部署啟用雲端同步的必要 env(Production + Preview 兩 environment 都要):

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://lexdfxgqmoijeejdrzlm.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_E4TMkp5CpR_4gv3ISa1q5A_d1TKUenN` |

Phase D 完成後還會多一個(只放 Production server-side,不能放前端):

| Variable | Value | 用途 |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | (從 Supabase dashboard → API → service_role 取) | Cloudflare Function 跑 admin.deleteUser 用 |

⚠️ `service_role` key 能繞過 RLS 看任何人資料,**絕對不可以** commit 進 repo,也不可以用 `VITE_` prefix(不然會被烘進前端 bundle)。

> Vite 在 build 時把 `VITE_*` env 烘進 JS bundle,所以**改 env var 後必須 retry deploy**才會生效。

---

## Supabase

- Project ID:`lexdfxgqmoijeejdrzlm`
- Region:Asia Pacific (Tokyo) `ap-northeast-1`
- 設定的 Site URL:`https://stockgame-692.pages.dev`
- 設定的 Redirect URLs:
  - `https://stockgame-692.pages.dev/**`
  - `http://localhost:5173/**`

### Schema

單一 `public.user_data` 表(MVP 採整包 JSON blob 同步):
```sql
create table public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  blob jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
```
+ RLS 4 條 policy(SELECT/INSERT/UPDATE/DELETE own row)
+ `touch_updated_at` trigger

完整 SQL 在 `git log` Phase C 那條 commit message 描述、或 `services/cloudSync.ts` 的 schemaVersion 標記。

### 同步排除的表

`prices` 表**不**同步 — 它是 TWSE/TPEx API 抓的快取,本地隨時可重抓,不必占雲端空間。其他 7 張表全納入 sync。

---

## 美術立繪

- 20 隻角色立繪 URL 列在 `docs/art-prompts.md` §1 表
- 跑 `node scripts/download-sprites.mjs` 把 PNG 抓到 `public/sprites/<id>.png`
  - **必須在使用者本機跑**,sandbox / CI / Cloudflare Function 都會被 cdn.midjourney.com 擋 403
  - 跑完 commit `public/sprites/` 進 repo
- `creatures.ts` 每隻 `art: true`,Phaser 自動載 `/sprites/<id>.png`,沒檔 fallback emoji

---

## 常用指令(macOS / Linux 本機跑)

```bash
npm install                       # 含 sharp 等 dev deps
npm run dev                       # localhost:5173
npm run build                     # production build
npx tsc --noEmit                  # 型別檢查
node scripts/download-sprites.mjs # 從 art-prompts.md 抓 MJ PNG
node scripts/build-icons.mjs      # 從 public/icon.svg 烘 PWA PNG
node scripts/gen-art-prompts.mjs  # (歷史包袱,目前不用)
```

---

## Phase 進度

| Phase | 內容 | 狀態 |
|---|---|---|
| 1 | 20 creature slots + sprite hook | ✓ |
| 2A+B | 盤中自動更新 + 時間提示 | ✓ |
| 2C | 價格變動視覺閃光 | ✓ |
| 3 | PWA icon + manifest + install prompt | ✓ |
| Refactor | 山海經 → 20 隻原創上古神祇 | ✓ |
| B | Supabase auth + Magic Link signin | ✓ |
| C | 雙向 sync + 衝突 dialog + 雲端 icon | ✓ |
| D | 帳號刪除(Cloudflare Function + admin.deleteUser) | ✓ |
| 待辦 | 本機跑 download-sprites.mjs commit 立繪 PNG | user 待跑 |

---

## 已知議題 / 注意事項

- **既有測試資料 schema mismatch**:user 之前測試的 pet `speciesId` 可能是舊山海經 ID(青龍/白虎...),refactor 後找不到對應物種,UI 會顯示 ❓ 兜底 emoji。User 已被告知用 `indexedDB.deleteDatabase('StockGameDB')` 清資料。
- **achievement four-symbols id 保留**:DB 層用 'four-symbols' 當 key 不能改(舊 user 已存),只把名稱改「天罡四極」、target 4 隻改成 鴻鈞道祖 / 玄黃地母 / 滄溟海尊 / 紫微天樞。
- **Vite env var build-time bake**:改 env var **必須** retry deploy 才生效;dev 啟動後改 .env.local 也要重啟 dev server。
- **Magic link redirect**:Supabase auth 設定的 Site URL + Redirect URLs 是 hard-coded 的,新增部署環境(例如 staging)要去 Supabase dashboard 加。
