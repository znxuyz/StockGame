/**
 * Cloudflare Pages Function:把 /api/twse/* 的請求轉發到 openapi.twse.com.tw。
 *
 * 用途:openapi.twse.com.tw 對部分 origin(包括 Cloudflare Pages 子網域)
 *      不開 CORS,瀏覽器直接打會被擋。本 function 在邊緣節點代為轉發,
 *      回應加上 CORS 標頭給前端用。
 *
 * 對應 dev proxy 設定:vite.config.ts 的 `/api/twse` proxy(同 path 同
 * upstream),production 換成這個 function 接手。
 *
 * 部署:Cloudflare Pages 自動把 functions/ 目錄編譯成 edge workers
 * (不需要 wrangler 設定)。
 */

interface PagesContext {
  request: Request;
  params: { path?: string[] };
}

const UPSTREAM = 'https://openapi.twse.com.tw';

export const onRequest: (context: PagesContext) => Promise<Response> = async ({ request, params }) => {
  const url = new URL(request.url);
  const subpath = (params.path ?? []).join('/');
  const target = new URL(`${UPSTREAM}/${subpath}${url.search}`);

  // 只接受 GET(OpenAPI 全是 GET)+ CORS preflight OPTIONS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400'
      }
    });
  }
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  let upstreamResp: Response;
  try {
    upstreamResp = await fetch(target.toString(), {
      method: 'GET',
      headers: {
        // 模擬瀏覽器標頭,OpenAPI 有時對空 user-agent 拒絕
        'User-Agent': 'Mozilla/5.0 (StockGame PWA)',
        Accept: 'application/json, */*; q=0.01'
      }
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'upstream_fetch_failed', message: String(e) }),
      { status: 502, headers: { 'content-type': 'application/json' } }
    );
  }

  const headers = new Headers(upstreamResp.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  // 歷史 K 線可短時間 cache(10 分鐘),減 upstream 壓力
  headers.set('Cache-Control', 'public, max-age=600');
  headers.delete('set-cookie');

  return new Response(upstreamResp.body, {
    status: upstreamResp.status,
    statusText: upstreamResp.statusText,
    headers
  });
};
