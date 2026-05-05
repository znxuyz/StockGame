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
        'tier-cursed-3': '#0a0a0a'
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', '"Noto Sans TC"', 'monospace'],
        zh: ['"Noto Sans TC"', '"PingFang TC"', '"Microsoft JhengHei"', 'sans-serif']
      }
    }
  },
  plugins: []
};
