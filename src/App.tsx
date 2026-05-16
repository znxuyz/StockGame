import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, seedIfEmpty } from '@/db';
import { useSettings } from '@/repositories/settingsRepo';
import { useHoldings } from '@/repositories/holdingRepo';
import { petRepo } from '@/repositories/petRepo';
import { useTransactions } from '@/repositories/transactionRepo';
import { useAchievements } from '@/repositories/achievementRepo';
import { useLoginStreak } from '@/repositories/loginStreakRepo';
import {
  isMarketOpen,
  getMarketStatus,
  ApiError,
  describeApiError,
  type MarketStatus
} from '@/api';
import {
  runPriceUpdate,
  computeSummary,
  recordDailySnapshot,
  runAchievementChecks,
  checkInLoginToday,
  updateTaiexIntraday,
  audio,
  checkAndUpdateStreak,
  checkAndGenerateDailyTasks,
  checkAndGenerateWeeklyTasks,
  attachTaskListeners,
  emitTaskTrigger,
  eventBus,
  type PortfolioSummary
} from '@/services';
import type { LoginStreak } from '@/types';
// 階段 4-B:cloudSync(user_data blob 整包同步)整段停用 — 批 1-3 完成後
// settingsRepo / cultivationRepo / loginStreakRepo / holdingRepo / petRepo /
// transactionRepo / achievementRepo / creatureUnlockRepo / taskRepo 各自上雲,
// 已不需要 blob 路徑。cloudSync.ts 檔案保留(階段 6 統一清掉),呼叫端在
// App.tsx 內全部移除。
import {
  createProfileIfNeeded,
  attachProfileSyncListeners,
  backfillProfileSync,
  syncMyPortfolio,
  generateMySnapshot,
  checkExpiredLoans,
  getMyPrivacy,
  getUnreadCount,
  subscribeToMyNotifications,
  cleanupOldNotifications,
  backfillSnapshotsIfNeeded,
  checkAndRebuildIfNeeded
} from '@/services';
import type { AppNotification } from '@/types';
import { useAuth } from '@/lib/auth';
import { isCloudConfigured } from '@/lib/supabase';
import { ACHIEVEMENTS } from '@/data/achievements';
import TopBar from '@/components/TopBar';
import CultivationFloater from '@/components/CultivationFloater';
import MilestoneCelebration from '@/components/MilestoneCelebration';
import EternalCelebration from '@/components/EternalCelebration';
import TaskCompletedToast from '@/components/TaskCompletedToast';
import DailyCheckInModal from '@/components/DailyCheckInModal';
import BottomBar from '@/components/BottomBar';
import PhaserMap from '@/game/PhaserMap';
import BuyModal from '@/components/BuyModal';
import FeedModal from '@/components/FeedModal';
import SellModal from '@/components/SellModal';
// 紀錄頁靠 Recharts，500KB+，按下「紀錄」才載入
const RecordsModal = lazy(() => import('@/components/RecordsModal'));
import GameModal from '@/components/GameModal';
import FriendsModal from '@/components/FriendsModal';
import TradeModal from '@/components/TradeModal';
import SettingsModal from '@/components/SettingsModal';
import PetInfoModal from '@/components/PetInfoModal';
import Toast from '@/components/Toast';
import InstallPrompt from '@/components/InstallPrompt';
import PwaUpdatePrompt from '@/components/PwaUpdatePrompt';
import PasswordRecoveryModal from '@/components/PasswordRecoveryModal';
import SignInModal from '@/components/SignInModal';
import ProfileEditModal from '@/components/ProfileEditModal';
import ProfileSetupPrompt from '@/components/ProfileSetupPrompt';
import ShareModal from '@/components/share/ShareModal';
import MonthlyReviewModal from '@/components/share/MonthlyReviewModal';
import MonthlyReviewPrompt from '@/components/share/MonthlyReviewPrompt';
import FriendProfileModal from '@/components/FriendProfileModal';
import CultivationShareModal from '@/components/feed/CultivationShareModal';
import PrivacySettingsModal from '@/components/PrivacySettingsModal';
import LoanCreatureModal from '@/components/LoanCreatureModal';
import BorrowedCreaturesModal from '@/components/BorrowedCreaturesModal';
// 階段 5G:Excel 匯入彈窗 lazy load — ExcelJS ~900KB,只在玩家打開時下載
const ExcelImportModal = lazy(() => import('@/components/ExcelImportModal'));
import type { Pet, Stock } from '@/types';

