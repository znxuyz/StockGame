import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isCloudConfigured } from './supabase';

/**
 * Auth state hook。
 *
 *  - 初始化時 getSession()(讀 localStorage 內的 token,如果有就還原 session)
 *  - 訂閱 onAuthStateChange:點 magic link 跳回後,supabase-js 會自動偵測
 *    URL hash 內的 access_token 並 fire SIGNED_IN event
 *  - 沒設雲端環境變數時直接回 { session: null, loading: false }
 */
export function useAuth(): {
  session: Session | null;
  loading: boolean;
} {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isCloudConfigured);

  useEffect(() => {
    if (!isCloudConfigured) return;

    let cancelled = false;

    supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.warn('[auth] getSession error:', error);
      }
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}

/**
 * 寄出 magic link 到指定 email。回傳 { ok, error }。
 * 預設 emailRedirectTo = window.location.origin,點完連結會跳回現在的網址。
 */
export async function sendMagicLink(email: string): Promise<{ ok: boolean; error?: string }> {
  if (!isCloudConfigured) {
    return { ok: false, error: '雲端同步未啟用' };
  }
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin,
      // 不開放新建使用者?暫時開,有需要再鎖
      shouldCreateUser: true
    }
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function signOut(): Promise<void> {
  if (!isCloudConfigured) return;
  await supabase.auth.signOut();
}
