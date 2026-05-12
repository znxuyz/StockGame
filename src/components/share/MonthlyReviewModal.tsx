import { useEffect, useRef, useState } from 'react';
import Modal from '../Modal';
import MonthlyReviewCard from './MonthlyReviewCard';
import { useCultivation } from '@/hooks/useCultivation';
import { useMyProfile } from '@/hooks/useMyProfile';
import { getMonthlyStats, getAvailableMonths } from '@/services/monthlyStatsService';
import { nodeToPng, downloadDataUrl, shareDataUrl } from '@/utils/imageGenerator';
import type { MonthlyStats } from '@/types';

interface MonthlyReviewModalProps {
  open: boolean;
  onClose: () => void;
  /** 起始顯示的月份;不傳預設「上個月」 */
  initialYear?: number;
  initialMonth?: number;
  onActionComplete?: (message: string) => void;
}

const PREVIEW_MAX_WIDTH = 320;
const CARD_W = 1080;
const CARD_H = 1920;

/**
 * 階段 5C:月度戰績卡彈窗。
 *
 *  - 月份 picker(過去 12 個月,isEmpty 月份灰色不可點)
 *  - 渲染 MonthlyReviewCard + save / share / 複製連結
 *  - isEmpty → 顯示「該月還沒玩」placeholder
 */
