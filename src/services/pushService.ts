/**
 * 階段 5F:Web Push 訂閱(client 端)。
 *
 *  - isSupported:檢查瀏覽器 + PWA 安裝狀態(iOS 必須 standalone 才能用 push)
 *  - requestPermission:Notification.requestPermission
 *  - subscribe:registration.pushManager.subscribe + 寫 push_subscriptions
 *  - unsubscribe:撤銷 SW 訂閱 + 標記 is_active=false
 *  - 沒設 VITE_VAPID_PUBLIC_KEY env 時 isSupported 回 false(graceful degradation)
 */

import { supabase, isCloudConfigured } from '@/lib/supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushSupportReason =
  | 'ok'
  | 'no_vapid_key'
  | 'no_service_worker'
  | 'no_push_manager'
  | 'no_notification'
  | 'need_pwa_install'; // iOS only

export interface PushSupportResult {
  supported: boolean;
  reason: PushSupportReason;
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  // iPadOS 13+ 在 macOS-like UA 中,改用 maxTouchPoints 偵測
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS Safari PWA
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((navigator as any).standalone === true) return true;
  // Android Chrome / 桌機 Chrome PWA
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  return false;
}

export function isPushSupported(): PushSupportResult {
  if (!VAPID_PUBLIC_KEY) return { supported: false, reason: 'no_vapid_key' };
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator))
    return { supported: false, reason: 'no_service_worker' };
  if (typeof window === 'undefined' || !('PushManager' in window))
    return { supported: false, reason: 'no_push_manager' };
  if (typeof Notification === 'undefined')
    return { supported: false, reason: 'no_notification' };
  // iOS 16.4+ 才支援 Web Push,且 PWA 必須加入主畫面
  if (isIOS() && !isStandalone()) {
    return { supported: false, reason: 'need_pwa_install' };
  }
  return { supported: true, reason: 'ok' };
}

/** 把 VAPID public key base64url → Uint8Array(Web Push API 需要) */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushPermission = 'granted' | 'denied' | 'default';

export async function requestNotificationPermission(): Promise<PushPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  try {
    const p = await Notification.requestPermission();
    return p as PushPermission;
  } catch {
    return 'denied';
  }
}

/**
 * 訂閱 Push + 寫進 Supabase。
 *  - 已訂閱(同一個 endpoint)→ upsert 重設 is_active=true / last_used_at
 *  - 失敗回 { ok:false, reason }
 */
export async function subscribePush(): Promise<
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'permission_denied' | 'not_signed_in' | 'failed'; error?: string }
> {
  const sup = isPushSupported();
  if (!sup.supported) return { ok: false, reason: 'unsupported' };
  if (!isCloudConfigured) return { ok: false, reason: 'not_signed_in' };
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return { ok: false, reason: 'not_signed_in' };

  const permission = await requestNotificationPermission();
  if (permission !== 'granted') return { ok: false, reason: 'permission_denied' };

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      // applicationServerKey 接受 BufferSource(ArrayBufferView 或 ArrayBuffer);
      // Uint8Array<ArrayBufferLike> 在新 TS 下不直接 assignable 給 ArrayBuffer 視圖,
      // 用 .buffer 拿底層 ArrayBuffer 餵進去
      const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY!).buffer as ArrayBuffer;
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key
      });
    }
    const json = subscription.toJSON();
    const endpoint = json.endpoint ?? subscription.endpoint;
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return { ok: false, reason: 'failed', error: 'missing keys' };
    }
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint,
        p256dh_key: p256dh,
        auth_key: auth,
        user_agent: navigator.userAgent.slice(0, 200),
        is_active: true,
        last_used_at: new Date().toISOString()
      },
      { onConflict: 'user_id,endpoint' }
    );
    if (error) return { ok: false, reason: 'failed', error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'failed', error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 取消訂閱 Push:撤銷 SW 訂閱 + 標記 cloud row is_active=false。
 *  - 不刪 row(保留歷史),只標 inactive
 */
export async function unsubscribePush(): Promise<{ ok: boolean }> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return { ok: false };
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      if (isCloudConfigured) {
        await supabase
          .from('push_subscriptions')
          .update({ is_active: false })
          .eq('endpoint', subscription.endpoint);
      }
    }
    return { ok: true };
  } catch (e) {
    console.warn('[push] unsubscribe failed:', e);
    return { ok: false };
  }
}

/** 取得目前 SW 訂閱(用來顯示「目前已訂閱」狀態) */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}
