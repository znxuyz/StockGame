/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 台股配色：紅漲綠跌
        'tw-up': '#e23b3b',
        'tw-down': '#1f9e4a',
        'tw-flat': '#666',
        // 沙漠地圖色系（呼應參考截圖）
        'sand-50': '#fdf6e3',
        'sand-100': '#f5deb3',
        'sand-200': '#e8c98a',
        'sand-300': '#d4a85a',
        // 境界顏色
        'tier-normal': '#9ca3af',
        'tier-spirit': '#22c55e',
        'tier-demon': '#a855f7',
        'tier-god': '#eab308',
        'tier-saint': '#f97316',
        'tier-celestial': '#ec4899',
        'tier-cursed-1': '#6b21a8',
        'tier-cursed-2': '#991b1b',
        'tier-cursed-3': '#0a0a0a',
        // ─── 神話 UI 主題色(階段 1 新增,跟 frame_card / banner / 按鈕底色一致) ───
        mythic: {
          gold: {
            50: '#faf3dd',
            100: '#f4e7b8',
            200: '#e8d28a',
            300: '#d4a85a', // 卡框金邊
            400: '#c08e3a',
            500: '#b8842c',
            600: '#956619',
            700: '#6f4a10'
          },
          jade: {
            50: '#dceee5',
            100: '#a6d4be',
            200: '#6fb195',
            300: '#3a7a5e',
            400: '#2c5e48',
            500: '#214e3d', // 卡框翠玉主色
            600: '#193b2e'
          },
          ink: {
            50: '#3d3a35',
            100: '#2a2622',
            200: '#1a1a1a',
            300: '#0d0d0d'
          },
          paper: {
            50: '#fffbf0',
            100: '#fdf6e3',
            200: '#efe6cf', // 現有底色
            300: '#e0d4b0',
            400: '#c8b88a'
          },
          cinnabar: '#a83232', // 朱砂
          navy: '#1a2a4a' // 卷軸按鈕深藍底
        }
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', '"Noto Sans TC"', 'monospace'],
        zh: ['"Noto Sans TC"', '"PingFang TC"', '"Microsoft JhengHei"', 'sans-serif'],
        // 階段 1 新增:襯線中文字體 — 神話氛圍標題 / 卷軸內容
        serif: ['"Noto Serif TC"', '"Songti TC"', '"PMingLiU"', 'serif'],
        display: ['"Noto Serif TC"', '"Songti TC"', '"PMingLiU"', 'serif']
      },
      boxShadow: {
        // 卡片懸浮(綠玉投影 + 內部金邊光)
        'mythic-card': '0 4px 12px rgba(33, 78, 61, 0.18), inset 0 1px 0 rgba(212, 168, 90, 0.45)',
        // 按鈕(深色投影 + 內部上緣高光)
        'mythic-button': '0 2px 6px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
        // 金光暈(用於 hover / 啟用態)
        'mythic-glow': '0 0 24px rgba(212, 168, 90, 0.55)'
      },
      borderRadius: {
        'mythic-sm': '0.5rem',
        'mythic-md': '0.875rem',
        'mythic-lg': '1.25rem'
      }
    }
  },
  plugins: []
};
