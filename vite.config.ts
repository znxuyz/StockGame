import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['icon.svg', 'icons/*.png'],
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
      globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/openapi\.twse\.com\.tw\/.*/i,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'twse-api-cache',
            expiration: { maxEntries: 50, maxAgeSeconds: 60 * 10 },
            networkTimeoutSeconds: 10
          }
        },
        {
          urlPattern: /^https:\/\/www\.tpex\.org\.tw\/.*/i,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'tpex-api-cache',
            expiration: { maxEntries: 50, maxAgeSeconds: 60 * 10 },
            networkTimeoutSeconds: 10
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
      }
    }
  }
});