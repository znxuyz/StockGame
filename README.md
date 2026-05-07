# 神獸股市

把你的台股投資組合變成上古神祇動物園的 PWA 小遊戲。

> 買股票 = 召喚神獸,股票賺錢神獸進化、虧損神獸黑化,賣出進圖鑑。台股盤中
> 自動更新、雲端帳號跨裝置同步。

---

## 設計重點

- **平台**:PWA(網頁版可加到手機桌面變 App,iOS Safari + Android Chrome 都支援)
- **市場**:台股上市 / 上櫃 / ETF
- **資料來源**:台灣證交所 mis 即時報價 + OpenAPI(盤中 9:05–13:30 自動每 30 秒更新,假日 / 盤後用最新收盤)
- **儲存**:本地 IndexedDB(單機可用)+ 可選的 Supabase 雲端同步(換手機無痛接續)
- **券商手續費**:預設台新證券(無折扣、最低 NT$20),可在設定頁改
- **20 隻原創上古神祇**:太初炎君、玄黃地母、鴻鈞道祖等,搭配水墨立繪(若 MJ 圖檔到位)或 emoji 兜底

## 寵物系統

- **境界**:凡獸 → 靈獸 → 妖獸 → 神獸 → 聖獸 → 仙獸(六階正向)
- **修為**:每個境界 Lv.1–99
- **黑化**:長期虧損變凶獸(一階 → 二階 → 三階)
- **淨化**:凶獸狀態回正報酬可變回原境界

## 技術棧

| 層 | 工具 |
|---|---|
| 框架 | Vite + React 18 + TypeScript |
| 遊戲引擎 | Phaser 3 |
| UI | Tailwind CSS |
| 圖表 | Recharts |
| 本地資料庫 | Dexie (IndexedDB) |
| 雲端帳號 / 同步 | Supabase(Auth + Postgres + RLS) |
| 部署 | Cloudflare Pages + Pages Functions |
| PWA | vite-plugin-pwa |

## 螢幕截圖

(待補)

---

## 自架 / 部署

想 fork 這個 repo 自己部署一份 → 看 **[SETUP.md](./SETUP.md)** 完整步驟,從 Supabase 開帳號到 Cloudflare Pages 上線約 30 分鐘搞定,**完全免費**(在自由額度內)。

## 本機開發

```bash
npm install
npm run dev          # 本機 http://localhost:5173
npm run build        # 打包
npm run preview      # 預覽 build
npx tsc --noEmit     # 型別檢查
```

雲端同步功能要先建 `.env.local`(複製 `.env.example` + 填 Supabase 值),沒設也能跑(離線模式)。詳見 SETUP.md。

## 開發流程

- 開發在 feature branch → 完成後 merge 進 `main`
- Cloudflare Pages 綁 `main` branch 自動部署
- Feature branch 會拿到獨立 preview URL

## License

MIT
