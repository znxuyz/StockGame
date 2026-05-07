import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client 單例。
 *
 * 兩種環境都從 import.meta.env 讀:
 *  - 本機 dev:`.env.local`(gitignored,自己 cp 自 .env.example)
 *  - Cloudflare Pages production:dashboard → Settings → Environment variables
 *
 * 沒設環境變數時 client 仍會建,但 isCloudConfigured = false,UI 會把雲端
 * 功能整個藏起來,app 退化成離線模式仍可正常運作。
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isCloudConfigured = Boolean(url && anonKey);

if (!isCloudConfigured) {
  console.info(
    '[supabase] 未設定 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY,雲端同步功能停用。'
  );
}

/**
 * 沒環境變數時用空字串建 client(避免 createClient throw)。
 * 我們透過 isCloudConfigured guard 任何呼叫這個 client 的程式碼,
 * 所以實務上不會真的打到 Supabase。
 */
export const supabase: SupabaseClient = createClient(url ?? 'https://invalid.local', anonKey ?? 'invalid', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true // 處理 magic link 點完跳回的 #access_token=...
  }
});
