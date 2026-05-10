/**
 * 神獸配色(階段 4B.2 配色淬煉)。
 *
 * 5 種選擇,Phaser sprite 用 setTint(value) 套色:
 *  - default → 不套 tint(原始立繪)
 *  - cyan / gold / purple / rose → 對應 RRGGBB 整數
 *
 * tint 數值挑得偏中等飽和,不會把整張立繪洗成單色。Phaser 的 setTint
 * multiplicative blend:0xFFFFFF = 不影響、0xFFFFFF 漸暗 = 染色強度上升。
 */

import type { PetColorVariant } from '@/types';

/** Phaser tint 整數,null = 不 setTint(原色) */
export const COLOR_VARIANT_TINT: Record<PetColorVariant, number | null> = {
  default: null,
  cyan: 0x00ced1,
  gold: 0xffd700,
  purple: 0x9c27b0,
  rose: 0xffb6c1
};

/** UI 顯示標籤 */
export const COLOR_VARIANT_LABEL: Record<PetColorVariant, string> = {
  default: '原色',
  cyan: '青焰版',
  gold: '金尾版',
  purple: '紫晶版',
  rose: '玫瑰版'
};

/** UI 渲染順序(modal 內 swatch 排列) */
export const COLOR_VARIANT_ORDER: PetColorVariant[] = [
  'default',
  'cyan',
  'gold',
  'purple',
  'rose'
];

/** CSS 用色碼(modal 內小圓圈 swatch 顯示),default 給灰 placeholder */
export const COLOR_VARIANT_CSS: Record<PetColorVariant, string> = {
  default: '#d1d5db', // gray-300 placeholder(代表原色)
  cyan: '#00CED1',
  gold: '#FFD700',
  purple: '#9C27B0',
  rose: '#FFB6C1'
};