export default function MonthlyReviewModal({
  open,
  onClose,
  initialYear,
  initialMonth,
  onActionComplete
}: MonthlyReviewModalProps) {
  const { profile } = useMyProfile();
  const cultivation = useCultivation();
  const cardRef = useRef<HTMLDivElement>(null);

  const [showPicker, setShowPicker] = useState(false);
  const [months, setMonths] = useState<{ year: number; month: number; isEmpty: boolean }[]>([]);
  const [year, setYear] = useState<number | null>(initialYear ?? null);
  const [month, setMonth] = useState<number | null>(initialMonth ?? null);
  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // 開啟時:若沒帶 initial,用「上個月」當預設
  useEffect(() => {
    if (!open) return;
    if (initialYear && initialMonth) {
      setYear(initialYear);
      setMonth(initialMonth);
    } else {
      const now = new Date();
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      setYear(d.getFullYear());
      setMonth(d.getMonth() + 1);
    }
    setShowPicker(false);
  }, [open, initialYear, initialMonth]);

  // 拉 stats
  useEffect(() => {
    if (!open || year === null || month === null) return;
    setLoading(true);
    getMonthlyStats(year, month).then((s) => {
      setStats(s);
      setLoading(false);
    });
  }, [open, year, month]);

  // picker 開啟時拉可選月份
  useEffect(() => {
    if (showPicker && months.length === 0) {
      getAvailableMonths(12).then(setMonths);
    }
  }, [showPicker, months.length]);

  async function handleGenerate(action: 'save' | 'share'): Promise<void> {
    if (!cardRef.current || busy || !stats || stats.isEmpty) return;
    setBusy(true);
    try {
      const dataUrl = await nodeToPng(cardRef.current, { width: CARD_W, height: CARD_H });
      if (!dataUrl) {
        onActionComplete?.('⚠️ 繪製失敗,請手動截圖此預覽');
        return;
      }
      const filename = `修煉錄_${stats.year}-${String(stats.month).padStart(2, '0')}.png`;
      if (action === 'save') {
        downloadDataUrl(dataUrl, filename);
        onActionComplete?.('✓ 已儲存到相簿');
      } else {
        const text = `我的 ${stats.year} 年 ${stats.month} 月 神獸股市修煉錄 ✨ 來看看 → stockgame-692.pages.dev`;
        const ok = await shareDataUrl(
          dataUrl,
          filename,
          text,
          'https://stockgame-692.pages.dev'
        );
        if (!ok) {
          downloadDataUrl(dataUrl, filename);
          onActionComplete?.('已下載 PNG');
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText('https://stockgame-692.pages.dev');
      onActionComplete?.('🔗 連結已複製!');
    } catch {
      onActionComplete?.('⚠️ 無法複製到剪貼簿');
    }
  }

  const previewScale = PREVIEW_MAX_WIDTH / CARD_W;

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={year && month ? `📜 ${year} 年 ${month} 月 修煉錄` : '月度回顧'}
    >
      <div className="space-y-4">
        {/* 月份切換鈕 */}
        <button
          type="button"
          onClick={() => setShowPicker((v) => !v)}
          className="w-full flex items-center justify-between py-2 px-3 rounded-lg border border-gray-200 bg-white/40 active:scale-[0.99] transition-transform"
        >
          <span className="text-sm text-gray-700">📅 切換月份</span>
          <span className="text-xs text-gray-500">{showPicker ? '收起 ›' : '展開 ›'}</span>
        </button>

        {showPicker && (
          <div className="grid grid-cols-3 gap-2">
            {months.map((m) => {
              const isSelected = m.year === year && m.month === month;
              return (
                <button
                  key={`${m.year}-${m.month}`}
                  type="button"
                  disabled={m.isEmpty}
                  onClick={() => {
                    setYear(m.year);
                    setMonth(m.month);
                    setShowPicker(false);
                  }}
                  className={`py-2 rounded-lg text-xs font-bold border ${
                    isSelected
                      ? 'bg-amber-500 text-white border-amber-500'
                      : m.isEmpty
                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                        : 'bg-white/60 text-gray-700 border-gray-300'
                  }`}
                >
                  {m.year}/{String(m.month).padStart(2, '0')}
                  {m.isEmpty && <div className="text-[10px] font-normal mt-0.5">未玩</div>}
                </button>
              );
            })}
          </div>
        )}

        {/* 預覽區 */}
        <div className="flex justify-center">
          {loading ? (
            <div
              style={{
                width: `${PREVIEW_MAX_WIDTH}px`,
                height: `${CARD_H * previewScale}px`,
                background: 'rgba(212,175,55,0.08)',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              className="text-xs text-gray-400 italic"
            >
              載入中⋯
            </div>
          ) : stats?.isEmpty ? (
            <div className="text-center py-12 px-6 space-y-2">
              <div className="text-4xl">📜</div>
              <p className="text-sm text-gray-700">這個月還沒有戰績</p>
              <p className="text-xs text-gray-500">換一個月份試試</p>
            </div>
          ) : stats ? (
            <div
              style={{
                width: `${PREVIEW_MAX_WIDTH}px`,
                height: `${CARD_H * previewScale}px`,
                position: 'relative',
                overflow: 'hidden',
                borderRadius: '16px',
                boxShadow: '0 8px 24px rgba(33,78,61,0.18)',
                background: '#fff8ec'
              }}
            >
              <div
                style={{
                  transform: `scale(${previewScale})`,
                  transformOrigin: 'top left',
                  width: `${CARD_W}px`,
                  height: `${CARD_H}px`,
                  pointerEvents: 'none'
                }}
              >
                <MonthlyReviewCard
                  ref={cardRef}
                  stats={stats}
                  profile={profile}
                  lifetimeEarned={cultivation.lifetimeEarned}
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* 動作按鈕 */}
        {stats && !stats.isEmpty && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => handleGenerate('save')}
              disabled={busy}
              className="w-full py-3 bg-emerald-500 text-white rounded-lg font-bold disabled:opacity-50 active:scale-[0.99] transition-transform"
            >
              {busy ? '正在繪製卡片⋯' : '💾 存到相簿'}
            </button>
            {canShare && (
              <button
                type="button"
                onClick={() => handleGenerate('share')}
                disabled={busy}
                className="w-full py-2.5 bg-amber-500 text-white rounded-lg font-bold disabled:opacity-50 active:scale-[0.99] transition-transform"
              >
                {busy ? '繪製中⋯' : '📤 分享'}
              </button>
            )}
            <button
              type="button"
              onClick={handleCopyLink}
              className="w-full py-2.5 bg-white/60 border border-gray-300 text-gray-700 rounded-lg text-sm font-bold"
            >
              🔗 複製連結
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
