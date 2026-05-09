import { useEffect, useState } from 'react';
import Modal from './Modal';
import { supabase, isCloudConfigured } from '@/lib/supabase';
import { updatePassword, signOut, mapAuthError } from '@/lib/auth';

const MIN_PASSWORD = 6;
const RECOMMENDED_PASSWORD = 8;

/**
 * 「重設密碼」回 app 後的設定新密碼彈窗。
 *
 * 流程:
 *  1. 使用者在 SignInModal 點「忘記密碼?」→ 寄 magic link 到 email
 *  2. 點信中連結 → 跳回 origin → supabase-js 偵測 token → fire
 *     `PASSWORD_RECOVERY` 事件並建暫時 session
 *  3. 這個元件訂閱 onAuthStateChange,聽到 PASSWORD_RECOVERY 自動跳出
 *  4. 用戶輸入新密碼兩次 → updateUser({ password }) → 顯示成功 + 自動關閉
 *  5. 取消 / 關閉 → signOut(把暫時 session 清掉,讓使用者用新密碼正常登入)
 *
 * 跟 SignInModal 完全獨立,因為 PASSWORD_RECOVERY 可能在用戶沒開
 * SignInModal 的情況下抵達(關閉 SignInModal、收信、點連結 → 跳回 app)。
 */
export default function PasswordRecoveryModal() {
  const [open, setOpen] = useState(false);
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!isCloudConfigured) return;
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setOpen(true);
      }
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  function reset() {
    setPw1('');
    setPw2('');
    setError(null);
    setInfo(null);
    setBusy(false);
  }

  async function handleClose() {
    // 沒改完密碼直接關 → 把暫時 recovery session 清掉,
    // 不然下次打開 app 還是 SIGNED_IN 狀態,但密碼沒改
    if (!info) {
      await signOut();
    }
    reset();
    setOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);

    if (pw1.length < MIN_PASSWORD) {
      setError(`密碼至少 ${MIN_PASSWORD} 個字元`);
      return;
    }
    if (pw1 !== pw2) {
      setError('兩次輸入的密碼不一致');
      return;
    }

    setBusy(true);
    const r = await updatePassword(pw1);
    setBusy(false);

    if (!r.ok) {
      setError(mapAuthError(r.error));
      return;
    }
    setInfo('密碼已更新!請改用新密碼登入。');
    // 2 秒後自動關閉並登出,讓使用者重新用新密碼進來
    setTimeout(() => {
      signOut().finally(() => {
        reset();
        setOpen(false);
      });
    }, 2000);
  }

  if (!open) return null;

  const pw1Hint =
    pw1.length === 0
      ? null
      : pw1.length < MIN_PASSWORD
        ? { text: `密碼至少 ${MIN_PASSWORD} 個字元`, color: 'text-red-600' }
        : pw1.length < RECOMMENDED_PASSWORD
          ? { text: '建議使用 8 字以上更安全', color: 'text-amber-600' }
          : null;

  return (
    <Modal open={open} onClose={handleClose} title="設定新密碼" hideClose={busy}>
      <form onSubmit={handleSubmit} className="space-y-3 text-sm">
        <p className="text-gray-600 leading-relaxed">
          請輸入新密碼兩次。完成後請改用新密碼登入。
        </p>

        <label className="block">
          <span className="text-xs text-gray-600 mb-1 block">
            新密碼 <span className="text-gray-400">(至少 {MIN_PASSWORD} 字)</span>
          </span>
          <input
            type="password"
            required
            value={pw1}
            onChange={(e) => setPw1(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            className="input-field w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-amber-300 focus:outline-none"
            disabled={busy || !!info}
          />
          {pw1Hint && <p className={`text-[11px] mt-1 ${pw1Hint.color}`}>{pw1Hint.text}</p>}
        </label>

        <label className="block">
          <span className="text-xs text-gray-600 mb-1 block">再次輸入新密碼</span>
          <input
            type="password"
            required
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            className="input-field w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-amber-300 focus:outline-none"
            disabled={busy || !!info}
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

        {!info && (
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-amber-500 text-white font-bold py-2.5 rounded-lg active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100"
          >
            {busy ? '更新中⋯' : '確認更新密碼'}
          </button>
        )}
      </form>
    </Modal>
  );
}
