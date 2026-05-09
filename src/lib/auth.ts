import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isCloudConfigured } from './supabase';

/**
 * Auth state hook。
 *
 *  - 初始化時 getSession()(讀 localStorage 內的 token,如果有就還原 session)
 *  - 訂閱 onAuthStateChange:OAuth callback / magic link 跳回後,
 *    supabase-js 會自動偵測 URL 內的 token / code 並 fire SIGNED_IN
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

type AuthResult = { ok: boolean; error?: string };

/**
 * Sign in with Apple(主推 iOS)。
 *  - Supabase Dashboard → Authentication → Providers → Apple 必須啟用
 *  - Apple Developer Service ID + Sign in with Apple key 也要先設好
 *  - redirectTo 必須在 Supabase 的 Redirect URLs allowlist 內
 *  - PWA 內點下去通常會跳 Apple 登入頁(Face ID / Touch ID)→ 完成回到 origin
 */
export async function signInWithApple(): Promise<AuthResult> {
  if (!isCloudConfigured) return { ok: false, error: '雲端同步未啟用' };
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: {
      redirectTo: window.location.origin,
      scopes: 'email name'
    }
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Sign in with Google。
 *  - Supabase Dashboard → Authentication → Providers → Google 必須啟用
 *  - Google Cloud Console OAuth Client ID + Secret 要設好
 */
export async function signInWithGoogle(): Promise<AuthResult> {
  if (!isCloudConfigured) return { ok: false, error: '雲端同步未啟用' };
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin
    }
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Email + 密碼登入。錯誤回 { ok: false, error } */
export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  if (!isCloudConfigured) return { ok: false, error: '雲端同步未啟用' };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Email + 密碼註冊新帳號。
 *  - Supabase 預設 email confirmation 開啟 → 用戶要點信中連結才能登入
 *  - Dashboard → Authentication → Email → 關掉 "Confirm email" 才能註冊即用
 *  - 同 email 之前用 Magic Link 登過 → Supabase 會合併成同個 user_id,
 *    原本的修為 / 神獸資料都保留
 */
export async function signUp(email: string, password: string): Promise<AuthResult> {
  if (!isCloudConfigured) return { ok: false, error: '雲端同步未啟用' };
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin
    }
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * 寄密碼重設信。
 *  - 寄一封 Magic Link 到 email,點完跳回 origin 並 SIGNED_IN
 *  - 登入後在 SettingsModal 改密碼(updateUser({ password }))
 *  - 沿用原本 Magic Link 流程,只是用途改成「忘記密碼救援」
 */
export async function resetPassword(email: string): Promise<AuthResult> {
  if (!isCloudConfigured) return { ok: false, error: '雲端同步未啟用' };
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * @deprecated 改用 signInWithPassword / signInWithApple / signInWithGoogle。
 * 留著只是因為若使用者在 Supabase Dashboard 仍開著 OTP 也能 fallback。
 * 「忘記密碼」改用 resetPassword(也是 magic link,但語義更清楚)。
 */
export async function sendMagicLink(email: string): Promise<AuthResult> {
  if (!isCloudConfigured) return { ok: false, error: '雲端同步未啟用' };
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin,
      shouldCreateUser: true
    }
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signOut(): Promise<void> {
  if (!isCloudConfigured) return;
  await supabase.auth.signOut();
}
