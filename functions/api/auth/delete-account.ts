/**
 * Cloudflare Pages Function:`POST /api/auth/delete-account`
 *
 * 流程:
 *  1. 從 Authorization header 拿 user 的 access token
 *  2. 用 admin client(service_role)驗 token、解出 user_id
 *  3. admin.auth.admin.deleteUser(user_id) 砍掉 auth.users 那筆 row
 *  4. user_data 表的對應 row 因 ON DELETE CASCADE 自動跟著刪
 *  5. 回 { ok: true }
 *
 * 環境變數需求(只能在 Cloudflare Pages dashboard 的 Production 環境設,
 * 絕對不可以加 VITE_ 前綴或放進前端 bundle):
 *  - SUPABASE_URL          (或 fallback VITE_SUPABASE_URL,後者前端也可讀)
 *  - SUPABASE_SERVICE_ROLE_KEY(server-only,有它能繞過 RLS 看任何人資料)
 *
 * 為什麼必須在 server 跑:
 *  Supabase JS client 的 auth.admin.* 必須用 service_role key,該 key 不能
 *  暴露給前端;因此走 Cloudflare Pages Function 在邊緣節點處理。
 */

import { createClient } from '@supabase/supabase-js';

interface Env {
  VITE_SUPABASE_URL?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
}

export const onRequest: (ctx: PagesContext) => Promise<Response> = async ({ request, env }) => {
  // CORS preflight(same-origin 通常不需要,但定義穩健一些)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type'
      }
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const auth = request.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Missing authorization header' }, 401);
  }
  const token = auth.slice('Bearer '.length).trim();
  if (!token) {
    return jsonResponse({ error: 'Empty access token' }, 401);
  }

  // 偏好沒前綴的 SUPABASE_URL,沒設就 fallback VITE_SUPABASE_URL
  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { error: 'Server not configured (missing SUPABASE_SERVICE_ROLE_KEY)' },
      500
    );
  }

  // admin client — 只在 server 用,絕不 expose 到前端
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // 用 token 反查 user;Supabase 同時驗 signature + expiry
  const { data: userData, error: userErr } = await adminClient.auth.getUser(token);
  if (userErr || !userData.user) {
    return jsonResponse({ error: 'Invalid or expired token' }, 401);
  }

  const userId = userData.user.id;

  // 砍 auth user → user_data 那筆 row 走 ON DELETE CASCADE 自動消失
  const { error: delErr } = await adminClient.auth.admin.deleteUser(userId);
  if (delErr) {
    return jsonResponse({ error: delErr.message }, 500);
  }

  return jsonResponse({ ok: true, deletedUserId: userId });
};

function jsonResponse(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
