import { useEffect, useState } from 'react';
import Modal from './Modal';
import {
  getMyPrivacy,
  isPushSupported,
  subscribePush,
  unsubscribePush,
  updateMyPrivacy
} from '@/services';
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

          <hr className="border-gray-200" />

          {/* 階段 5F:通知 + 推播 */}
          <NotificationSection data={data} onCommit={commit} onActionComplete={onActionComplete} />

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

// ─── 階段 5F:通知 + 推播 section ───────────────────────

function NotificationSection({
  data,
  onCommit,
  onActionComplete
}: {
  data: UserPrivacySettings;
  onCommit: (patch: Partial<UserPrivacySettings>) => Promise<void>;
  onActionComplete?: (message: string) => void;
}) {
  const sup = isPushSupported();

  async function togglePush(v: boolean) {
    // 1. 先 commit 偏好(以便 Edge Function 立刻看得到)
    await onCommit({ pushEnabled: v });
    // 2. v=true → 訂閱 SW Push;v=false → 取消訂閱
    if (v) {
      const r = await subscribePush();
      if (!r.ok) {
        const reasonMap: Record<string, string> = {
          unsupported: '此裝置不支援推播,iOS 需先「加入主畫面」',
          permission_denied: '通知權限被拒,請到系統設定 → 通知 → 神獸股市 開啟',
          not_signed_in: '尚未登入雲端',
          failed: '訂閱失敗,請稍後再試'
        };
        onActionComplete?.(`⚠️ ${reasonMap[r.reason] ?? '訂閱失敗'}`);
        // rollback 偏好
        await onCommit({ pushEnabled: false });
      } else {
        onActionComplete?.('🔔 已啟用手機推播');
      }
    } else {
      await unsubscribePush();
      onActionComplete?.('已關閉手機推播');
    }
  }

  return (
    <section>
      <h4 className="text-xs font-bold text-gray-700 mb-2">🔔 通知與推播</h4>

      {/* 推播主開關 */}
      <div
        className={`rounded-lg border p-2 mb-2 ${
          data.pushEnabled ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'
        }`}
      >
        <CheckRow
          label="啟用手機推播"
          caption={
            sup.supported
              ? '收到讚 / 評論 / 借展時推播到手機,APP 沒開也會收到'
              : sup.reason === 'need_pwa_install'
                ? '⚠️ iOS 需先「加入主畫面」才能使用推播'
                : sup.reason === 'no_vapid_key'
                  ? '⚠️ 推播功能尚未啟用(管理員需設定 VAPID keys)'
                  : '⚠️ 此裝置 / 瀏覽器不支援推播'
          }
          checked={data.pushEnabled}
          onChange={togglePush}
        />
      </div>

      {/* 單類型開關 */}
      <div className="space-y-0.5 mb-3">
        <CheckRow
          label="🤝 好友請求 / 接受"
          checked={data.notifyFriendRequest}
          onChange={(v) => onCommit({ notifyFriendRequest: v })}
        />
        <CheckRow
          label="❤️ 收到讚"
          checked={data.notifyFeedLike}
          onChange={(v) => onCommit({ notifyFeedLike: v })}
        />
        <CheckRow
          label="💬 收到評論"
          checked={data.notifyFeedComment}
          onChange={(v) => onCommit({ notifyFeedComment: v })}
        />
        <CheckRow
          label="🎁 神獸借展"
          checked={data.notifyLoan}
          onChange={(v) => onCommit({ notifyLoan: v })}
        />
        <CheckRow
          label="📊 排行變動"
          caption="預設關,避免太多通知"
          checked={data.notifyRank}
          onChange={(v) => onCommit({ notifyRank: v })}
        />
        <CheckRow
          label="🏆 成就解鎖"
          checked={data.notifyAchievement}
          onChange={(v) => onCommit({ notifyAchievement: v })}
        />
      </div>

      {/* 勿擾時間 */}
      <div>
        <div className="text-xs text-gray-600 mb-1">勿擾時間(此時段只寫站內,不發手機推播)</div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">從</span>
          <input
            type="time"
            value={data.quietHoursStart}
            onChange={(e) => onCommit({ quietHoursStart: e.target.value })}
            className="input-field py-1 text-sm w-24"
          />
          <span className="text-gray-500">到</span>
          <input
            type="time"
            value={data.quietHoursEnd}
            onChange={(e) => onCommit({ quietHoursEnd: e.target.value })}
            className="input-field py-1 text-sm w-24"
          />
        </div>
      </div>

      {/* PWA 提示 */}
      {sup.reason === 'need_pwa_install' && (
        <div className="mt-3 p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 leading-relaxed">
          <p className="font-bold mb-1">啟用手機推播步驟</p>
          <ol className="list-decimal list-inside space-y-0.5">
            <li>點 Safari 下方分享按鈕</li>
            <li>選「加入主畫面」</li>
            <li>從主畫面開啟「神獸股市」</li>
            <li>回到此處啟用推播</li>
          </ol>
          <p className="mt-1 text-amber-700">需 iOS 16.4 或更新版本</p>
        </div>
      )}
    </section>
  );
}
