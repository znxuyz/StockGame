/* 階段 5F:Web Push 事件處理(import 進 vite-plugin-pwa 生成的 sw.js)
 *
 * 為什麼是 .js 不 .ts:
 *   - vite-plugin-pwa 用 `workbox.importScripts` 在 build 後把這個檔案
 *     additionalScripts 進 sw.js;importScripts 是 SW 標準 API,只吃 .js
 *   - 純運行時邏輯,沒有 type 需求,直接寫 ES5/ES2017 兼容語法
 *
 * 為什麼用 importScripts 而非 injectManifest:
 *   - 現有 workbox(generateSW)caching 邏輯都還在用,改 injectManifest 要重寫
 *   - importScripts 路徑:vite-plugin-pwa 把 public/ 內容拷貝到 dist 根,
 *     SW 從 /push-handler.js import 是同源,permission OK
 *
 * 收到 push:
 *   payload 預期格式:
 *     { title, message, click_url, tag, notification_id, badge?, image? }
 *   tag 機制:同 tag 會覆蓋舊通知,避免轟炸
 */

/* global self, clients */

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { title: '神獸股市', message: event.data.text?.() ?? '' };
  }

  const title = payload.title || '神獸股市';
  const options = {
    body: payload.message || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-192.png',
    image: payload.image || undefined,
    data: {
      url: payload.click_url || '/',
      notification_id: payload.notification_id
    },
    actions: Array.isArray(payload.actions) ? payload.actions : [],
    vibrate: [200, 100, 200],
    tag: payload.tag || 'stockgame-default',
    renotify: payload.renotify === true,
    requireInteraction: false
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = (data.url || '/').toString();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // 已開啟的 client → focus + 傳訊息給頁面做路由
      for (const client of windowClients) {
        try {
          if ('focus' in client) {
            client.postMessage({
              type: 'notification_click',
              url: targetUrl,
              notificationId: data.notification_id
            });
            return client.focus();
          }
        } catch (e) {
          // some browsers throw on cross-origin client; ignore
        }
      }
      // 沒開 → 開新視窗(帶 hash 路由)
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
