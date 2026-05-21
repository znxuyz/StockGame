# STATUS · 神獸股市 全 repo 健檢報告

> 自動產出 — 依「全面盤點」spec 跑出來的客觀盤點。每個發現都附檔案 / 行號,作為後續整理的 working list。
> 本報告**僅紀錄,不修改任何程式碼**。要不要動、怎麼動,由人決定。

---

## A. 現況總覽

### A.1 規模

| 項目 | 數量 |
|---|---|
| TypeScript / TSX 檔(`src/`) | 167 |
| React 元件(`src/components/`) | 68(含 charts/8、feed/5、share/5) |
| Service 模組(`src/services/`) | 44 |
| Repository(`src/repositories/`) | 10 |
| Cloudflare Function(`functions/api/`) | 4 |
| Build script(`scripts/`) | 9 |
| Supabase migration | 8 |
| Dexie schema version | v1 → v15 |
| Creature 神獸 | **294 隻**(50 原 + 244 第二批) |
| Sprite PNG | **294/294** |
| 修仙傳說(`creatureStories.ts`) | **294/294** |
| 已部署 npm dependency | 10 production + 11 dev = 21 套件 |

### A.2 檔案結構

```
StockGame/
├── README.md / SETUP.md / PROJECT_STATUS.md / CLAUDE.md
├── src/
│   ├── App.tsx                   主入口 + AuthGate + post-login init
│   ├── api/                      (8) TWSE mis / 歷史 K / Yahoo / 共用 retry+errors
│   ├── components/               (68) 全部 UI 元件 — **0 個 unused**
│   │   ├── charts/               (8) recharts 圖表
│   │   ├── feed/                 (5) 動態牆(階段 5D)
│   │   └── share/                (5) 分享卡片(階段 5C)
│   ├── data/                     (6) creatures / creatureStories / industries / holidays / achievements / stockPresets
│   ├── db/                       (3) Dexie schema + seed + index
│   ├── game/                     (4) Phaser scene / petSprite / soulRing / PhaserMap
│   ├── hooks/                    (2) useCultivation / useMyProfile
│   ├── lib/                      (4) supabase / auth / useOnline / pendingSync
│   ├── repositories/             (10) cloud-first repo + syncAll
│   ├── services/                 (44) 業務邏輯 / 雲端服務 / 階段 5 社交
│   ├── types/                    (21) TS 介面定義
│   └── utils/                    (8) format / fees / finance / uuid 等小工具
├── functions/api/                (4) Cloudflare Pages edge functions
│   ├── twse/      → openapi.twse.com.tw proxy
│   ├── yahoo/     → query1.finance.yahoo.com proxy
│   ├── mis/       → mis.twse.com.tw proxy
│   └── auth/delete-account
├── scripts/                      (9) sprite 處理 / 抓資料 / 圖示處理
├── supabase/migrations/          (8) SQL schema
├── public/sprites/               (294) 神獸立繪 PNG
└── docs/                         art-prompts.md(MJ URL 對照表)+ 仙獸 50 隻設定表.xlsx
```

### A.3 技術棧驗證

`package.json` 列的 21 套件:**18 個有實際 import,3 個有疑點**(見 B.4)。

| 類別 | 套件 |
|---|---|
| Runtime | `@supabase/supabase-js` / `dexie` / `dexie-react-hooks` / `react` / `react-dom` / `recharts` / `phaser` / `exceljs` / `html-to-image` |
| Build / DX | `vite` / `@vitejs/plugin-react` / `typescript` / `vite-plugin-pwa` / `tailwindcss` / `postcss` / `autoprefixer` |
| Script-only(devDeps 合理) | `sharp` / `@types/*` |
| **可疑** | `zustand`(在 dependencies 但完全沒 import) |

---

## B. 可清除項目清單

### B.1 Dead code / 沒被 import 的東西

**結論:程式碼層幾乎沒 dead code**。68 個元件、44 個 service、10 個 repo、4 個 lib 全部都有 caller。少數可疑:

