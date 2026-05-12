import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useAuth } from '@/lib/auth';
import { useMyProfile } from '@/hooks/useMyProfile';

const STORAGE_KEY = 'profile_setup_prompted_v1';
const TRIGGER_COUNT = 3;

interface ProfileSetupPromptProps {
  onOpenEdit: () => void;
  /**
   * 階段 5A.2:不論點「馬上設定」或「之後再說」都呼叫,讓 App.tsx 觸發
   * TopBar 掌印 .paw-flash 引導動畫。
   */
  onDismiss?: () => void;
}

/**
 * 階段 5A:第一次收集到第 3 隻神獸時跳「設定個人檔案」提示。
 *
 * 觸發條件(全部成立):
 *  - 已登入雲端
 *  - profile 已建立(useMyProfile 已 createIfNeeded)
 *  - profile.nickname 仍是預設「修仙者#XXXX」
 *  - 已召喚的神獸 distinct speciesId 數 ≥ 3
 *  - localStorage 沒記錄過已提示
 *
 * 5A.2 改版:文案改指引到 HUD 左上角掌印,關閉後 onDismiss 觸發掌印 .paw-flash
 * 動畫 3 次,引導玩家找到新入口。
 *
 * 點「馬上設定」→ open ProfileEditModal + localStorage 寫 flag(動畫被彈窗蓋住)
 * 點「之後再說」→ localStorage 寫 flag + 掌印閃爍 3 次
 */
export default function ProfileSetupPrompt({ onOpenEdit, onDismiss }: ProfileSetupPromptProps) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const { profile } = useMyProfile();
  const [visible, setVisible] = useState(false);

  // 撈所有 distinct speciesId(含 retired pet)
  const speciesCount = useLiveQuery(async () => {
    const pets = await db.pets.toArray();
    const set = new Set<string>();
    for (const p of pets) set.add(p.speciesId);
    return set.size;
  }, [], 0) ?? 0;

  useEffect(() => {
    if (!userId || !profile) return;
    if (speciesCount < TRIGGER_COUNT) return;
    if (localStorage.getItem(STORAGE_KEY) === '1') return;
    // 暱稱已自訂(不是預設「修仙者#XXXX」格式)→ 不必再提示
    if (!/^修仙者#\d{4}$/.test(profile.nickname)) {
      // 標記已提示(避免日後若 user 改回預設 還跳)
      localStorage.setItem(STORAGE_KEY, '1');
      return;
    }
    setVisible(true);
  }, [userId, profile?.userId, profile?.nickname, speciesCount]);

  if (!visible || !profile) return null;

  function dismiss(open: boolean) {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
    if (open) onOpenEdit();
    onDismiss?.();
  }

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center px-4"
      onClick={() => dismiss(false)}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white/95 backdrop-blur-md border border-amber-200 rounded-2xl shadow-xl max-w-sm w-full p-5 text-center space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-4xl">✨</div>
        <h2 className="text-lg font-bold text-gray-800">修仙之路,從這裡開始</h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          你已收集了 {speciesCount} 隻神獸!<br />
          該為自己取個響亮的稱號,讓朋友認得出你了。
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-gray-700">
          你目前是「<span className="font-bold">{profile.nickname}</span>」
        </div>
        <p className="text-sm text-gray-700 leading-relaxed">
          點左上角的 🐾 <span className="font-bold">修仙印記</span>
          <br />
          可以自訂你的暱稱、頭像、簽名
        </p>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => dismiss(false)}
            className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold border border-gray-200"
          >
            之後再說
          </button>
          <button
            type="button"
            onClick={() => dismiss(true)}
            className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold active:scale-95 transition-transform"
          >
            馬上設定
          </button>
        </div>
      </div>
    </div>
  );
}
