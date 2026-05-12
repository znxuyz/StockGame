import { useEffect, useState } from 'react';
import { ProfileAvatar } from '../ProfileEditModal';
import { addComment, deleteComment, getComments, type CommentWithAuthor } from '@/services';
import { relativeTime } from '@/utils';

interface FeedCommentsProps {
  eventId: number;
  myUserId: string | null;
  /** 評論數變動 → 通知 parent 卡片更新 badge */
  onCountChange?: (count: number) => void;
}

const MAX_LEN = 200;

/**
 * 階段 5D:動態評論區。
 *
 *  - 列出 event 所有未刪除評論
 *  - 自己的可刪除(軟刪除 is_deleted=true)
 *  - 輸入框 200 字限制
 *  - 樂觀更新:新增評論立刻 push 進 list,失敗 rollback
 */
export default function FeedComments({ eventId, myUserId, onCountChange }: FeedCommentsProps) {
  const [comments, setComments] = useState<CommentWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    const list = await getComments(eventId);
    setComments(list);
    setLoading(false);
    onCountChange?.(list.length);
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function handleSubmit() {
    if (submitting) return;
    const content = input.trim();
    if (content.length === 0) return;
    if (content.length > MAX_LEN) {
      setError(`評論最多 ${MAX_LEN} 字`);
      return;
    }
    setSubmitting(true);
    setError(null);
    const r = await addComment(eventId, content);
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setInput('');
    await reload();
  }

  async function handleDelete(commentId: number) {
    if (!confirm('確定要刪除這則評論?')) return;
    const r = await deleteComment(commentId);
    if (!r.ok) {
      alert(`刪除失敗:${r.error ?? ''}`);
      return;
    }
    await reload();
  }

  return (
    <div className="mt-1 pt-2 border-t border-gray-100 space-y-2">
      {loading ? (
        <p className="text-[11px] text-gray-400 italic">載入評論⋯</p>
      ) : comments.length === 0 ? (
        <p className="text-[11px] text-gray-400 italic">尚無評論,搶第一個</p>
      ) : (
        <div className="space-y-1.5">
          {comments.map((c) => {
            const ms = new Date(c.createdAt).getTime();
            const rel = Number.isFinite(ms) ? relativeTime(ms) : '';
            const isMine = myUserId === c.userId;
            return (
              <div key={c.id} className="flex items-start gap-2 text-[11px]">
                <ProfileAvatar avatarCreatureId={c.author?.avatarCreatureId ?? null} size={24} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1">
                    <span className="font-bold text-gray-700 truncate">
                      {c.author?.nickname ?? '修仙者'}
                    </span>
                    <span className="text-gray-400 text-[10px] shrink-0">{rel}</span>
                  </div>
                  <p className="text-gray-700 break-words leading-relaxed">{c.content}</p>
                </div>
                {isMine && (
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
                    className="shrink-0 text-[10px] text-red-500"
                    aria-label="刪除評論"
                  >
                    刪除
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 輸入框 */}
      <div className="flex items-center gap-2 pt-1">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, MAX_LEN))}
          maxLength={MAX_LEN}
          className="input-field flex-1 text-xs py-1.5"
          placeholder="寫評論⋯"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSubmit();
            }
          }}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || input.trim().length === 0}
          className="shrink-0 px-3 py-1.5 bg-amber-500 text-white rounded-md text-xs font-bold disabled:opacity-50"
        >
          {submitting ? '⋯' : '送'}
        </button>
      </div>
      {error && (
        <p className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded p-1.5">
          {error}
        </p>
      )}
      <p className="text-right text-[10px] text-gray-400">
        {input.length} / {MAX_LEN}
      </p>
    </div>
  );
}