| 項目 | 檔案 | 狀態 | 建議 |
|---|---|---|---|
| `zustand` 套件 | `package.json:dependencies` | **沒在 src/ 或 functions/ 任何地方被 import** | **可移除**:`npm uninstall zustand`(估計減 ~30KB 安裝、~10KB bundle) |
| `src/utils/amountMasker.ts` | 整檔 | **沒被任何 .ts/.tsx import** | 內含 `formatMaskedAmount` 等私密遮罩函式,可能是預留給排行榜遮罩用但沒上線。**確認後可刪** |
| `src/utils/quietHours.ts` | 整檔 | **沒被任何 .ts/.tsx import**(只剩 `types/notification.ts` / `types/privacy.ts` 有靜態 default value 用到欄位名,**沒 import 此工具檔的函式**)| 推測為通知推播免打擾時段運算,UI 沒接上 → 確認後可刪,或補上 UI 路徑 |

### B.2 debug 殘留

`console.log` 共 **16 處**,皆有 `[context]` prefix(diagnostic logging),不算純 debug。最浮動的:

| 檔案 | 行 | 內容 | 建議 |
|---|---|---|---|
| `src/services/login.ts` | 85 | `console.log('[login] migrated legacy streak from Settings:', ...)` | 一次性 migration,跑完不再觸發,可保留或拔 |
| `src/services/historyBootstrapService.ts` | 115, 139 | `[historyBootstrap] inspect` / `done` | 每次 App boot 都印,**可降級為 `console.info` 或拔** |
| `src/App.tsx` | 138 | `if (!r.skipped) console.log('[snapshotBackfill]', r);` | boot 時診斷用,**可拔或降 info** |
| `src/components/PwaUpdatePrompt.tsx` | 35 | `console.log('[PWA] 已可離線使用')` | **可降 info** |
| `src/repositories/syncAll.ts` | 93, 508, 574, 629, 1252, 1350, 1447, 1463, 1492 | 全是 forceSync / forceFetch 詳細報告 | **保留** — 是診斷工具的核心輸出 |
| `src/lib/pendingSync.ts` | 76, 81 | 離線 drain 進度 | **保留** — 連線恢復時的 trace |

**`debugger` 陳述:0**
**`console.debug`:0**
**註解掉的舊程式碼:0**(所有多行註解都是設計文檔 / 階段歷史)

### B.3 過時 / deprecated 還沒清的

| 項目 | 檔案:行 | 標記 |
|---|---|---|
| `Settings.playerName` | `src/types/settings.ts:24` | `@deprecated 階段 5A.2 起改用雲端 user_profile.nickname` |
| `Settings.lastLoginDate` | `src/types/settings.ts:30` | `@deprecated 階段 3D 批 1 起改用 LoginStreak.lastLoginDate;階段 3D 批 2 後從型別刪除` |
| `Settings.consecutiveDays` | `src/types/settings.ts:36` | `@deprecated 階段 3D 批 1 起改用 LoginStreak.currentStreak` |
| `Settings.maxConsecutiveDays` | `src/types/settings.ts:42` | `@deprecated 階段 3D 批 1 起改用 LoginStreak.longestStreak` |
| `migrateLegacyFromSettings` | `src/services/login.ts:63-65` | `@deprecated 階段 3D 批 2 之後從 Dexie 型別刪除` |
| Atomic RPC 評估註解 | `src/repositories/cultivationRepo.ts:35` | 「後續(階段 5 / 階段 4 之後)再評估 RPC 補強」 — 仍是 TODO |

「階段 3D 批 2」這條 migration 路徑已經跑完(雲端 schema 也都建好了),這四個 deprecated 欄位 + helper 可以**進行下一輪刪欄位的 Dexie schema upgrade** v16 拔掉。

### B.4 環境變數 / 文件不對齊

