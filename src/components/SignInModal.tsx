import { useState } from 'react';
import Modal from './Modal';
import {
  signInWithApple,
  signInWithGoogle,
  signInWithPassword,
  signUp,
  resetPassword,
  mapAuthError
} from '@/lib/auth';

interface SignInModalProps {
  open: boolean;
  onClose: () => void;
}

/** 'signin' = 主畫面(email + 密碼 + 登入/註冊雙鈕);'reset' = 重設密碼(只剩 email) */
type Mode = 'signin' | 'reset';

const MIN_PASSWORD = 6;
const RECOMMENDED_PASSWORD = 8;

/**
 * 第三方登入 feature flag。
 * Supabase 那邊兩個 provider 還沒申請好憑證,前端先暗藏不渲染避免使用者點下去吃錯誤。
 * 之後在 .env / Cloudflare env var 設成 true 即可顯示按鈕。
 */
const SHOW_APPLE = import.meta.env.VITE_ENABLE_APPLE_LOGIN === 'true';
const SHOW_GOOGLE = import.meta.env.VITE_ENABLE_GOOGLE_LOGIN === 'true';

/**
 * 登入彈窗。
 *
 * 預設只顯示 Email + 密碼:
 *  - 同表單兩顆按鈕(登入 / 立刻註冊),不需 mode 切換,玩家直覺
 *  - 「忘記密碼?點此重設」→ 切到 reset mode 只剩 email 輸入
 *  - 密碼長度 < 6 阻擋註冊;6-7 顯示「建議使用 8 字以上」軟提示但允許
 *  - 錯誤訊息用 mapAuthError 翻中文(Supabase 原文是英文)
 *
 * 第三方登入:
 *  - Apple / Google 按鈕用 env flag 控制,預設不渲染
 *  - 之後 user 啟用 Supabase provider + 設 VITE_ENABLE_APPLE/GOOGLE_LOGIN=true 自動出現
 *
 * 登入成功:
 *  - Supabase fire SIGNED_IN → useAuth() session 更新
 *  - App.tsx 的 useEffect 偵測 userId + modal === 'signin' → 自動關彈窗
 *  - cloud sync useEffect 跑 pullNow + 重抽 daily/weekly 任務(不是這裡的責任)
 */
