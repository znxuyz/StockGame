/**
 * 階段 5D:神獸修仙分享(手動發文)。
 *
 *  - 內容 500 字,跟 feed_events 共用 store(event_type='cultivation_share')
 *  - 敏感詞偵測在前端:命中時提示玩家修改,**不阻擋**發布
 *    法規角度只是提醒,讓玩家自己選用詞,合規責任在玩家
 *  - 標籤的神獸 / 股票存 event_data 內,顯示時可點對應神獸頁
 */

import { publishFeedEvent } from './feedEventService';

/**
 * 敏感詞清單。命中時前端 warning。
 * 來源:常見投資建議用語 + 證券法規禁用詞。
 * 保守清單,日後可調。
 */
const SENSITIVE_WORDS = [
  '建議買',
  '強烈推薦',
  '保證賺',
  '保證獲利',
  '穩賺',
  '目標價',
  '停損',
  '停利',
  '進場',
  '出場',
  '加碼買進',
  '報明牌',
  '報股票',
  '必漲',
  '一定漲',
  '一定跌',
  '一定賺'
];

export interface DetectedSensitive {
  /** 命中的關鍵詞 list(去重後) */
  hits: string[];
}

/**
 * 偵測敏感詞。回 hits 為空 array → 沒問題;非空 → caller 顯示警告。
 *  - 大小寫不敏感(雖然敏感詞清單全中文)
 *  - 不做 stemming / 同義詞,單純 substring match
 */
export function detectSensitiveWords(text: string): DetectedSensitive {
  const lower = text.toLowerCase();
  const hits: string[] = [];
  for (const word of SENSITIVE_WORDS) {
    if (lower.includes(word.toLowerCase())) hits.push(word);
  }
  return { hits: Array.from(new Set(hits)) };
}

export interface PublishShareInput {
  content: string;
  taggedCreatures?: string[];
  taggedStocks?: string[];
}

/**
 * 發布修仙分享。500 字限制 + 寫入 feed_events。
 * 失敗回 { ok:false, error }。
 */
export async function publishCultivationShare(
  input: PublishShareInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const content = input.content.trim();
  if (content.length < 1) return { ok: false, error: '內容不能空白' };
  if (content.length > 500) return { ok: false, error: '內容最多 500 字' };

  const r = await publishFeedEvent('cultivation_share', {
    content,
    taggedCreatures: input.taggedCreatures?.slice(0, 10) ?? [],
    taggedStocks: input.taggedStocks?.slice(0, 10) ?? []
  });
  if (!r.ok) return { ok: false, error: '發布失敗,請稍後再試' };
  return { ok: true };
}
