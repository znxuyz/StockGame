/**
 * 階段 5E:金額遮罩 util。
 *
 *  - 'full'    → "1,234,567"(千分位逗號)
 *  - 'partial' → "1*****7"(首尾各 1 碼明碼,中間 *)
 *  - 'hidden'  → "---"(完全隱藏)
 *
 * 負數一律遮罩成 hidden(避免「-1*****7」造成奇怪歧義);零原樣顯示。
 */

import type { PortfolioVisibility } from '@/types';

export function maskAmount(amount: number, visibility: PortfolioVisibility): string {
  if (!Number.isFinite(amount)) return '---';
  if (visibility === 'hidden') return '---';

  // partial 不處理負數(統一回 hidden 樣式),full 才顯示負數
  if (visibility === 'partial' && amount < 0) return '---';

  if (visibility === 'full') {
    return Math.round(amount).toLocaleString('zh-TW');
  }

  // partial:取絕對值 string,首尾各 1 碼明碼
  const str = Math.floor(Math.abs(amount)).toString();
  if (str.length <= 2) return '**';
  const first = str.charAt(0);
  const last = str.charAt(str.length - 1);
  const middle = '*'.repeat(str.length - 2);
  return first + middle + last;
}

/** 百分比顯示(0.155 → "+15.50%");隱藏 → "—" */
export function formatReturnPercent(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return '—';
  const sign = ratio >= 0 ? '+' : '';
  return `${sign}${(ratio * 100).toFixed(2)}%`;
}
