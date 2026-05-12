import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import {
  getMyProfile,
  createProfileIfNeeded,
  updateLastSeen
} from '@/services/profileService';
import type { UserProfile } from '@/types';

/**
 * 階段 5A:訂閱「我的 profile」+ 5 分鐘 last_seen_at 心跳。
 *
 *  - 登入時:先 createProfileIfNeeded(沒 row 就建),拿到 profile 設 state
 *  - 5 分鐘心跳更新 last_seen_at(讓好友列表顯示「在線」)
 *  - 提供 reload 給 ProfileEditModal 儲存後刷新
 *  - 未登入 / 未設定雲端 → profile = null,loading = false
 *
 * NOTE:不用 useLiveQuery,因為 profile 不在 Dexie 而在 Supabase。
 * 改變時 caller 呼叫 reload() 觸發重抓。
 */
export function useMyProfile(): {
  profile: UserProfile | null;
  loading: boolean;
  reload: () => Promise<void>;
} {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(Boolean(userId));
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      // 確保 row 存在(idempotent)
      let p = await getMyProfile();
      if (!p) {
        p = await createProfileIfNeeded();
      }
      if (!mounted) return;
      setProfile(p);
      setLoading(false);

      // 順手更新 last_seen_at(打開 app 算一次)
      void updateLastSeen();
    })();
    return () => {
      mounted = false;
    };
  }, [userId, reloadKey]);

  // 5 分鐘心跳
  useEffect(() => {
    if (!userId) return;
    const id = setInterval(() => {
      void updateLastSeen();
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [userId]);

  return {
    profile,
    loading,
    reload: async () => {
      setReloadKey((k) => k + 1);
    }
  };
}

/**
 * 把 ISO timestamp 翻成「相對時間」顯示字串。
 *  - < 5 分鐘:🟢 在線
 *  - < 1 小時:🟡 X 分鐘前
 *  - < 1 天:⚪ X 小時前
 *  - < 30 天:⚪ X 天前
 *  - ≥ 30 天:⚪ 長時間未上線
 */
export function formatLastSeen(iso: string | null | undefined): {
  dot: string;
  text: string;
} {
  if (!iso) return { dot: '⚪', text: '從未上線' };
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return { dot: '⚪', text: '從未上線' };
  const now = Date.now();
  const diff = now - then;
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  if (diff < 5 * MIN) return { dot: '🟢', text: '在線' };
  if (diff < HOUR) return { dot: '🟡', text: `${Math.floor(diff / MIN)} 分鐘前` };
  if (diff < DAY) return { dot: '⚪', text: `${Math.floor(diff / HOUR)} 小時前` };
  if (diff < 30 * DAY) return { dot: '⚪', text: `${Math.floor(diff / DAY)} 天前` };
  return { dot: '⚪', text: '長時間未上線' };
}
