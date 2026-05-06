# 山海經股票養成 · 神獸股市

把你的台股投資組合變成山海經神獸動物園的 PWA 小遊戲。

## 設計重點

- **平台**：PWA（網頁版可加到手機桌面變 App）
- **市場**：台股上市 / 上櫃 / ETF
- **資料來源**：台灣證交所 OpenAPI + 證券櫃買中心 OpenAPI
- **更新頻率**：盤中每 5 分鐘（9:05 起到 13:30），盤後/假日用最新收盤價
- **券商手續費**：台新證券（無折扣，最低 NT$20，可在設定改）
- **儲存**：本地 IndexedDB（單機版，未來可加雲端）

## 寵物系統

- **境界**：凡獸 → 靈獸 → 妖獸 → 神獸 → 聖獸 → 仙獸（六階）
- **修為**：每個境界 Lv.1-99
- **黑化**：賠錢長期持有會變凶獸（一階 → 二階 → 三階）
- **淨化**：凶獸狀態回正報酬可變回原境界

## 技術棧

| 層 | 工具 |
|---|---|
| 框架 | Vite + React 18 + TypeScript |
| 遊戲引擎 | Phaser 3 |
| UI | Tailwind CSS |
| 圖表 | Recharts |
| 本地資料庫 | Dexie (IndexedDB) |
| 狀態管理 | Zustand |
| PWA | vite-plugin-pwa |

## 開發

```bash
npm install
npm run dev          # 本機開發
npm run build        # 打包
npm run preview      # 預覽 build
npm run typecheck    # 型別檢查
```

## 部署

- 正式網址：https://stockgame-692.pages.dev（Cloudflare Pages）
- Production 綁定 `main` branch，push 到 main 自動部署
- Feature branch 會拿到獨立 preview URL（`<commit>.stockgame-692.pages.dev`）

## 開發流程

新功能 / 修 bug 走 feature branch → 開 PR → 合進 `main`，正式網址自動更新。
不直接 push main。
