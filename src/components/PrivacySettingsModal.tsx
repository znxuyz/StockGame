import { useEffect, useState } from 'react';
import Modal from './Modal';
import { getMyPrivacy, updateMyPrivacy } from '@/services';
import { isCloudConfigured } from '@/lib/supabase';
import type { PortfolioVisibility, UserPrivacySettings } from '@/types';

interface PrivacySettingsModalProps {
  open: boolean;
  onClose: () => void;
  onActionComplete?: (message: string) => void;
}

/**
 * 階段 5E:玩家隱私設定彈窗。
 *
 *  - 持倉金額分享:3 段 radio(hidden / partial / full)
 *  - 報酬率分享 / 排行榜參加 / 5 個自動發布動態 各一個 checkbox
 *  - 未登入雲端 → 顯示提示
 *  - 自動「儲存草稿」:每次切換都立刻 update DB(不需要點儲存按鈕)
 *    減少玩家「忘了按儲存」的挫折
 */
export default function PrivacySettingsModal({
  open,
  onClose,
  onActionComplete
}: PrivacySettingsModalProps) {
  const [data, setData] = useState<UserPrivacySettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getMyPrivacy().then((p) => {
      setData(p);
      setLoading(false);
    });
  }, [open]);

  async function commit(patch: Partial<UserPrivacySettings>) {
    if (!data || busy) return;
    setBusy(true);
    // 樂觀更新
    setData({ ...data, ...patch });
    const r = await updateMyPrivacy(patch);
    setBusy(false);
    if (!r.ok) {
      onActionComplete?.(`⚠️ 儲存失敗:${r.error}`);
      // rollback
      const fresh = await getMyPrivacy();
      if (fresh) setData(fresh);
      return;
    }
  }

  if (!isCloudConfigured) {
    return (
      <Modal open={open} onClose={onClose} title="🔒 隱私設定">
        <div className="text-center py-8 space-y-2">
          <div className="text-4xl">☁</div>
          <p className="text-sm text-gray-700">雲端同步未啟用</p>
          <p className="text-xs text-gray-500">設好 Supabase 環境變數才能用</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="🔒 隱私設定">
      {loading || !data ? (
        <p className="text-sm text-gray-500 text-center py-6">載入中⋯</p>
      ) : (
        <div className="space-y-4">
          {/* 持倉金額分享 */}
          <section>
            <h4 className="text-xs font-bold text-gray-700 mb-2">持倉金額分享</h4>
            <p className="text-[11px] text-gray-500 mb-2 leading-relaxed">
              好友看你的持倉組合時,金額要如何顯示。**比例**(% 占比)永遠可看,只是金額遮罩程度不同。
            </p>
            <div className="space-y-1">
              <VisibilityRadio
                value="hidden"
                checked={data.portfolioAmountVisibility === 'hidden'}
                onClick={() => commit({ portfolioAmountVisibility: 'hidden' })}
                label="完全不顯示"
                caption="只看比例,金額顯示「---」(預設)"
              />
              <VisibilityRadio
                value="partial"
                checked={data.portfolioAmountVisibility === 'partial'}
                onClick={() => commit({ portfolioAmountVisibility: 'partial' })}
                label="部分顯示"
                caption="例:1234567 → 1*****7"
              />
              <VisibilityRadio
                value="full"
                checked={data.portfolioAmountVisibility === 'full'}
                onClick={() => commit({ portfolioAmountVisibility: 'full' })}
                label="完全顯示"
                caption="完整金額"
              />
            </div>
          </section>

          <hr className="border-gray-200" />

          {/* 報酬率 */}
          <section>
            <h4 className="text-xs font-bold text-gray-700 mb-2">報酬率分享</h4>
            <CheckRow
              label="顯示每日報酬率"
              checked={data.showDailyReturn}
              onChange={(v) => commit({ showDailyReturn: v })}
            />
            <CheckRow
              label="顯示總報酬率"
              checked={data.showTotalReturn}
              onChange={(v) => commit({ showTotalReturn: v })}
            />
          </section>

          <hr className="border-gray-200" />

          {/* 排行榜 */}
          <section>
            <h4 className="text-xs font-bold text-gray-700 mb-2">排行榜</h4>
            <CheckRow
              label="參加好友排行榜"
              caption="關掉後好友看你顯示「未參加排行」,但你仍能看排行榜本身"
              checked={data.joinLeaderboard}
              onChange={(v) => commit({ joinLeaderboard: v })}
            />
          </section>

          <hr className="border-gray-200" />

          {/* 自動發布動態 */}
          <section>
            <h4 className="text-xs font-bold text-gray-700 mb-2">自動發布動態</h4>
            <p className="text-[11px] text-gray-500 mb-1">
              這些事件發生時是否自動發到好友動態牆。
            </p>
            <CheckRow
              label="🐉 召喚新神獸"
              checked={data.autoPublishSummon}
              onChange={(v) => commit({ autoPublishSummon: v })}
            />
            <CheckRow
              label="✨ 神獸境界突破(神/聖/仙)"
              checked={data.autoPublishRealmUp}
              onChange={(v) => commit({ autoPublishRealmUp: v })}
            />
            <CheckRow
              label="⭐ 修仙稱號升級"
              checked={data.autoPublishTitleUp}
              onChange={(v) => commit({ autoPublishTitleUp: v })}
            />
            <CheckRow
              label="🔥 連登里程碑"
              checked={data.autoPublishStreak}
              onChange={(v) => commit({ autoPublishStreak: v })}
            />
            <CheckRow
              label="💎 永恆紀念"
              checked={data.autoPublishEternal}
              onChange={(v) => commit({ autoPublishEternal: v })}
            />
          </section>

          <p className="text-[11px] text-gray-400 italic text-center">
            設定變更即時生效,不用按儲存
          </p>
        </div>
      )}
    </Modal>
  );
}

function VisibilityRadio({
  value: _v,
  checked,
  onClick,
  label,
  caption
}: {
  value: PortfolioVisibility;
  checked: boolean;
  onClick: () => void;
  label: string;
  caption: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-2 transition-colors ${
        checked
          ? 'bg-amber-50 border-amber-300'
          : 'bg-white/60 border-gray-200 hover:bg-white/80'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-base">{checked ? '🟡' : '⚪'}</span>
        <span className="text-sm font-bold text-gray-800">{label}</span>
      </div>
      <div className="text-[11px] text-gray-500 mt-0.5 pl-6">{caption}</div>
    </button>
  );
}

function CheckRow({
  label,
  caption,
  checked,
  onChange
}: {
  label: string;
  caption?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 py-1 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-5 h-5 accent-emerald-500 mt-0.5 shrink-0"
      />
      <div className="flex-1">
        <div className="text-sm text-gray-700">{label}</div>
        {caption && <div className="text-[11px] text-gray-500 leading-relaxed">{caption}</div>}
      </div>
    </label>
  );
}