| 問題 | 檔案 | 細節 |
|---|---|---|
| `VITE_VAPID_PUBLIC_KEY` 在程式碼用但**不在 .env.example** | `src/services/pushService.ts:13` | Web Push 推播(階段 5F)需要的 VAPID 公鑰。沒設時 `isSupported` 回 false(graceful)— 但**部署時沒人提示要設**。應補進 `.env.example` |
| Cloudflare Function 用 `env.SUPABASE_SERVICE_ROLE_KEY` | `functions/api/auth/delete-account.ts` | CLAUDE.md 有提過,但 `.env.example` 也沒列(因為這是 server-only 不該放前端 env);**建議在 SETUP.md 加 production 環境變數清單** |
| `VITE_ENABLE_APPLE_LOGIN` / `VITE_ENABLE_GOOGLE_LOGIN` | `.env.example`:31-32 註解 | OK,但 `.env.example` 只列了 2 個 OAuth,沒寫「實際用法 + 啟用方式」具體連結 |

---

## C. 建議優化項目

### C.1 元件健檢

**所有元件都被使用** — 沒有 unused。但有幾個結構性建議:

| 元件 | 檔案 | 觀察 |
|---|---|---|
| `Modal.tsx` | `src/components/Modal.tsx` | 被 **31 個檔案**用 — 是 base modal。設計健康,沒問題 |
| `PetInfoModal` 內含 4 個 sub-modal | `RenameModal` / `BoostRealmModal` / `TemperRingModal` / `ColorVariantModal` | 都還是 nested Modal 結構,CLAUDE.md 有提到「日後若報 bug 改 state-based」— 目前未報故維持 |
| `RecordsModal` / `GameModal` 分頁邏輯 | 各自 tab state | 可考慮抽 `<TabBar>` 共用元件減重複,但目前複用度低不急 |
| `BestiaryPetDetail` 取代 nested Modal | `src/components/BestiaryPetDetail.tsx` | 已採 state-based view,符合 CLAUDE.md「避免 iOS Safari backdrop-filter containing block 雷」設計 |

### C.2 元件可抽出的共用 pattern

| Pattern | 出現位置 | 建議 |
|---|---|---|
| **Sprite img + emoji fallback** | `Bestiary.tsx` / `HoldingPicker.tsx`(剛改)/ `BestiaryPetDetail.tsx` / `ShareModal` 內預覽 / `PetInfoModal` 頭像 | 抽 `<CreatureSprite species={species} size={...} />` 元件,封裝 img 載入失敗 fallback。後續加新地方不用再重寫一份 |
| **glass pill button**(amber / sky / red / gray 變體) | `SettingsModal` / `ToolsModal` / `PetInfoModal` / `BestiaryPetDetail` 內各個花費修為按鈕 | 抽 `<CultivationActionButton cost={N} color="amber" disabled={...}>` 統一外觀 + 餘額不足判斷 |
| **進度條 + 百分比文字**(階段 6.X 圖鑑加的) | `Bestiary.tsx:118-127` | 將來成就頁 / 任務頁也適合用,可抽 `<ProgressBar value={n} max={total} />` |

### C.3 資料層健檢

**Dexie schema 15 版,健康**。但每次 migration 都 backfill 舊資料,**v16 可以順手清 deprecated 欄位**(見 B.3)。

| Repository | 狀態 | 風險 |
|---|---|---|
| holdings / pets / transactions | 都已 cloud-first + scheduleRevalidate + lastTransactionAt race 防護(剛加)| ✓ |
| settings / cultivation / loginStreak | cloud-first 但 race 防護**只在 holdings 有做**(用 `lastTransactionAt`)。理論上其他 repo 的 optimistic-write 也有同樣 race | **中等風險** — 觀察是否有用戶報「設定改完又跳回原樣」 |
| achievement / creatureUnlocks / userTasks / milestoneRewards | append-only / one-shot,race 風險低 | ✓ |

### C.4 Supabase RLS

整體健康(見 D 段細節)。**一個可疑點**:

| 表 | 問題 | 建議 |
|---|---|---|
| `holdings` | 目前 SQL migration 內**沒看到 explicit RLS policy**(可能是後來在 dashboard 加的、或預設啟用)| 確認 production dashboard 上 `public.holdings` 有 `auth.uid() = user_id` 的 SELECT/INSERT/UPDATE/DELETE 政策,沒有就補。**否則跨用戶 RLS bypass 風險**|

