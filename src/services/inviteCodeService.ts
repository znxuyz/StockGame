import { supabase } from '@/lib/supabase';

/**
 * 階段 5A:邀請碼生成 / 格式化 / 解析。
 *
 *  - 8 碼字母 + 數字,排除易混淆字元(0/O/1/I/L)
 *  - 顯示格式:XXXX-XXXX(中間 dash)
 *  - 搜尋輸入大小寫不敏感,自動 toUpperCase + 移除 dash
 *  - 寫入 user_profile.invite_code,unique constraint 防重複
 */

const VALID_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 8;
const MAX_RETRIES = 10;

/** 內部:純隨機 8 碼 */
function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LEN; i++) {
    code += VALID_CHARS.charAt(Math.floor(Math.random() * VALID_CHARS.length));
  }
  return code;
}

/** 顯示格式 XXXX-XXXX */
export function formatInviteCode(code: string): string {
  const clean = code.toUpperCase();
  if (clean.length !== CODE_LEN) return clean;
  return clean.slice(0, 4) + '-' + clean.slice(4);
}

/**
 * 解析使用者輸入:移除 dash、轉大寫、trim 空白。
 * 不檢驗長度(讓 search service 自己處理),只負責 normalize。
 */
export function parseInviteCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

/**
 * 邊輸入邊自動加 dash,給 input onChange 用。
 *  - 輸入 STK7A9B2 → 顯示 STK7-A9B2
 *  - 輸入 4 碼就先加,讓 visual feedback 即時
 *  - 超過 8 碼自動截掉
 */
export function formatInviteCodeInput(rawInput: string): string {
  const clean = parseInviteCode(rawInput).slice(0, CODE_LEN);
  if (clean.length <= 4) return clean;
  return clean.slice(0, 4) + '-' + clean.slice(4);
}

/**
 * 生成唯一 invite_code:碰撞時重試最多 10 次。
 *  - select 找對應 row,空 → 沒被用過,可以給
 *  - 10 次都撞牆 → throw,讓 caller 顯示錯誤
 *
 * 注意:這只在 user_profile 第一次建立時呼叫一次,不需要快取。
 */
export async function generateUniqueInviteCode(): Promise<string> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    const code = generateInviteCode();
    const { data, error } = await supabase
      .from('user_profile')
      .select('user_id')
      .eq('invite_code', code)
      .maybeSingle();
    if (error) {
      // RLS / 網路錯誤 → 直接 throw,讓 caller 處理
      throw new Error(`邀請碼查詢失敗:${error.message}`);
    }
    if (!data) return code;
  }
  throw new Error('無法生成唯一邀請碼,請稍後再試');
}

/** 給單元測試 / dev tool 用,正式邏輯不應該直接呼叫 */
export const _internal = { generateInviteCode, CODE_LEN, VALID_CHARS };
