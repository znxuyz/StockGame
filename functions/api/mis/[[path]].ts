/**
 * Cloudflare Pages Function：把 /api/mis/* 的請求轉發到 mis.twse.com.tw。
 *
 * 用途：mis.twse.com.tw 的即時報價 API 沒有 CORS 標頭，
 *      瀏覽器直接打會被擋。本 function 在邊緣節點代為轉發，
 *      回應加上 CORS 標頭給前端用。
 *
 * 部署：
 *  - Cloudflare Pages 偵測到 functions/ 目錄會自動把每個檔案當成 edge function
 *  - 不需要額外 wrangler 設定
 *
 * 替代方案：
 *  - Vercel：在 api/ 目錄建類似檔案，匯出 default async function
 *  - 自架：用 nginx reverse proxy
 *
 * 本檔案僅在 production 部署時會用到，dev 模式 vite 自帶 proxy。
 */

interface PagesContext {
  request: Request;
  params: { path?: string[] };
}

const UPSTREAM = 'https://mis.twse.com.tw';

export const onRequest: (context: PagesContext) => Promise<Response> = async ({ request, params }) => {
  const url = new URL(request.url);
  const subpath = (params.path ?? []).join('/');
  const target = new URL(`${UPSTREAM}/${subpath}${url.search}`);

  // 只允許 GET（即時報價是 GET API）
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  let upstreamResp: Response;
  try {
    upstreamResp = await fetch(target.toString(), {
      method: 'GET',
      headers: {
        // 模擬瀏覽器標頭，mis API 對 user-agent 有些基本要求
        'User-Agent': 'Mozilla/5.0 (StockGame PWA)',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        Referer: 'https://mis.twse.com.tw/'
      }
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'upstream_fetch_failed', message: String(e) }),
      { status: 502, headers: { 'content-type': 'application/json' } }
    );
  }

  const headers = new Headers(upstreamResp.headers);
  // 強制覆寫 CORS（origin 鎖到部署網域更嚴謹，但 PWA 自己用先放寬）
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Cache-Control', 'no-store');
  // 移除可能干擾前端的 set-cookie
  headers.delete('set-cookie');

  return new Response(upstreamResp.body, {
    status: upstreamResp.status,
    statusText: upstreamResp.statusText,
    headers
  });
};
