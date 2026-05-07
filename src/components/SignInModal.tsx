import { useState } from 'react';
import Modal from './Modal';
import { sendMagicLink } from '@/lib/auth';

interface SignInModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Magic link 登入 modal。
 *  - 使用者輸入 email → 按寄出 → Supabase 寄一封含 token 的連結
 *  - 點信中連結 → 跳回 app(URL hash 帶 access_token)→ supabase-js
 *    自動偵測並 fire SIGNED_IN,App.tsx 的 useAuth() 會收到新 session
 *  - 沒密碼,信箱即身分(換手機重來只要再寄一次連結)
 */
export default function SignInModal({ open, onClose }: SignInModalProps) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || sending) return;
    setError(null);
    setSending(true);
    const r = await sendMagicLink(email.trim());
    setSending(false);
    if (r.ok) {
      setSentTo(email.trim());
    } else {
      setError(r.error ?? '寄送失敗,請稍後再試。');
    }
  }

  function reset() {
    setEmail('');
    setSentTo(null);
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} variant="center" title="雲端同步登入">
      <div className="p-4 space-y-3 text-sm">
        {sentTo ? (
          <div className="space-y-3">
            <div className="text-center py-3">
              <div className="text-4xl mb-2">📬</div>
              <p className="font-bold text-gray-800">已寄出登入連結</p>
              <p className="text-xs text-gray-600 mt-1 break-all">{sentTo}</p>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              到信箱點連結就會自動回到這個頁面登入。可以關掉這個視窗繼續用 app,
              點完連結後資料會自動同步。
            </p>
            <p className="text-xs text-gray-500">
              沒收到?檢查垃圾信件夾;1 分鐘後可
              <button
                type="button"
                onClick={reset}
                className="text-amber-600 underline ml-1"
              >
                換信箱重寄
              </button>
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-gray-600 leading-relaxed">
              輸入信箱,我們寄一個 <b>一次性連結</b> 給你,點一下即登入。
              <br />
              不需要密碼。登入後資料自動同步,換手機也能無縫接續。
            </p>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              inputMode="email"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-300 focus:outline-none"
              disabled={sending}
            />
            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={sending || !email.trim()}
              className="w-full bg-amber-500 text-white font-bold py-2.5 rounded-lg active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100"
            >
              {sending ? '寄送中⋯' : '寄出登入連結'}
            </button>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              你的投資資料只有你能看(Row Level Security)。
              不分享、不廣告、不追蹤。隨時可以登出 / 刪帳號。
            </p>
          </form>
        )}
      </div>
    </Modal>
  );
}