export default function SignInModal({ open, onClose }: SignInModalProps) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  /** 哪個 intent 正在 busy(讓對應按鈕顯示 spinner 文字) */
  const [busyIntent, setBusyIntent] = useState<'signin' | 'signup' | 'reset' | 'apple' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 重設密碼 / 註冊待驗證等友善提示 */
  const [info, setInfo] = useState<string | null>(null);

  const showThirdParty = SHOW_APPLE || SHOW_GOOGLE;

  function clearMessages() {
    setError(null);
    setInfo(null);
  }

  async function handleApple() {
    if (busy) return;
    clearMessages();
    setBusy(true);
    setBusyIntent('apple');
    const r = await signInWithApple();
    if (!r.ok) {
      setError(mapAuthError(r.error));
      setBusy(false);
      setBusyIntent(null);
    }
  }

  async function handleGoogle() {
    if (busy) return;
    clearMessages();
    setBusy(true);
    setBusyIntent('google');
    const r = await signInWithGoogle();
    if (!r.ok) {
      setError(mapAuthError(r.error));
      setBusy(false);
      setBusyIntent(null);
    }
  }

  /** 登入 / 立刻註冊 共用提交,intent 由 caller 給 */
  async function submitEmailPassword(intent: 'signin' | 'signup') {
    if (busy) return;
    clearMessages();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('請輸入 Email');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`密碼至少 ${MIN_PASSWORD} 個字元`);
      return;
    }

    setBusy(true);
    setBusyIntent(intent);
    const r =
      intent === 'signup'
        ? await signUp(trimmedEmail, password)
        : await signInWithPassword(trimmedEmail, password);
    setBusy(false);
    setBusyIntent(null);

    if (!r.ok) {
      setError(mapAuthError(r.error));
      return;
    }

    if (intent === 'signup') {
      // Confirm email 關掉的話 Supabase 會直接回 session,onAuthStateChange 自動關彈窗
      // 沒關的話 session 為 null,顯示提示要使用者點驗證信
      setInfo(
        `註冊成功!若你的後台仍要求 email 驗證,請到 ${trimmedEmail} 點驗證連結後再登入。`
      );
    }
  }

  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    clearMessages();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('請輸入 Email');
      return;
    }
    setBusy(true);
    setBusyIntent('reset');
    const r = await resetPassword(trimmedEmail);
    setBusy(false);
    setBusyIntent(null);
    if (r.ok) {
      setInfo(`重設連結已寄出,請到 ${trimmedEmail} 點信中連結後設定新密碼。`);
    } else {
      setError(mapAuthError(r.error));
    }
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
    setShowPassword(false);
    setBusy(false);
    clearMessages();
    onClose();
  }

  // ── reset mode:單獨畫面,只要 email 輸入框 + 寄送按鈕 ──
  if (mode === 'reset') {
    return (
      <Modal open={open} onClose={handleClose} title="重設密碼">
        <form onSubmit={handleResetSubmit} className="space-y-3 text-sm">
          <p className="text-gray-600 leading-relaxed">
            輸入註冊用的 Email,我們寄一封重設連結給你。
            點連結回來 app 後可設定新密碼。
          </p>
          <label className="block">
            <span className="text-xs text-gray-600 mb-1 block">Email</span>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              inputMode="email"
              className="input-field w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-amber-300 focus:outline-none"
              disabled={busy}
            />
          </label>
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
            {busyIntent === 'reset' ? '寄送中⋯' : '寄出重設連結'}
          </button>
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className="w-full text-xs text-amber-600 underline py-1"
            disabled={busy}
          >
            ← 回到登入
          </button>
        </form>
      </Modal>
    );
  }

  // ── 主畫面:Email + 密碼 + 登入/註冊雙按鈕 ──
  const passwordHint =
    password.length === 0
      ? null
      : password.length < MIN_PASSWORD
        ? { text: `密碼至少 ${MIN_PASSWORD} 個字元`, color: 'text-red-600' }
        : password.length < RECOMMENDED_PASSWORD
          ? { text: '建議使用 8 字以上更安全', color: 'text-amber-600' }
          : null;

  return (
    <Modal open={open} onClose={handleClose} title="登入帳號">
      <div className="space-y-4 text-sm">
        {/* ── 第三方登入(預設藏起來,env flag 開啟才渲染) ── */}
        {showThirdParty && (
          <>
            <div className="space-y-2">
              {SHOW_APPLE && (
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
              )}
              {SHOW_GOOGLE && (
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
              )}
            </div>
            <div className="flex items-center gap-3 text-[11px] text-gray-400">
              <div className="flex-1 h-px bg-gray-300/60" />
              <span>或</span>
              <div className="flex-1 h-px bg-gray-300/60" />
            </div>
          </>
        )}

        {/* ── Email + 密碼 ── */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitEmailPassword('signin');
          }}
          className="space-y-2.5"
        >
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

          <label className="block">
            <span className="text-xs text-gray-600 mb-1 block">
              密碼 <span className="text-gray-400">(至少 {MIN_PASSWORD} 字)</span>
            </span>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                minLength={MIN_PASSWORD}
                className="input-field w-full pl-3 pr-10 py-2 rounded-lg focus:ring-2 focus:ring-amber-300 focus:outline-none"
                disabled={busy}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-700"
                aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            {passwordHint && (
              <p className={`text-[11px] mt-1 ${passwordHint.color}`}>{passwordHint.text}</p>
            )}
          </label>

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
            {busyIntent === 'signin' ? '登入中⋯' : '登入'}
          </button>
        </form>

        {/* ── 還沒帳號?立刻註冊 ── */}
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-[11px] text-gray-400">
            <div className="flex-1 h-px bg-gray-300/60" />
            <span>還沒帳號?</span>
            <div className="flex-1 h-px bg-gray-300/60" />
          </div>
          <button
            type="button"
            onClick={() => submitEmailPassword('signup')}
            disabled={busy}
            className="w-full border border-amber-500 text-amber-600 font-bold py-2.5 rounded-lg active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100 bg-white/40"
          >
            {busyIntent === 'signup' ? '註冊中⋯' : '立刻註冊'}
          </button>
        </div>

        {/* ── 忘記密碼 ── */}
        <div className="text-center pt-1">
          <button
            type="button"
            onClick={() => switchMode('reset')}
            className="text-xs text-gray-500 underline"
          >
            忘記密碼?點此重設
          </button>
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
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

/** Google 多色 G logo */
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
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

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
