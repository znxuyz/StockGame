/**
 * 寵物等級計算(精簡版,2026-05 後改版)。
 *
 * 設計改變:整套「境界 tier / 黑化 / 淨化」系統已移除。
 * 寵物只剩「修為等級」一個數字,沒有對應的境界文字標籤。
 * 等下一輪改版再決定新的養成機制。
 *
 * 觸發點:每次價格更新 + 每次買入/加碼/賣出後,根據累積投入更新 level,
 * 沒有事件 toast。
 */

/** 計算等級:每 1,000 NT$ 投入 = 1 級,最低 1,最高 999 */
export function calculateLevel(totalCost: number): number {
  return Math.max(1, Math.min(999, Math.floor(totalCost / 1000) + 1));
}
