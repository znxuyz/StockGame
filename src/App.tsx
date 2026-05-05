import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, seedIfEmpty } from '@/db';
import {
  isMarketOpen,
  ApiError,
  describeApiError
} from '@/api';
import {
  runPriceUpdate,
  computeSummary,
  recordDailySnapshot,
  runAchievementChecks,
  checkInLoginToday,
  type PortfolioSummary
} from '@/services';
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
import type { Pet, Stock } from '@/types';

type ModalKind = 'buy' | 'feed' | 'sell' | 'records' | 'settings' | 'pet' | null;

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
  const [marketOpen, setMarketOpen] = useState(isMarketOpen());

  // 更新盤中狀態（每分鐘）
  useEffect(() => {
    const t = setInterval(() => setMarketOpen(isMarketOpen()), 60_000);
    return () => clearInterval(t);
  }, []);

  // live data
  const settings = useLiveQuery(() => db.settings.get('singleton'), []);
  const holdings = useLiveQuery(() => db.holdings.toArray(), []);
  const prices = useLiveQuery(() => db.prices.toArray(), []);
  const achievements = useLiveQuery(() => db.achievements.toArray(), []);

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
    if (refreshing) return;
    setRefreshing(true);
    try {
      const r = await runPriceUpdate();
      await recordDailySnapshot();
      await postAction(
        `已更新 ${r.updated.length} 檔（${r.duringMarket ? '盤中即時' : '盤後收盤'}）` +
          (r.missing.length ? `，未抓到 ${r.missing.length} 檔` : '') +
          (r.evolved.length ? `，⭐ 進化 ${r.evolved.length}` : '') +
          (r.corrupted.length ? `，⚫ 黑化 ${r.corrupted.length}` : '') +
          (r.purified.length ? `，✨ 淨化 ${r.purified.length}` : '')
      );
    } catch (e) {
      const msg = e instanceof ApiError ? describeApiError(e) : e instanceof Error ? e.message : String(e);
      setToast({ message: `⚠️ 更新失敗：${msg}`, variant: 'error' });
    } finally {
      setRefreshing(false);
    }
  }

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

  const hasHoldings = (holdings ?? []).length > 0;

  return (
    <div className="w-full h-full flex flex-col bg-sand-100 no-select">
      <TopBar
        summary={summary}
        marketOpen={marketOpen}
        consecutiveDays={settings.consecutiveDays}
        unlockedAchievements={unlockedCount}
        totalAchievements={ACHIEVEMENTS.length}
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
    </div>
  );
}
