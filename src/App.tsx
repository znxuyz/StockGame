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
  type PortfolioSummary
} from '@/services';
import {
  pullNow,
  pushNow,
  pushDebounced,
  cancelPendingPush,
  fetchRemoteMeta,
  localHasUserData
} from '@/services/cloudSync';
import { useAuth } from '@/lib/auth';
import { ACHIEVEMENTS } from '@/data/achievements';
import TopBar from '@/components/TopBar';
import BottomBar from '@/components/BottomBar';
import PhaserMap from '@/game/PhaserMap';
import BuyModal from '@/components/BuyModal';
import FeedModal from '@/components/FeedModal';
import SellModal from '@/components/SellModal';
// 紀錄頁靠 Recharts，500KB+，按下「紀錄」才載入
const RecordsModal = lazy(() => import('@/components/RecordsModal'));
import SettingsModal from '@/components/SettingsModal';
import PetInfoModal from '@/components/PetInfoModal';
import Toast from '@/components/Toast';
import InstallPrompt from '@/components/InstallPrompt';
import SignInModal from '@/components/SignInModal';
import type { Pet, Stock } from '@/types';

type ModalKind = 'buy' | 'feed' | 'sell' | 'records' | 'settings' | 'pet' | 'signin' | null;

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
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          初始化失敗：{seedError}
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-sand-100 text-gray-500">
        資料庫初始化中⋯
      </div>
    );
  }

  return <Game />;
}

function Game() {
  const [modal, setModal] = useState<ModalKind>(null);
  const [petTarget, setPetTarget] = useState<{ pet: Pet; stock: Stock } | null>(null);

  const [toast, setToast] = useState<{ message: string; variant: 'info' | 'error' } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [marketStatus, setMarketStatus] = useState<MarketStatus>(getMarketStatus());
  /** 用 ref 而非 state 鎖併發,避免 silentRefresh closure 拿到 stale 的 refreshing */
  const refreshingRef = useRef(false);

  // 雲端同步狀態
  const { session } = useAuth();
  const userId = session?.user?.id;
  /** 同一 user 的初始 pull/push 只跑一次,避免 React strict mode / re-render 重觸發 */
  const initialSyncDoneForUserRef = useRef<string | null>(null);
  /** 阻擋初始 sync 完成前的 push(避免空本地把雲端清掉) */
  const allowAutoPushRef = useRef(false);

  // 每分鐘更新 market status(open / after-hours / weekend / holiday)
  useEffect(() => {
    const t = setInterval(() => setMarketStatus(getMarketStatus()), 60_000);
    return () => clearInterval(t);
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

  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  useEffect(() => {
    computeSummary().then(setSummary);
  }, [holdings, prices]);

  const unlockedCount = useMemo(
    () => (achievements ?? []).filter((a) => a.unlockedAt).length,
    [achievements]
  );

  // 共用：動作完成後刷新成就 + 顯示 toast
  async function postAction(message: string) {
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
  }, [userId, holdings, pets, transactions, snapshots, stocks, achievements, settings]);

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
      />

      <PhaserMap
        onPetClick={handlePetClickById}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      <BottomBar
        onBuy={() => setModal('buy')}
        onFeed={() => setModal('feed')}
        onSell={() => setModal('sell')}
        onRecords={() => setModal('records')}
        onSettings={() => setModal('settings')}
        hasHoldings={hasHoldings}
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
        onClose={() => setModal(null)}
        settings={settings}
        onActionComplete={postAction}
      />
      <SellModal
        open={modal === 'sell'}
        onClose={() => setModal(null)}
        settings={settings}
        onActionComplete={postAction}
      />
      <Suspense fallback={null}>
        {modal === 'records' && (
          <RecordsModal open onClose={() => setModal(null)} />
        )}
      </Suspense>
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
      />

      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant}
        onDismiss={() => setToast(null)}
      />

      {/* PWA 安裝提示(iOS Safari 顯示加入主畫面說明、Android 顯示安裝鈕;
          已裝桌面或 7 天內被關掉就不顯示) */}
      <InstallPrompt />
    </div>
  );
}