### C.5 API endpoint 健檢

4 個 Cloudflare Function 都在用:

| 路徑 | 上游 | Caller |
|---|---|---|
| `/api/twse/*` | `openapi.twse.com.tw` | `src/api/marketIndex.ts`(TAIEX 歷史)|
| `/api/mis/*` | `mis.twse.com.tw` | `src/api/twseMis.ts`(盤中即時)|
| `/api/yahoo/*` | `query1.finance.yahoo.com` | `src/services/marketIndexUpdate.ts`(Yahoo ^TWII)+ `src/services/historicalPriceService.ts`(個股歷史)|
| `POST /api/auth/delete-account` | Supabase Admin API | `src/components/SettingsModal.tsx`(刪帳號流程)|

**沒有 unused function**。**沒有 cron**(`.github/workflows/` 只有 update-industries / update-holidays,目標是 commit JSON 進 repo,不打 Supabase)。

### C.6 神獸資料對齊 — **缺**

`creatures.ts` 目前**只有 6 個欄位**(`id` / `name` / `category` / `description` / `emoji` / `art`),user 原 spec 提到的這 **6 個欄位完全沒有**:

| spec 要的欄位 | 現況 |
|---|---|
| 稀有度(rarity) | ❌ 沒有 |
| 屬性(attribute / element) | ❌ 沒有 |
| 原型(archetype / inspiration) | ❌ 沒有 |
| 配色(color scheme) | ⚠️ Pet 有 `colorVariant`(玩家換色用)但**不是 species 出生屬性** |
| 技能名(skill name) | ❌ 沒有 |
| 技能效果(skill effect) | ❌ 沒有 |

需要做什麼:
1. **`src/types/creature.ts`** 加 6 個 optional 欄位(都先 `?`,讓現有 294 entry 不會立刻 type 錯誤)
2. **`src/data/creatures.ts`** 逐隻填(批量靠 Excel + 一個生成 script)
3. **UI 接收**:Bestiary 詳細頁 / PetInfoModal / ShareCard 顯示這些屬性
4. **遊戲機制**:如果稀有度 / 技能要影響玩法(召喚機率、戰鬥)— 是大工程,要先決設計

### C.7 文件健檢

| 文件 | 狀態 |
|---|---|
| `README.md` | **過時**:首頁仍寫「50 隻原創上古神祇」,實際已 **294 隻**。 「30+ 成就(5 類)、50 隻神祇圖鑑」也應更新 |
| `PROJECT_STATUS.md` | **過時**:沒記錄階段 6 圖鑑擴充、階段 6 工具按鈕拆分、階段 6 圖鑑進度條等近期改動 |
| `CLAUDE.md` | 大致同步,但「美術立繪流程」段仍寫 50 隻,可補 244 批次經驗 |
| `SETUP.md` | 沒檢查,部署相關建議補上 `VITE_VAPID_PUBLIC_KEY` 跟 `SUPABASE_SERVICE_ROLE_KEY` 兩個 env var 說明 |
| `docs/art-prompts.md` | 「§1 表 50 隻」— 沒延伸到 244 新加的,如果想用 `npm run download:sprites` 重抓需要補表 |

---

## D. 風險與警告

### D.1 高優先

| 風險 | 位置 | 細節 |
|---|---|---|
| **`holdings` 可能沒 RLS** | Supabase production | migration 沒寫,如果 dashboard 也沒手動加,任何登入用戶可以讀別人 holdings。**建議立刻去 Supabase dashboard 確認** |
| **scheduleRevalidate race 防護不全** | 8 個 cloud-first repo,只有 `holdingRepo` 有 `lastTransactionAt` 比對 | settings / cultivation / loginStreak / pet 等其他寫入,理論上仍可能被 race 蓋回舊值。觀察是否復現 |

### D.2 中優先