type ModalKind =
  | 'buy'
  | 'feed'
  | 'sell'
  | 'records'
  | 'settings'
  | 'pet'
  | 'signin'
  | 'game'
  | 'friends'
  | 'trade'
  | 'profile'
  | 'share'
  | 'monthly'
  | 'friendProfile'
  | 'shareCompose'
  | 'privacy'
  | 'loan'
  | 'borrowed'
  | 'excelImport'
  | null;

export default function App() {
  const [ready, setReady] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);

  useEffect(() => {
    // 階段 3D 緊急修復:**每一個 init 步驟獨立 try/catch**,任一失敗只 warn,
    // 不再把整段 init chain 灌進 setSeedError → 不會出現「初始化失敗」全屏彈窗。
    // 唯一會 setSeedError 的是 seedIfEmpty 本身 throw(Dexie 開不起來 — catastrophic)。
    seedIfEmpty()
      .then(async () => {
        try { await checkInLoginToday(); }
        catch (e) { console.warn('[init] checkInLoginToday failed:', e); }

        try { await runAchievementChecks(); }
        catch (e) { console.warn('[init] runAchievementChecks failed:', e); }

        try {
          const r = await backfillSnapshotsIfNeeded();
          if (!r.skipped) console.log('[snapshotBackfill]', r);
        } catch (e) {
          console.warn('[snapshotBackfill] failed:', e);
        }

        checkAndRebuildIfNeeded().catch((e) =>
          console.warn('[historyBootstrap] failed:', e)
        );
        setReady(true);
      })
      .catch((e) => setSeedError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (seedError) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-sand-100 p-6">
        <PwaUpdatePrompt />
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          初始化失敗：{seedError}
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-sand-100 text-gray-500">
        <PwaUpdatePrompt />
        資料庫初始化中⋯
      </div>
    );
  }

  return (
    <>
      <PwaUpdatePrompt />
      <AuthGate>
        <Game />
      </AuthGate>
    </>
  );
}

/**
 * 階段 3A:強制登入閘門。
 *
 *  - `isCloudConfigured=false`(dev 沒設 env)→ console.warn 一次後直接 render children,
 *    維持離線模式(production Cloudflare Pages 永遠是 true,不會走這條)
 *  - auth loading → 短暫顯示「登入狀態載入中⋯」
 *  - 沒 session → 全屏 SignInModal(forceLogin=true,藏關閉鈕),children 不 render
 *    避免 Game / phaser 在沒 auth 的狀態 mount(會跟 cloudSync 的 userId 邏輯打架)
 *  - 有 session → children 正常 render
 *
 * 登出由 SettingsModal 內既有的「登出」按鈕觸發。useAuth 的 onAuthStateChange
 * 訂閱會把 session 變 null → AuthGate 自動切回登入畫面,**不需要額外邏輯**。
 *
 * 同理,token 過期 / refresh 失敗也都會 fire session=null,自動處理。
 */
/** module-level flag,讓 AuthGate 多次 render 也只 warn 一次 */
let authBypassWarned = false;

function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (!isCloudConfigured) {
    if (!authBypassWarned) {
      console.warn(
        '[auth] isCloudConfigured=false — 跳過登入閘門(dev 模式)。production 部署請務必設定 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY env'
      );
      authBypassWarned = true;
    }
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-sand-100 text-gray-500">
        登入狀態載入中⋯
      </div>
    );
  }

  if (!session) {
    return (
      <div className="w-full h-full bg-sand-100">
        <SignInModal open onClose={() => {}} forceLogin />
      </div>
    );
  }

  return <>{children}</>;
}

