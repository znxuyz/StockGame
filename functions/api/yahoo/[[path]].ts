/**
 * Cloudflare Pages Function:把 /api/yahoo/* 轉發到 query1.finance.yahoo.com。
 *
 * 用途:Yahoo Finance 的歷史日 K(/v8/finance/chart/<TICKER>?...)沒有 CORS,
 *      瀏覽器直接打會被擋。本 function 在邊緣節點代為轉發,加 CORS 標頭。
 *
 * 用在 historicalPriceService.ts:給「累積報酬率 / 月度損益」歷史曲線回推。
 *
 * 同 mis 的設計:dev 用 vite proxy(vite.config.ts /api/yahoo),production 用本 function。
 */

interface PagesContext {
  request: Request;
  params: { path?: string[] };
}

const UPSTREAM = 'https://query1.finance.yahoo.com';

export const onRequest: (context: PagesContext) => Promise<Response> = async ({
  request,
  params
}) => {
  const url = new URL(request.url);
  const subpath = (params.path ?? []).join('/');
  const target = new URL(`${UPSTREAM}/${subpath}${url.search}`);

  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  let upstreamResp: Response;
  try {
    upstreamResp = await fetch(target.toString(), {
      method: 'GET',
      headers: {
        // Yahoo 對 user-agent 沒嚴格要求,但帶一個正常瀏覽器值較不會被風控
        'User-Agent': 'Mozilla/5.0 (StockGame PWA)',
        Accept: 'application/json, text/javascript, */*; q=0.01'
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
  headers.set('Cache-Control', 'no-store');
  headers.delete('set-cookie');

  return new Response(upstreamResp.body, {
    status: upstreamResp.status,
    statusText: upstreamResp.statusText,
    headers
  });
};
