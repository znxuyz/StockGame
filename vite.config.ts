import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
    manifest: {
      name: '山海經股票養成',
      short_name: '神獸股市',
      description: '把你的台股投資組合變成山海經神獸動物園',
      theme_color: '#f5deb3',
      background_color: '#f5deb3',
      display: 'standalone',
      orientation: 'portrait',
      lang: 'zh-Hant',
      icons: [
        {
          src: 'icons/icon-192.png',
          sizes: '192x192',
          type: 'image/png'
        },
        {
          src: 'icons/icon-512.png',
          sizes: '512x512',
          type: 'image/png'
        },
        {
          src: 'icons/icon-512-maskable.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable'
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
  }), cloudflare()],
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