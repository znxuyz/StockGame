import { useState } from 'react';
import Modal from './Modal';
import {
  signInWithApple,
  signInWithGoogle,
  signInWithPassword,
  signUp,
  resetPassword
} from '@/lib/auth';

interface SignInModalProps {
  open: boolean;
  onClose: () => void;
}

type Mode = 'signin' | 'signup' | 'reset';

const MIN_PASSWORD = 6;

/**
 * 登入彈窗(Apple / Google / Email+密碼 三選一)。
 *
 * 流程:
 *  - Apple / Google → OAuth redirect。Supabase-js 跳到第三方登入頁,
 *    完成後跳回 origin,supabase.ts 的 detectSessionInUrl 會自動換 session
 *  - Email + 密碼 → signInWithPassword,error 直接顯示
 *  - 註冊 → signUp,Supabase 預設關 email confirmation 才能即註即用
 *    (Dashboard → Authentication → Email → "Confirm email" 關掉)
 *  - 忘記密碼 → 寄一封 magic link 重設
 *
 * Magic Link 主登入已淘汰,但 sendMagicLink 函式留著(`@deprecated`)。
 */
export default function SignInModal({ open, onClose }: SignInModalProps) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 重設密碼 / 註冊 OK 後顯示「已寄出」狀態 */
  const [info, setInfo] = useState<string | null>(null);

  function clearMessages() {
    setError(null);
    setInfo(null);
  }

  async function handleApple() {
    if (busy) return;
    clearMessages();
    setBusy(true);
    const r = await signInWithApple();
    if (!r.ok) {
      setError(r.error ?? 'Apple 登入失敗');
      setBusy(false);
    }
    // OK → 頁面會被 Supabase 帶走,不用解 busy
  }

  async function handleGoogle() {
    if (busy) return;
    clearMessages();
    setBusy(true);
    const r = await signInWithGoogle();
    if (!r.ok) {
      setError(r.error ?? 'Google 登入失敗');
      setBusy(false);
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    clearMessages();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('請輸入 Email');
      return;
    }

    if (mode === 'reset') {
      setBusy(true);
      const r = await resetPassword(trimmedEmail);
      setBusy(false);
      if (r.ok) {
        setInfo(`已寄出密碼重設連結到 ${trimmedEmail},請到信箱點連結。`);
      } else {
        setError(r.error ?? '寄送失敗,請稍後再試。');
      }
      return;
    }

    if (password.length < MIN_PASSWORD) {
      setError(`密碼至少 ${MIN_PASSWORD} 個字元`);
      return;
    }

    setBusy(true);
    const r =
      mode === 'signup'
        ? await signUp(trimmedEmail, password)
        : await signInWithPassword(trimmedEmail, password);
    setBusy(false);

    if (!r.ok) {
      setError(r.error ?? (mode === 'signup' ? '註冊失敗' : '登入失敗'));
      return;
    }

    if (mode === 'signup') {
      // Supabase 若仍開著 email confirmation,session 不會立刻來,需要點信
      setInfo(`註冊成功!若需確認 email,請到 ${trimmedEmail} 點驗證連結後回來登入。`);
    }
    // signin 成功 → onAuthStateChange 會 fire SIGNED_IN,App.tsx useAuth 收到後關 modal
  }

  function switchMode(next: Mode) {
    setMode(next);
    clearMessages();
    if (next === 'reset') setPassword('');
  }

  function handleClose() {
    setMode('signin');
    setEmail('');
    setPassword('');
    setBusy(false);
    clearMessages();
    onClose();
  }

  const submitLabel =
    mode === 'signup' ? '註冊' : mode === 'reset' ? '寄出重設連結' : '登入';

  return (
    <Modal open={open} onClose={handleClose} title="雲端同步登入">
      <div className="space-y-4 text-sm">
        {/* ── 第三方登入 ── */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleApple}
            disabled={busy}
            className="apple-signin-btn w-full"
            aria-label="使用 Apple 登入"
          >
            <AppleLogo />
            <span>使用 Apple 登入</span>
          </button>
          <button
            type="button"
            onClick={handleGoogle}
            disabled={busy}
            className="google-signin-btn w-full"
            aria-label="使用 Google 登入"
          >
            <GoogleLogo />
            <span>使用 Google 登入</span>
          </button>
        </div>

        {/* ── 分隔線 ── */}
        <div className="flex items-center gap-3 text-[11px] text-gray-400">
          <div className="flex-1 h-px bg-gray-300/60" />
          <span>或</span>
          <div className="flex-1 h-px bg-gray-300/60" />
        </div>

        {/* ── Email + 密碼 ── */}
        <form onSubmit={handleEmailSubmit} className="space-y-2.5">
          <label className="block">
            <span className="text-xs text-gray-600 mb-1 block">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              inputMode="email"
              className="input-field w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-amber-300 focus:outline-none"
              disabled={busy}
            />
          </label>

          {mode !== 'reset' && (
            <label className="block">
              <span className="text-xs text-gray-600 mb-1 block">
                密碼 <span className="text-gray-400">(至少 {MIN_PASSWORD} 字)</span>
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                minLength={MIN_PASSWORD}
                className="input-field w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-amber-300 focus:outline-none"
                disabled={busy}
              />
            </label>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
              {error}
            </p>
          )}
          {info && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">
              {info}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-amber-500 text-white font-bold py-2.5 rounded-lg active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100"
          >
            {busy ? '處理中⋯' : submitLabel}
          </button>
        </form>

        {/* ── 模式切換 ── */}
        <div className="flex justify-between items-center text-xs text-gray-600">
          {mode === 'signin' && (
            <>
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="text-amber-600 underline"
              >
                還沒有帳號?註冊
              </button>
              <button
                type="button"
                onClick={() => switchMode('reset')}
                className="text-gray-500 underline"
              >
                忘記密碼?
              </button>
            </>
          )}
          {mode === 'signup' && (
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="text-amber-600 underline"
            >
              已有帳號?登入
            </button>
          )}
          {mode === 'reset' && (
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="text-amber-600 underline"
            >
              ← 回到登入
            </button>
          )}
        </div>

        <p className="text-[11px] text-gray-500 leading-relaxed pt-1">
          你的投資資料只有你能看(Row Level Security)。
          不分享、不廣告、不追蹤。隨時可以登出。
        </p>
      </div>
    </Modal>
  );
}

/** Apple 登入按鈕的 logo(白色 SVG)— Apple HIG 要求 */
function AppleLogo() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

/** Google 多色 G logo */
function GoogleLogo() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 48 48"
      aria-hidden="true"
    >
      <path
        fill="#FFC107"
        d="M43.61 20.08H42V20H24v8h11.3c-1.65 4.66-6.08 8-11.3 8-6.63 0-12-5.37-12-12s5.37-12 12-12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66C34.05 6.05 29.27 4 24 4 12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20c0-1.34-.14-2.65-.39-3.92z"
      />
      <path
        fill="#FF3D00"
        d="m6.31 14.69 6.57 4.82C14.66 15.11 18.96 12 24 12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66C34.05 6.05 29.27 4 24 4 16.32 4 9.66 8.34 6.31 14.69z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.17 0 9.86-1.98 13.41-5.2l-6.19-5.24A11.91 11.91 0 0 1 24 36c-5.2 0-9.61-3.31-11.28-7.94l-6.52 5.02C9.5 39.56 16.23 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.61 20.08H42V20H24v8h11.3a12.04 12.04 0 0 1-4.09 5.56h.01l6.19 5.24C36.97 39.21 44 34 44 24c0-1.34-.14-2.65-.39-3.92z"
      />
    </svg>
  );
}
