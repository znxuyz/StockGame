import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    injectRegister: 'auto',
    includeAssets: ['icons/*.png'],
    manifest: {
      name: '山海經股票養成',
      short_name: '神獸股市',
      description: '把你的台股投資組合變成山海經神獸動物園',
      // 米紙底色,跟 Phaser 場景 + sprite 米紙底融合
      theme_color: '#efe6cf',
      background_color: '#efe6cf',
      display: 'standalone',
      orientation: 'portrait',
      lang: 'zh-Hant',
      categories: ['finance', 'games'],
      icons: [
        // 九尾狐光柵 favicon(來源 public/app-icon-source.JPG,build:icons 烘出)
        // 舊 icon.svg 不再 wire 進 manifest 但檔案保留以備 rollback
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        // Maskable(Android adaptive 自動裁圓/圓角時主視覺在 80% safe-zone 內)
        { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ],
      shortcuts: [
        {
          name: '買入神獸',
          short_name: '買入',
          description: '直接開啟買入彈窗',
          url: '/?action=buy',
          icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }]
        }
      ]
    },
    workbox: {
      // 部署新版時清掉舊版 precache,避免 Safari 永遠抓到舊資源
      cleanupOutdatedCaches: true,
      // skipWaiting=false:不強制立刻接管,等用戶按 PwaUpdatePrompt「更新」鈕才切版
      // clientsClaim=true:新 SW activate 後立刻接管所有 tab,避免雙版本並存
      skipWaiting: false,
      clientsClaim: true,
      globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff2}'],
      // 階段 5F:Web Push 事件處理 — 進 SW 後 importScripts 載入 push 監聽
      // public/push-handler.js 會被原樣拷到 dist/,SW 同源 import 安全
      importScripts: ['push-handler.js'],
      runtimeCaching: [
        // ── 雲端 API:不快取(每次都要 fresh,避免拿到別人 / 過期資料)
        {
          urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
          handler: 'NetworkOnly'
        },
        // ── openapi.twse.com.tw:不走 SW(階段 6)
        //   原 NetworkFirst 設定在 CORS 失敗時會 fallback 試 cache,cache 沒命中
        //   再 throw `no-response`,放大 workbox 紅字噪音。改不攔截 → 瀏覽器
        //   直接 fetch,App 層 try/catch 自己處理 + 24h circuit-break。
        //   代價:離線時沒有 SW cache fallback。但 TWSE 歷史 K 線只在開
        //   RecordsModal 對比圖才用,離線體驗影響低。
        {
          urlPattern: /^https:\/\/www\.tpex\.org\.tw\/.*/i,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'tpex-api-cache',
            expiration: { maxEntries: 50, maxAgeSeconds: 60 * 10 },
            networkTimeoutSeconds: 10
          }
        },
        // ── /api/* 代理(dev server proxy 路徑):NetworkFirst 5 分鐘 TTL
        {
          urlPattern: /\/api\//,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'api-cache',
            networkTimeoutSeconds: 5,
            expiration: { maxAgeSeconds: 60 * 5 }
          }
        },
        // ── 神獸立繪:幾乎不變,CacheFirst 30 天
        //   階段 6.X:294 隻 sprite → maxEntries 100 → 300(原 100 會 LRU 淘汰部分立繪)
        //   cacheName v1 → v2:強制 SW 重新抓所有 sprite(配合 cleanupOutdatedCaches
        //   會清掉舊 sprites-cache,新 sprites-cache-v2 從頭填,避免舊版 SW 殘留
        //   「該 sprite 不存在」的 negative cache)
        {
          urlPattern: /\/sprites\/.*\.png$/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'sprites-cache-v2',
            expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 }
          }
        },
        // ── 場景背景 / 按鈕 / 粒子貼圖:CacheFirst 7 天
        {
          urlPattern: /\/assets\/(bg|btn|particles)\/.*$/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'assets-cache',
            expiration: { maxAgeSeconds: 60 * 60 * 24 * 7 }
          }
        }
      ]
    }
  })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  build: {
    rollupOptions: {
      output: {
        // Phaser 約 1.4MB，獨立成 chunk 才不會拖慢首載
        manualChunks: {
          phaser: ['phaser'],
          recharts: ['recharts']
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api/twse': {
        target: 'https://openapi.twse.com.tw',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/twse/, '')
      },
      '/api/tpex': {
        target: 'https://www.tpex.org.tw',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/tpex/, '')
      },
      '/api/mis': {
        target: 'https://mis.twse.com.tw',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/mis/, '')
      },
      // 階段 5H:Yahoo Finance 歷史日 K(給歷史曲線回推用)
      // 同一個 endpoint 用 .TW / .TWO 後綴區分上市/上櫃,免 per-month 串行
      '/api/yahoo': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/yahoo/, '')
      }
    }
  }
});