function Game() {
  const [modal, setModal] = useState<ModalKind>(null);
  const [petTarget, setPetTarget] = useState<{ pet: Pet; stock: Stock } | null>(null);
  // 階段 R.7:從 PetInfoModal 快速進入 FeedModal/SellModal 時帶 code 預選
  const [tradePresetCode, setTradePresetCode] = useState<string | null>(null);
  /**
   * 階段 3.2:每日簽到彈窗 streak。App 啟動 checkAndUpdateStreak 後,
   * 若 isNewDay && !todayClaimed 設這個,DailyCheckInModal open。
   * onClose 後設回 null。
   */
  const [checkInStreak, setCheckInStreak] = useState<LoginStreak | null>(null);

  const [toast, setToast] = useState<{ message: string; variant: 'info' | 'error' } | null>(null);

  // 階段 3D 緊急修復:Repository 雲端同步失敗會 emit 'toast:show',這邊訂閱 +
  // 30 秒 dedupe(同訊息短時間內重複觸發只顯示一次)。
  useEffect(() => {
    const recent = new Map<string, number>();
    return eventBus.on('toast:show', ({ message, variant }) => {
      const now = Date.now();
      const last = recent.get(message);
      if (last && now - last < 30_000) return;
      recent.set(message, now);
      setToast({ message, variant: variant ?? 'error' });
    });
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const [marketStatus, setMarketStatus] = useState<MarketStatus>(getMarketStatus());
  /**
   * 階段 5A.2:TopBar 左上角掌印「跳動 3 次」引導 token。
   * ProfileSetupPrompt 關閉時 +1,TopBar useEffect 偵測變動 → 套 .paw-flash class。
   */
  const [pawFlashToken, setPawFlashToken] = useState(0);
  /** 階段 5C:分享卡片目標 pet(ShareModal 用) */
  const [sharePet, setSharePet] = useState<Pet | null>(null);
  /** 階段 5C:月度回顧目標(null = 用上個月預設) */
  const [monthlyTarget, setMonthlyTarget] = useState<{ year: number; month: number } | null>(null);
  /** 階段 5B:好友個人頁目標 user_id */
  const [friendProfileUserId, setFriendProfileUserId] = useState<string | null>(null);
  /** 階段 5E:借展神獸的目標 pet(LoanCreatureModal 用) */
  const [loanPet, setLoanPet] = useState<Pet | null>(null);
  /** 階段 5F:全域未讀通知數(BottomBar friends 紅點用) */
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  /** 階段 5F:打開 FriendsModal 時的預設 tab(來自通知點擊 / BottomBar 點 friends 紅點) */
  const [friendsInitialTab, setFriendsInitialTab] =
    useState<'friends' | 'requests' | 'search' | 'feed' | 'notifications'>('friends');
  /** 用 ref 而非 state 鎖併發,避免 silentRefresh closure 拿到 stale 的 refreshing */
  const refreshingRef = useRef(false);

  // 雲端同步狀態
  const { session } = useAuth();
  const userId = session?.user?.id;
  /** 同一 user 的 post-login init 只跑一次,避免 React strict mode / re-render 重觸發 */
  const initialSyncDoneForUserRef = useRef<string | null>(null);

  // OAuth / Email+密碼登入成功 → SIGNED_IN 事件 → useAuth 更新 session →
  // 自動關掉 SignInModal(supabase-js 已自行清乾淨 URL hash/window URL hash/query)
  useEffect(() => {
    if (userId && modal === 'signin') {
      setModal(null);
    }
  }, [userId, modal]);

  // 階段 5B:attach profileSyncService listeners(全域,僅 mount 一次)
  // listener 內部會 check session,沒登入時 noop
  useEffect(() => {
    const detach = attachProfileSyncListeners();
    return () => detach();
  }, []);

  // 階段 5E:過期借展自動歸還(每分鐘 check 一次)+ mount 立刻跑一次
  useEffect(() => {
    if (!userId) return;
    void checkExpiredLoans();
    const id = setInterval(() => {
      void checkExpiredLoans();
    }, 60_000);
    return () => clearInterval(id);
  }, [userId]);

  // 階段 5F:接收 service worker postMessage(push 通知點擊後)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const handler = (event: MessageEvent) => {
      const msg = event.data as { type?: string; url?: string } | null;
      if (msg?.type === 'notification_click') {
        // url 內 hash 帶 notif_type=feed_like&feed_id=123 之類,簡單做法直接開 friends modal
        // 玩家從通知 tab 看詳細
        setFriendsInitialTab('notifications');
        setModal('friends');
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  // 階段 5F:登入後拉初始未讀通知數 + Realtime 訂閱新通知 INSERT
  // 進入 NotificationsTab 後 unread count 會由內部更新為 0;這裡單純做 badge
  useEffect(() => {
    if (!userId) {
      setUnreadNotifCount(0);
      return;
    }
    let mounted = true;
    void getUnreadCount().then((c) => {
      if (mounted) setUnreadNotifCount(c);
    });
    // 順手清 90 天前舊通知,避免 DB 變大
    void cleanupOldNotifications();

    const detach = subscribeToMyNotifications(userId, (notif: AppNotification) => {
      setUnreadNotifCount((c) => c + 1);
      // 站內 toast 提示新通知(已讀後玩家可從 friends modal 看詳細)
      setToast({ message: `🔔 ${notif.title}`, variant: 'info' });
    });
    return () => {
      mounted = false;
      detach();
    };
  }, [userId]);

  // 階段 5E:本地 holdings / prices 變動 → debounce 5 秒 sync 雲端 portfolio summary
  // 在這個 ref 內存 timer,避免 strict mode double-run 重設
  const portfolioSyncTimerRef = useRef<number | undefined>(undefined);

  // 每分鐘更新 market status(open / after-hours / weekend / holiday)
  useEffect(() => {
    const t = setInterval(() => setMarketStatus(getMarketStatus()), 60_000);
    return () => clearInterval(t);
  }, []);

  // 階段 3.2:App 啟動檢查連登狀態,新一天且未領取 → 跳簽到彈窗
  // 階段 3.4/3.5:同時確保今日有 daily / 本週有 weekly 任務
  // 階段 3.7:attach task listeners + emit 'login' 觸發週任務「七日不輟」
  useEffect(() => {
    let mounted = true;
    const detach = attachTaskListeners();
    (async () => {
      const result = await checkAndUpdateStreak();
      if (!mounted) return;
      if (result.isNewDay && !result.streak.todayClaimed) {
        setCheckInStreak(result.streak);
      }
      await checkAndGenerateDailyTasks();
      await checkAndGenerateWeeklyTasks();
      if (result.isNewDay) emitTaskTrigger('login', 1);
    })();
    return () => {
      mounted = false;
      detach();
    };
  }, []);

  // 第一次 user gesture 解鎖 BGM(autoplay 政策);任何 click/touch/keydown 都算
  useEffect(() => {
    const handler = () => audio.unlockOnce();
    window.addEventListener('pointerdown', handler, { once: true });
    window.addEventListener('keydown', handler, { once: true });
    return () => {
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('keydown', handler);
    };
  }, []);

  // live data — 主畫面持倉 / 成就用
  // 階段 4-B:blob pushDebounced 停用後,之前為了觸發 push 而訂閱的 pets /
  // snapshots / stocks / cultivation / tasks / milestones / creatureUnlocks
  // 共 7 個 useLiveQuery 已移除(原本只是 push trigger,沒被讀取)。
  const settings = useSettings();
  const holdings = useHoldings();
  const prices = useLiveQuery(() => db.prices.toArray(), []);
  const achievements = useAchievements();
  const transactions = useTransactions();
  const userLoginStreak = useLoginStreak();

  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  useEffect(() => {
    computeSummary().then(setSummary);
  }, [holdings, prices]);

  // 同步 settings.soundEnabled → audio mute 狀態
  useEffect(() => {
    if (settings) audio.setMuted(!settings.soundEnabled);
  }, [settings?.soundEnabled]);

  // 階段 4B.3:同步 settings.hudTheme → <html data-theme>,index.css CSS 變數即時生效
  useEffect(() => {
    const theme = settings?.hudTheme ?? 'default';
    document.documentElement.dataset.theme = theme;
  }, [settings?.hudTheme]);

  const unlockedCount = useMemo(
    () => (achievements ?? []).filter((a) => a.unlockedAt).length,
    [achievements]
  );

  // 共用:動作完成後刷新成就 + 顯示 toast(成功的買入/加碼/賣出順手響金幣音)
  async function postAction(message: string) {
    if (/買入|加碼|售出|賣出/.test(message)) {
      audio.playCoin();
    }
    const ach = await runAchievementChecks();
    if (ach.newlyUnlocked.length > 0) {
      const names = ach.newlyUnlocked
        .map((id) => ACHIEVEMENTS.find((a) => a.id === id)?.name)
        .filter(Boolean)
        .join('、');
      setToast({ message: `${message}　🏆 新成就：${names}`, variant: 'info' });
    } else {
      setToast({ message, variant: 'info' });
    }
  }

  async function handleRefresh() {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      const r = await runPriceUpdate();
      await recordDailySnapshot();
      // 更新加權指數即時值(失敗 console.warn,不影響主流程)
      await updateTaiexIntraday();
      await postAction(
        `已更新 ${r.updated.length} 檔（${r.duringMarket ? '盤中即時' : '盤後收盤'}）` +
          (r.missing.length ? `，未抓到 ${r.missing.length} 檔` : '')
      );
    } catch (e) {
      const msg = e instanceof ApiError ? describeApiError(e) : e instanceof Error ? e.message : String(e);
      setToast({ message: `⚠️ 更新失敗：${msg}`, variant: 'error' });
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }

  /**
   * 盤中靜默自動更新:
   *  - 跟手動更新走同一條 runPriceUpdate(會跑進化評估 + 寫 lastPriceUpdateAt)
   *  - 成功不彈成功 toast(避免每 30s 打擾),只有「進化/黑化/淨化」才彈
   *  - 失敗不彈錯誤 toast(同樣避免騷擾),只 console.warn
   *  - 透過 refreshingRef 鎖併發、避免跟手動同時抓
   */
  const silentRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await runPriceUpdate();
      await recordDailySnapshot();
      // 順手把加權指數即時值更新(獨立函式內已 try/catch console.warn,不影響主流程)
      await updateTaiexIntraday();
      // 進化/黑化機制已取消,自動更新單純跑成就檢查就好
      await runAchievementChecks();
    } catch (e) {
      console.warn('[silentRefresh] 自動更新失敗(不彈 toast):', e);
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, []);

  /**
   * 盤中自動 polling:每 30 秒 + 從背景回前景時補一次。
   * 條件:有持倉 + 盤中 + 頁面 visible。
   * isMarketOpen 在 setInterval callback 內呼叫(確保跨整點切換能即時生效)。
   */
  const hasHoldings = (holdings ?? []).length > 0;
  useEffect(() => {
    if (!hasHoldings) return;

    const tick = () => {
      if (isMarketOpen() && document.visibilityState === 'visible') {
        silentRefresh();
      }
    };
    const id = setInterval(tick, 30_000);

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && isMarketOpen()) {
        silentRefresh();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [hasHoldings, silentRefresh]);

  // ─── 階段 4-B:登入後 post-init(blob sync 已停用)─────
  //
  //   階段 3D 把 9 個 Repository 各自上雲(white-list + cloud-first)後,
  //   舊的 user_data blob 整包 pull/push 路徑(fetchRemoteMeta / pullNow /
  //   pushNow / pushDebounced)已不再需要,整段停用。`maybeCloudWarning`
  //   helper 也一起退場(沒有 caller 了)。
  //
  //   仍然需要在 user login 後跑的非-blob init 步驟保留:
  //   - checkAndUpdateStreak / checkAndGenerateDailyTasks / Weekly
  //     (跨裝置 lastLoginDate 可能不同,做一次同步檢查)
  //   - checkAndRebuildIfNeeded(歷史快照狀態驅動補抓)
  //   - createProfileIfNeeded(階段 5A user_profile row 建立)
  //   - backfillProfileSync(階段 5B user_creature_summary 從本地 pets 一次性 backfill)
  //   - getMyPrivacy / syncMyPortfolio / generateMySnapshot
  //     (階段 5E 持倉摘要 + 排行榜資料 + privacy 預設值)
  //
  //   失敗一律 try/catch + console.warn,不再 setToast(blob sync 沒了沒
  //   「無法連接雲端」這個概念;個別 service 自己處理 toast)。
  useEffect(() => {
    if (!userId) {
      initialSyncDoneForUserRef.current = null;
      return;
    }
    if (initialSyncDoneForUserRef.current === userId) return;

    (async () => {
      try {
        const after = await checkAndUpdateStreak();
        await checkAndGenerateDailyTasks();
        await checkAndGenerateWeeklyTasks();
        if (after.streak.todayClaimed) {
          setCheckInStreak(null);
        }
      } catch (e) {
        console.warn('[init] streak / tasks re-init failed:', e);
      }

      checkAndRebuildIfNeeded().catch((e) =>
        console.warn('[init] checkAndRebuildIfNeeded failed:', e)
      );

      try {
        await createProfileIfNeeded();
      } catch (e) {
        console.warn('[init] createProfileIfNeeded failed:', e);
      }

      try {
        await backfillProfileSync();
      } catch (e) {
        console.warn('[init] backfillProfileSync failed:', e);
      }

      try {
        await getMyPrivacy();
        await syncMyPortfolio();
        await generateMySnapshot();
      } catch (e) {
        console.warn('[init] stage 5E initial sync failed:', e);
      }

      initialSyncDoneForUserRef.current = userId;
    })();
  }, [userId]);

  // 階段 5E:本地 holdings / prices 變動 → debounce 5 秒 sync user_portfolio_summary
  // 階段 4-B 後 blob sync 停用,allowAutoPushRef 也拔了 — syncMyPortfolio 自己會
  // check session,跑早一點也無害(idempotent upsert)
  useEffect(() => {
    if (!userId) return;
    if (portfolioSyncTimerRef.current !== undefined) {
      clearTimeout(portfolioSyncTimerRef.current);
    }
    portfolioSyncTimerRef.current = window.setTimeout(() => {
      void syncMyPortfolio();
    }, 5_000);
    return () => {
      if (portfolioSyncTimerRef.current !== undefined) {
        clearTimeout(portfolioSyncTimerRef.current);
      }
    };
  }, [userId, holdings, prices, transactions]);

  /** PhaserMap 只送 petId 出來，這裡用 id 對應到 Pet + Stock */
  async function handlePetClickById(petId: string) {
    const pet = await petRepo.get(petId);
    if (!pet) return;
    const stock = await db.stocks.get(pet.code);
    if (!stock) return;
    setPetTarget({ pet, stock });
    setModal('pet');
  }

  if (!settings) {
    return null;
  }

  return (
    <div className="w-full h-full flex flex-col bg-sand-100 no-select">
      <TopBar
        summary={summary}
        marketStatus={marketStatus}
        consecutiveDays={userLoginStreak?.currentStreak ?? 0}
        unlockedAchievements={unlockedCount}
        totalAchievements={ACHIEVEMENTS.length}
        lastPriceUpdateAt={settings.lastPriceUpdateAt}
        refreshing={refreshing}
        onOpenProfile={() => setModal('profile')}
        flashPawToken={pawFlashToken}
      />
      <CultivationFloater />
      <MilestoneCelebration />
      <EternalCelebration />
      <TaskCompletedToast />
      {checkInStreak && (
        <DailyCheckInModal
          open
          onClose={() => setCheckInStreak(null)}
          streak={checkInStreak}
        />
      )}

      <PhaserMap
        onPetClick={handlePetClickById}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      <BottomBar
        onGame={() => setModal('game')}
        onFriends={() => {
          // 階段 5F:點 friends button 時若有未讀 → 預設切到通知 tab
          setFriendsInitialTab(unreadNotifCount > 0 ? 'notifications' : 'friends');
          setModal('friends');
        }}
        onTrade={() => setModal('trade')}
        onRecords={() => setModal('records')}
        onSettings={() => setModal('settings')}
        friendsUnreadCount={unreadNotifCount}
      />

      {/* 彈窗們 */}
      <BuyModal
        open={modal === 'buy'}
        onClose={() => setModal(null)}
        settings={settings}
        onActionComplete={postAction}
      />
      <FeedModal
        open={modal === 'feed'}
        onClose={() => {
          setModal(null);
          setTradePresetCode(null);
        }}
        settings={settings}
        onActionComplete={postAction}
        presetCode={tradePresetCode}
      />
      <SellModal
        open={modal === 'sell'}
        onClose={() => {
          setModal(null);
          setTradePresetCode(null);
        }}
        settings={settings}
        onActionComplete={postAction}
        presetCode={tradePresetCode}
      />
      <Suspense fallback={null}>
        {modal === 'records' && (
          <RecordsModal open onClose={() => setModal(null)} />
        )}
      </Suspense>
      <GameModal
        open={modal === 'game'}
        onClose={() => setModal(null)}
        onPetClick={(petId) => {
          // 修為 tab 內點 pet → 關遊戲彈窗開該 pet 詳細頁
          setModal(null);
          handlePetClickById(petId);
        }}
        onOpenMonthlyReview={() => {
          setMonthlyTarget(null);
          setModal('monthly');
        }}
        onShare={(p) => {
          // 圖鑑詳細頁 → 開分享彈窗(關遊戲彈窗,避免兩個 popup 疊)
          setSharePet(p);
          setModal('share');
        }}
      />
      <FriendsModal
        open={modal === 'friends'}
        onClose={() => setModal(null)}
        onOpenSignIn={() => setModal('signin')}
        onOpenFriendProfile={(userId) => {
          setFriendProfileUserId(userId);
          setModal('friendProfile');
        }}
        onOpenShareComposer={() => setModal('shareCompose')}
        onOpenCreature={async (speciesId) => {
          // 自己有這隻就開 PetInfo,沒有就靜默(沒專門「跳圖鑑詳細」入口,5E 再做)
          const myPets = await petRepo.list();
          const mine = myPets.find((p) => p.speciesId === speciesId);
          if (!mine) return;
          await handlePetClickById(mine.id);
        }}
        initialTab={friendsInitialTab}
        onUnreadCountChange={setUnreadNotifCount}
        onOpenPrivacy={() => setModal('privacy')}
        onOpenMyProfile={() => setModal('profile')}
        onNotificationClick={(notif) => {
          // 路由:
          //   friend_request / friend_accepted → 跳到請求 tab(已切過去)
          //   feed_like / feed_comment → 跳對方個人頁(動態主人 = 自己,改去動態 tab)
          //   loan_received → 開 BorrowedCreaturesModal
          //   rank_changed / achievement / system → 留在通知 tab
          const data = notif.relatedData ?? {};
          switch (notif.notificationType) {
            case 'friend_request':
              setFriendsInitialTab('requests');
              break;
            case 'friend_accepted':
              if (data.fromUserId) {
                setFriendProfileUserId(data.fromUserId);
                setModal('friendProfile');
              }
              break;
            case 'feed_like':
            case 'feed_comment':
              setFriendsInitialTab('feed');
              break;
            case 'loan_received':
            case 'loan_returning':
            case 'loan_returned':
              setModal('borrowed');
              break;
            default:
              break;
          }
        }}
      />
      <CultivationShareModal
        open={modal === 'shareCompose'}
        onClose={() => setModal('friends')}
        onPosted={() => setModal('friends')}
        onActionComplete={postAction}
      />
      <FriendProfileModal
        open={modal === 'friendProfile'}
        onClose={() => {
          setModal(null);
          setFriendProfileUserId(null);
        }}
        friendUserId={friendProfileUserId}
        onBack={() => {
          // 「← 返回好友列表」= 關自己回到 FriendsModal
          setModal('friends');
          setFriendProfileUserId(null);
        }}
        onRelationChanged={() => {
          // 好友移除 / 封鎖後 → 關掉 friend profile,讓 FriendsModal 開回去自動 reload
          setFriendProfileUserId(null);
        }}
        onShareMyPet={(p) => {
          setSharePet(p);
          setModal('share');
        }}
        onActionComplete={postAction}
      />
      <ProfileEditModal
        open={modal === 'profile'}
        onClose={() => setModal(null)}
        onActionComplete={postAction}
        onOpenBorrowed={() => setModal('borrowed')}
      />
      <ProfileSetupPrompt
        onOpenEdit={() => setModal('profile')}
        onDismiss={() => setPawFlashToken((t) => t + 1)}
      />
      <TradeModal
        open={modal === 'trade'}
        onClose={() => setModal(null)}
        onBuy={() => setModal('buy')}
        onFeed={() => setModal('feed')}
        onSell={() => setModal('sell')}
        hasHoldings={hasHoldings}
      />
      <SettingsModal
        open={modal === 'settings'}
        onClose={() => setModal(null)}
        settings={settings}
        onActionComplete={postAction}
        onOpenSignIn={() => setModal('signin')}
        onOpenMonthlyReview={() => {
          setMonthlyTarget(null);
          setModal('monthly');
        }}
        onOpenPrivacy={() => setModal('privacy')}
        onOpenExcelImport={() => setModal('excelImport')}
      />
      <Suspense fallback={null}>
        {modal === 'excelImport' && (
          <ExcelImportModal
            open
            onClose={() => setModal(null)}
            settings={settings}
            onActionComplete={postAction}
          />
        )}
      </Suspense>
      <PrivacySettingsModal
        open={modal === 'privacy'}
        onClose={() => setModal(null)}
        onActionComplete={postAction}
      />
      <SignInModal
        open={modal === 'signin'}
        onClose={() => setModal(null)}
      />
      <PetInfoModal
        open={modal === 'pet'}
        onClose={() => setModal(null)}
        pet={petTarget?.pet ?? null}
        stock={petTarget?.stock ?? null}
        onQuickFeed={(code) => {
          setTradePresetCode(code);
          setModal('feed');
        }}
        onQuickSell={(code) => {
          setTradePresetCode(code);
          setModal('sell');
        }}
        onShare={(p) => {
          setSharePet(p);
          setModal('share');
        }}
        onLoan={(p) => {
          setLoanPet(p);
          setModal('loan');
        }}
      />
      <LoanCreatureModal
        open={modal === 'loan'}
        onClose={() => {
          setModal(null);
          setLoanPet(null);
        }}
        pet={loanPet}
        onActionComplete={postAction}
      />
      <BorrowedCreaturesModal
        open={modal === 'borrowed'}
        onClose={() => setModal(null)}
        onActionComplete={postAction}
      />
      <ShareModal
        open={modal === 'share'}
        onClose={() => {
          setModal(null);
          setSharePet(null);
        }}
        pet={sharePet}
        onActionComplete={postAction}
      />
      <MonthlyReviewModal
        open={modal === 'monthly'}
        onClose={() => {
          setModal(null);
          setMonthlyTarget(null);
        }}
        initialYear={monthlyTarget?.year}
        initialMonth={monthlyTarget?.month}
        onActionComplete={postAction}
      />
      <MonthlyReviewPrompt
        onView={(y, m) => {
          setMonthlyTarget({ year: y, month: m });
          setModal('monthly');
        }}
      />

      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant}
        onDismiss={() => setToast(null)}
      />

      {/* PWA 安裝提示(iOS Safari 顯示加入主畫面說明、Android 顯示安裝鈕;
          已裝桌面或 7 天內被關掉就不顯示) */}
      <InstallPrompt />

      {/* 重設密碼回 app 後的設新密碼彈窗,訂閱 PASSWORD_RECOVERY 事件自動跳出 */}
      <PasswordRecoveryModal />
    </div>
  );
}