| 風險 | 位置 | 細節 |
|---|---|---|
| **`user_creature_summary` schema 不一致** | Supabase production | repo 內 SQL `20260516_stage4b_creature_summary_repair.sql` 已寫好正確 per-species schema,但用戶部署的版本仍是舊「per-user + collected_species array」。前端有 localStorage circuit-break 跳過呼叫;**要正式啟用好友 profileSync 需 user 跑那條 SQL** |
| **Yahoo / TWSE proxy 沒 fallback** | `functions/api/{yahoo,twse}/[[path]].ts` | upstream 暫時 503 時 chart 直接空。`ensureTaiexHistory` 已拿掉 24h circuit-break(階段 6),目前是每次 mount 重試 — 如果 upstream 長期掛,console 會反覆 warn |
| **Cultivation log 不上雲** | `cultivationRepo.ts:26` 註解明說 | 換裝置/清快取會丟修為時間軸,但 balance/lifetime 數字保留(走 user_cultivation 表)|

### D.3 低優先 / 已知設計取捨

| 議題 | 說明 |
|---|---|
| Bundle size 783 KB(主 chunk) | recharts / phaser 各佔大頭。phaser-UtE5cioH.js 1.48 MB 已 split lazy 載入,recharts 565 KB 是同步 dep,可考慮按 chart tab dynamic import |
| `cultivationLog` Dexie auto-increment id 跟雲端 bigint id 用 `cloudId?` bridge | 設計上已處理,目前未上雲所以沒事。如果之後要上雲記得測 dedup |
| `Pet.lastRealmCheck` / `lastEffectCheck` 純本機 UI 防抖欄位 | 不上雲,設計上 OK;換裝置時不會放升境動畫(正確行為)|
| `Holding.petId` 是本機 PK,不上雲 | `forceFetchAllFromCloud` 後跑 `reconcileHoldingPetIds` 對齊,設計上已處理 |
| 4 個 PetInfoModal sub-modal 仍是 nested Modal | CLAUDE.md 已記為「日後若報 bug 再改 state-based」,目前未報 |
| Service Worker `sprites-cache-v2` | 剛升版(階段 6.X),配合 `cleanupOutdatedCaches: true` 會自動清舊 v1 |

---

## E. 後續可動作清單(優先順序)

按工程複雜度低 → 高排:

1. **拔 `zustand` 套件**(1 分鐘)— `npm uninstall zustand`,確認 build pass
2. **更新 README / PROJECT_STATUS.md 數字 50 → 294**(15 分鐘)
3. **補 `.env.example` 加 `VITE_VAPID_PUBLIC_KEY` 註解**(5 分鐘)
4. **確認 Supabase `holdings` 表 RLS**(去 dashboard 看 5 分鐘)
5. **降級 / 拔掉 4 個 boot-time console.log**(`historyBootstrap` / `App.tsx` / `PwaUpdatePrompt` 等)(10 分鐘)
6. **拔 `src/utils/amountMasker.ts` + `src/utils/quietHours.ts`**(如確認沒用)(5 分鐘)
7. **Dexie schema v16:清 deprecated Settings 欄位 + 拔 `migrateLegacyFromSettings`**(中等工程,要寫 migration callback)
8. **抽 `<CreatureSprite>` 共用元件**(中等工程,改 5-6 個 caller)
9. **同步 holdingRepo 的 race 防護到其他 4 個 repo**(中等工程,需替每個 repo 加 `updatedAt` 比對)
10. **`CreatureSpecies` 加 6 個欄位 + 補 294 隻資料**(大工程,需設計 + Excel + script)

---

## F. 結論

- **核心架構乾淨** — 0 dead component / 0 dead service / 0 dead repo / 0 TODO / 0 註解掉的舊邏輯
- **明顯 dead 只有**:`zustand` 沒用、`amountMasker.ts` + `quietHours.ts` 兩個 utils 沒人 import
- **真正需要工程的是 D.1 兩條**:holdings RLS 確認 + race 防護擴大
- **規劃中沒做完的**:神獸 6 個進階欄位(稀有度/屬性/技能等)— spec 提到但 code 沒實作
- **文件更新落後**:README 數字、PROJECT_STATUS 階段 6 內容、CLAUDE.md 美術段
