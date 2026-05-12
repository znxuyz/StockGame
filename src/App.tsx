import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, seedIfEmpty } from '@/db';
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
  type PortfolioSummary
} from '@/services';
import type { LoginStreak } from '@/types';
import {
  pullNow,
  pushNow,
  pushDebounced,
  cancelPendingPush,
  fetchRemoteMeta,
  localHasUserData
} from '@/services/cloudSync';
import { createProfileIfNeeded } from '@/services';
import { useAuth } from '@/lib/auth';
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
  | null;

export default function App() {
  const [ready, setReady] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);

  useEffect(() => {
    seedIfEmpty()
      .then(async () => {
        await checkInLoginToday();
        await runAchievementChecks();
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
      <Game />
    </>
  );
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
  const [refreshing, setRefreshing] = useState(false);
  const [marketStatus, setMarketStatus] = useState<MarketStatus>(getMarketStatus());
  /**
   * 階段 5A.2:TopBar 左上角掌印「跳動 3 次」引導 token。
   * ProfileSetupPrompt 關閉時 +1,TopBar useEffect 偵測變動 → 套 .paw-flash class。
   */
  const [pawFlashToken, setPawFlashToken] = useState(0);
  /** 用 ref 而非 state 鎖併發,避免 silentRefresh closure 拿到 stale 的 refreshing */
  const refreshingRef = useRef(false);

  // 雲端同步狀態
  const { session } = useAuth();
  const userId = session?.user?.id;
  /** 同一 user 的初始 pull/push 只跑一次,避免 React strict mode / re-render 重觸發 */
  const initialSyncDoneForUserRef = useRef<string | null>(null);
  /** 阻擋初始 sync 完成前的 push(避免空本地把雲端清掉) */
  const allowAutoPushRef = useRef(false);

  // OAuth / Email+密碼登入成功 → SIGNED_IN 事件 → useAuth 更新 session →
  // 自動關掉 SignInModal(supabase-js 已自行清乾淨 URL hash/query)
  useEffect(() => {
    if (userId && modal === 'signin') {
      setModal(null);
    }
  }, [userId, modal]);

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

  // live data
  const settings = useLiveQuery(() => db.settings.get('singleton'), []);
  const holdings = useLiveQuery(() => db.holdings.toArray(), []);
  const prices = useLiveQuery(() => db.prices.toArray(), []);
  const achievements = useLiveQuery(() => db.achievements.toArray(), []);
  // 為了 push trigger,訂閱另外幾張表(只計 length 用,讓 useEffect 偵測到變動)
  const pets = useLiveQuery(() => db.pets.toArray(), []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const snapshots = useLiveQuery(() => db.snapshots.toArray(), []);
  const stocks = useLiveQuery(() => db.stocks.toArray(), []);
  // 階段 2.6:訂閱 cultivation 兩表,任何 earn/spend 觸發 push debounce
  const userCultivation = useLiveQuery(() => db.userCultivation.get('main'), []);
  const cultivationLog = useLiveQuery(() => db.cultivationLog.count(), []);
  // 階段 3.8:訂閱 streak / tasks / milestones,任何變動觸發 push debounce
  // tasks 用 toArray:Dexie liveQuery 對 count 在 update 時不 retrigger,進度推進也要 push
  // milestones 是 append-only,count 即可
  const userLoginStreak = useLiveQuery(() => db.userLoginStreak.get('main'), []);
  const userTasksArr = useLiveQuery(() => db.userTasks.toArray(), []);
  const milestoneCount = useLiveQuery(() => db.milestoneRewards.count(), []);
  // 階段 4C.5:訂閱 creatureUnlocks count,任何故事解鎖觸發 push debounce
  // 防呆:若表還沒 migrate 完(v12 → v13 過渡)當 0 處理,不讓錯誤把整個 App 炸掉
  const creatureUnlocksCount = useLiveQuery(async () => {
    try {
      return await db.creatureUnlocks.count();
    } catch (e) {
      console.warn('[App] creatureUnlocks count failed:', e);
      return 0;
    }
  }, []);

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

  // ─── 雲端同步:登入後初始 pull/push/conflict ───
  useEffect(() => {
    if (!userId) {
      // 登出 → 重置初始 sync 狀態,取消未跑完的 push
      initialSyncDoneForUserRef.current = null;
      allowAutoPushRef.current = false;
      cancelPendingPush();
      return;
    }
    if (initialSyncDoneForUserRef.current === userId) return; // 已跑過

    (async () => {
      try {
        const remote = await fetchRemoteMeta(userId);

        if (remote.error) {
          // 網路 / RLS 錯誤 → 提示請連網路再試,不 fallback 本地
          setToast({
            message: '⚠️ 無法連接雲端,請檢查網路後重新整理',
            variant: 'error'
          });
          return; // 不 mark done,下次 mount / network resume 再試
        }

        if (remote.exists) {
          // 雲端有資料 → 一律拉,覆蓋本機(不問,不留本機優先選項)
          const r = await pullNow(userId);
          if (!r.ok) {
            setToast({
              message: '⚠️ 無法連接雲端,請檢查網路後重新整理',
              variant: 'error'
            });
            return;
          }
          // 階段 3.8 修:雲端覆蓋本地後重新初始化「純本地」狀態:
          //   - checkAndUpdateStreak 根據雲端來的 lastLoginDate 重算今日 todayClaimed
          //   - checkAndGenerate{Daily,Weekly}Tasks 確保今日 / 本週有任務
          //     (任務不從雲端拉,登入後本地若無就重抽)
          // 不能放任 pullNow 把本地任務清空變成空 tab。
          try {
            const after = await checkAndUpdateStreak();
            await checkAndGenerateDailyTasks();
            await checkAndGenerateWeeklyTasks();
            // 簽到 modal 跟雲端 streak 同步:若雲端今日已領,關掉啟動時跳出的 modal
            // (避免「點領取後才發現已領」的 stale UX)
            if (after.streak.todayClaimed) {
              setCheckInStreak(null);
            }
          } catch (e) {
            console.warn('[cloud] post-pull task re-init failed:', e);
          }
          setToast({ message: '☁ 已從雲端載入資料', variant: 'info' });
        } else {
          // 雲端是空的(全新帳號)→ 第一次把本機資料推上去當初始備份
          const hasLocal = await localHasUserData();
          if (hasLocal) {
            const r = await pushNow(userId);
            if (!r.ok) {
              setToast({
                message: '⚠️ 無法連接雲端,請檢查網路後重新整理',
                variant: 'error'
              });
              return;
            }
            setToast({ message: '☁ 已備份到雲端', variant: 'info' });
          }
        }

        initialSyncDoneForUserRef.current = userId;
        allowAutoPushRef.current = true;

        // 階段 5A:確保 user_profile row 存在(沒有就建,預設暱稱 + 唯一邀請碼)
        // 失敗只 warn 不擋主流程,useMyProfile 之後 mount 還會 retry
        try {
          await createProfileIfNeeded();
        } catch (e) {
          console.warn('[cloud] createProfileIfNeeded failed:', e);
        }
      } catch (e) {
        console.warn('[cloud] initial sync error:', e);
        setToast({
          message: '⚠️ 無法連接雲端,請檢查網路後重新整理',
          variant: 'error'
        });
      }
    })();
  }, [userId]);

  // ─── 雲端同步:本地 DB 變動 → debounced push ───
  useEffect(() => {
    if (!userId) return;
    if (!allowAutoPushRef.current) return; // 初始 sync 還沒完成,不能 push 把雲端清掉
    pushDebounced(userId);
  }, [
    userId,
    holdings,
    pets,
    transactions,
    snapshots,
    stocks,
    achievements,
    settings,
    userCultivation,
    cultivationLog,
    userLoginStreak,
    userTasksArr,
    milestoneCount,
    creatureUnlocksCount
  ]);

  /** PhaserMap 只送 petId 出來，這裡用 id 對應到 Pet + Stock */
  async function handlePetClickById(petId: string) {
    const pet = await db.pets.get(petId);
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
        consecutiveDays={settings.consecutiveDays}
        unlockedAchievements={unlockedCount}
        totalAchievements={ACHIEVEMENTS.length}
        lastPriceUpdateAt={settings.lastPriceUpdateAt}
        refreshing={refreshing}
        cloudSignedIn={!!userId}
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
        onFriends={() => setModal('friends')}
        onTrade={() => setModal('trade')}
        onRecords={() => setModal('records')}
        onSettings={() => setModal('settings')}
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
      />
      <FriendsModal
        open={modal === 'friends'}
        onClose={() => setModal(null)}
        onOpenSignIn={() => setModal('signin')}
      />
      <ProfileEditModal
        open={modal === 'profile'}
        onClose={() => setModal(null)}
        onActionComplete={postAction}
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
