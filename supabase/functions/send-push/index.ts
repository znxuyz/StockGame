/**
 * 階段 5F:Supabase Edge Function — send-push
 *
 * 統一的「通知 + 推播」入口,由 client `notificationService.notify()` invoke。
 *
 * 流程:
 *   1. 用 service_role client 寫一筆 notifications row(by-pass RLS)
 *   2. 撈 target_user 的 user_privacy_settings,檢查:
 *        - push_enabled 開關
 *        - 單類型開關(notify_friend_request / notify_feed_like / ...)
 *        - 勿擾時間
 *      → 任一不通過 → 只寫站內,不發推播
 *   3. 撈 target_user 的 active push_subscriptions(可多裝置)
 *   4. 並行送 Web Push 到每個 endpoint;404/410 → 標記 is_active=false
 *   5. 都成功 → update notifications.is_pushed=true
 *
 * 部署:
 *   supabase functions deploy send-push
 * Secrets:
 *   supabase secrets set VAPID_PUBLIC_KEY=BNxxx...
 *   supabase secrets set VAPID_PRIVATE_KEY=xxxxx
 *   supabase secrets set VAPID_SUBJECT=mailto:your@email
 *   supabase secrets set SUPABASE_URL=https://xxx.supabase.co
 *   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
 *   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 在 Supabase 預設已注入,通常不必設)
 *
 * Local dev:
 *   supabase functions serve send-push
 */

// @ts-nocheck — Deno runtime,前端 TS lint 別管這隻
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@example.com';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

const admin = createClient(supabaseUrl, serviceRoleKey);

const TYPE_PREF_MAP = {
  friend_request: 'notify_friend_request',
  friend_accepted: 'notify_friend_request',
  feed_like: 'notify_feed_like',
  feed_comment: 'notify_feed_comment',
  loan_received: 'notify_loan',
  loan_returning: 'notify_loan',
  loan_returned: 'notify_loan',
  rank_changed: 'notify_rank',
  achievement: 'notify_achievement',
  system: null
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

function inQuietHours(start: string, end: string): boolean {
  // 'HH:MM:SS' or 'HH:MM' — Postgres time 預設 'HH:MM:SS'
  const toMin = (s: string) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(s);
    return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  };
  const s = toMin(start);
  const e = toMin(end);
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  if (s === e) return false;
  if (s < e) return cur >= s && cur < e;
  return cur >= s || cur < e;
}

function buildClickUrl(type: string, data: Record<string, unknown> | undefined | null): string {
  // 用 URL hash 給前端讀取 — 不需 router 配合,App.tsx mount 時 parse hash 即可路由
  if (!data) data = {};
  const params = new URLSearchParams();
  params.set('notif_type', type);
  if (typeof data.feedEventId === 'number') params.set('feed_id', String(data.feedEventId));
  if (typeof data.loanId === 'number') params.set('loan_id', String(data.loanId));
  if (typeof data.fromUserId === 'string') params.set('from_user', data.fromUserId);
  return `/#${params.toString()}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders() });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: corsHeaders() });
  }

  const {
    target_user_id,
    notification_type,
    title,
    message,
    from_user_id,
    related_data,
    pushable
  } = body;

  if (!target_user_id || !notification_type || !title || !message) {
    return new Response('Missing required fields', { status: 400, headers: corsHeaders() });
  }

  // 1. 寫 notifications row
  const { data: notif, error: insertErr } = await admin
    .from('notifications')
    .insert({
      user_id: target_user_id,
      notification_type,
      title,
      message,
      from_user_id: from_user_id ?? null,
      related_data: related_data ?? {}
    })
    .select('*')
    .single();
  if (insertErr || !notif) {
    return new Response(
      JSON.stringify({ ok: false, error: insertErr?.message ?? 'insert failed' }),
      { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
    );
  }

  // 2. 是否要推播?
  if (!pushable) {
    return new Response(JSON.stringify({ ok: true, pushed: false, notification_id: notif.id }), {
      status: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    });
  }

  // 撈隱私 / 通知偏好
  const { data: privacy } = await admin
    .from('user_privacy_settings')
    .select('*')
    .eq('user_id', target_user_id)
    .maybeSingle();
  if (!privacy?.push_enabled) {
    return new Response(JSON.stringify({ ok: true, pushed: false, reason: 'push_disabled' }), {
      status: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    });
  }
  const prefKey = TYPE_PREF_MAP[notification_type];
  if (prefKey && privacy[prefKey] === false) {
    return new Response(JSON.stringify({ ok: true, pushed: false, reason: 'type_off' }), {
      status: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    });
  }
  if (privacy.quiet_hours_start && privacy.quiet_hours_end) {
    if (inQuietHours(privacy.quiet_hours_start, privacy.quiet_hours_end)) {
      return new Response(JSON.stringify({ ok: true, pushed: false, reason: 'quiet_hours' }), {
        status: 200,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
      });
    }
  }

  // 沒設 VAPID → 站內已寫,推播跳過
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return new Response(
      JSON.stringify({ ok: true, pushed: false, reason: 'no_vapid' }),
      { status: 200, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
    );
  }

  // 3. 撈 active push_subscriptions
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', target_user_id)
    .eq('is_active', true);

  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ ok: true, pushed: false, reason: 'no_subs' }), {
      status: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    });
  }

  // 4. 並行送 Web Push
  const payload = JSON.stringify({
    title,
    message,
    notification_id: notif.id,
    click_url: buildClickUrl(notification_type, related_data),
    tag: `${notification_type}_${notif.id}`
  });

  const results = await Promise.allSettled(
    subs.map((sub: Record<string, unknown>) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh_key, auth: sub.auth_key }
        },
        payload
      )
    )
  );

  // 失敗的訂閱(404 / 410)標記 inactive
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'rejected') {
      const err = r.reason;
      const code = err?.statusCode ?? err?.status;
      if (code === 404 || code === 410) {
        await admin
          .from('push_subscriptions')
          .update({ is_active: false })
          .eq('endpoint', subs[i].endpoint);
      }
    }
  }

  const successCount = results.filter((r) => r.status === 'fulfilled').length;

  // 5. 標記 is_pushed
  if (successCount > 0) {
    await admin.from('notifications').update({ is_pushed: true }).eq('id', notif.id);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      pushed: successCount > 0,
      sent: successCount,
      total: subs.length,
      notification_id: notif.id
    }),
    { status: 200, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
  );
});
