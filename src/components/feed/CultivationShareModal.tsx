import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Modal from '../Modal';
import { db } from '@/db';
import {
  detectSensitiveWords,
  publishCultivationShare,
  type DetectedSensitive
} from '@/services';
import { getCreature } from '@/data/creatures';

interface CultivationShareModalProps {
  open: boolean;
  onClose: () => void;
  onActionComplete?: (message: string) => void;
  /** 發布成功 → 通知 parent 重整 feed list */
  onPosted?: () => void;
}

const CONTENT_MAX = 500;

/**
 * 階段 5D:神獸修仙分享(手動發文)彈窗。
 *
 *  - 500 字內容
 *  - 標籤神獸:從「曾召喚過」的列表選(已 retired 也可)
 *  - 標籤股票:純文字輸入(8 個格子)+ Enter 新增
 *  - 敏感詞偵測在 onChange,命中時下方顯示警告 banner(不阻擋發布)
 *  - 底部固定免責聲明
 */
export default function CultivationShareModal({
  open,
  onClose,
  onActionComplete,
  onPosted
}: CultivationShareModalProps) {
  const allPets = useLiveQuery(() => db.pets.toArray(), [], []);

  const [content, setContent] = useState('');
  const [tagCreatures, setTagCreatures] = useState<string[]>([]);
  const [tagStocks, setTagStocks] = useState<string[]>([]);
  const [stockInput, setStockInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setContent('');
      setTagCreatures([]);
      setTagStocks([]);
      setStockInput('');
      setError(null);
    }
  }, [open]);

  const summonedIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of allPets) set.add(p.speciesId);
    return Array.from(set).sort();
  }, [allPets]);

  const sensitive: DetectedSensitive = useMemo(
    () => detectSensitiveWords(content),
    [content]
  );

  function toggleCreature(id: string) {
    setTagCreatures((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, 10)
    );
  }

  function addStock() {
    const sym = stockInput.trim();
    if (sym.length === 0) return;
    if (tagStocks.includes(sym)) {
      setStockInput('');
      return;
    }
    setTagStocks((prev) => [...prev, sym].slice(0, 10));
    setStockInput('');
  }

  function removeStock(sym: string) {
    setTagStocks((prev) => prev.filter((x) => x !== sym));
  }

  async function handlePublish() {
    if (busy) return;
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      setError('內容不能空白');
      return;
    }
    if (trimmed.length > CONTENT_MAX) {
      setError(`內容最多 ${CONTENT_MAX} 字`);
      return;
    }
    setBusy(true);
    setError(null);
    const r = await publishCultivationShare({
      content: trimmed,
      taggedCreatures: tagCreatures,
      taggedStocks: tagStocks
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onActionComplete?.('📝 修仙分享已發布');
    onPosted?.();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="📝 神獸修仙分享">
      <div className="space-y-3">
        <p className="text-xs text-gray-600">寫下你的修仙感悟,分享給好友。</p>

        {/* 內容 */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            內容
            <span className="float-right text-[11px] text-gray-400">
              {content.length} / {CONTENT_MAX}
            </span>
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, CONTENT_MAX))}
            className="input-field min-h-[120px] resize-none text-sm"
            placeholder="例:今天觀朱雀涅槃的火光,悟到了一念之差即是輪迴…"
            maxLength={CONTENT_MAX}
          />
        </div>

        {/* 敏感詞警告 */}
        {sensitive.hits.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-lg p-2 space-y-1">
            <p className="text-xs font-bold text-amber-800">
              ⚠️ 偵測到投資建議用語
            </p>
            <p className="text-[11px] text-amber-700 leading-relaxed">
              您的內容包含:
              {sensitive.hits.map((w, i) => (
                <span key={w}>
                  「<b>{w}</b>」{i < sensitive.hits.length - 1 ? '、' : ''}
                </span>
              ))}
            </p>
            <p className="text-[11px] text-amber-700 leading-relaxed">
              本平台不建議使用投資建議用語,請改用「召喚」「修為」「突破」等遊戲詞彙。
              <br />
              (不會阻擋發布,但會留紀錄)
            </p>
          </div>
        )}

        {/* 標籤神獸 */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            標籤神獸(選填,可選多隻)
          </label>
          {summonedIds.length === 0 ? (
            <p className="text-[11px] text-gray-400 italic">尚未召喚過任何神獸</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {summonedIds.map((id) => {
                const c = getCreature(id);
                const isSel = tagCreatures.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleCreature(id)}
                    className={`px-2 py-0.5 rounded-full text-[11px] border ${
                      isSel
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-white/60 text-gray-700 border-gray-300'
                    }`}
                  >
                    {isSel ? '✓ ' : '# '}
                    {c?.name ?? id}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 標籤股票 */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            標籤股票(選填,純顯示)
          </label>
          <div className="flex gap-1 mb-1">
            <input
              type="text"
              value={stockInput}
              onChange={(e) => setStockInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addStock();
                }
              }}
              className="input-field flex-1 text-xs py-1.5"
              placeholder="輸入代號或名稱"
              maxLength={20}
            />
            <button
              type="button"
              onClick={addStock}
              className="shrink-0 px-3 py-1.5 bg-amber-100 text-amber-700 border border-amber-200 rounded-md text-xs font-bold"
            >
              新增
            </button>
          </div>
          {tagStocks.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tagStocks.map((sym) => (
                <span
                  key={sym}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[11px] border border-blue-200"
                >
                  # {sym}
                  <button
                    type="button"
                    onClick={() => removeStock(sym)}
                    className="text-blue-500 hover:text-blue-700"
                    aria-label={`移除 ${sym}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-2 leading-relaxed">
          ⚠️ 法規提醒:此功能為遊戲體驗分享,請避免投資建議用語。發布後內容會加上免責聲明。
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handlePublish}
          disabled={busy || content.trim().length === 0}
          className="w-full py-3 bg-emerald-500 text-white rounded-lg font-bold disabled:opacity-50 active:scale-[0.99] transition-transform"
        >
          {busy ? '發布中⋯' : '發布修仙分享'}
        </button>
      </div>
    </Modal>
  );
}
