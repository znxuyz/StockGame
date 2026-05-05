import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { getCreature } from '@/data/creatures';
import { formatSigned, formatPercent } from '@/utils';
import type { Pet, Stock, StockPrice } from '@/types';
import { isCorrupted } from '@/types';

interface MapPlaceholderProps {
  onPetClick: (pet: Pet, stock: Stock) => void;
  onRefresh: () => void;
  refreshing: boolean;
}

/**
 * MVP 階段的「沙漠地圖」佔位版本：
 *  - 每隻寵物以 emoji 顯示在沙漠背景上
 *  - 隨機散佈在格狀位置
 *  - 點擊開個股資訊
 *  - 右上角刷新按鈕
 *
 * 第 7 個 commit 會被換成 Phaser 場景（地圖可拖、寵物會走動）。
 */
export default function MapPlaceholder({ onPetClick, onRefresh, refreshing }: MapPlaceholderProps) {
  const holdings = useLiveQuery(() => db.holdings.toArray(), []);
  const pets = useLiveQuery(() => db.pets.filter((p) => !p.retiredAt).toArray(), []);
  const stocks = useLiveQuery(() => db.stocks.toArray(), []);
  const prices = useLiveQuery(() => db.prices.toArray(), []);

  const stockMap = new Map((stocks ?? []).map((s) => [s.code, s]));
  const priceMap = new Map((prices ?? []).map((p) => [p.code, p]));
  const petByCode = new Map((pets ?? []).map((p) => [p.code, p]));

  const items = (holdings ?? []).map((h) => ({
    holding: h,
    pet: petByCode.get(h.code),
    stock: stockMap.get(h.code),
    price: priceMap.get(h.code)
  }));

  return (
    <div className="relative flex-1 bg-gradient-to-b from-sand-50 to-sand-200 overflow-hidden">
      {/* 沙漠紋理 */}
      <DesertBackground />

      {/* 刷新按鈕 */}
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="absolute top-3 right-3 z-10 w-12 h-12 rounded-full bg-white/90 shadow-lg flex items-center justify-center text-2xl active:scale-90 transition-transform disabled:opacity-50"
        aria-label="更新股價"
      >
        {refreshing ? '⏳' : '🔄'}
      </button>

      {/* 寵物排列 */}
      <div className="relative z-0 p-3 grid grid-cols-3 gap-3 sm:gap-4 sm:grid-cols-4">
        {items.map(({ pet, stock, price, holding }) => {
          if (!pet || !stock) return null;
          const pnl = price ? price.currentPrice * holding.shares - holding.totalCost : 0;
          const ret = holding.totalCost > 0 ? pnl / holding.totalCost : 0;
          return (
            <PetTile
              key={pet.id}
              pet={pet}
              stock={stock}
              price={price}
              pnl={pnl}
              returnRate={ret}
              onClick={() => onPetClick(pet, stock)}
            />
          );
        })}
      </div>

      {items.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-gray-500 max-w-xs px-4">
            <p className="text-5xl mb-2">🏜️</p>
            <p className="text-sm">這片沙漠還很安靜⋯</p>
            <p className="text-xs mt-1">按下方「買入神獸」召喚第一隻吧</p>
          </div>
        </div>
      )}
    </div>
  );
}

function DesertBackground() {
  return (
    <svg
      className="absolute inset-0 w-full h-full opacity-30 pointer-events-none"
      preserveAspectRatio="none"
    >
      {Array.from({ length: 12 }).map((_, i) => (
        <circle
          key={i}
          cx={`${(i * 47) % 100}%`}
          cy={`${(i * 73) % 100}%`}
          r={3 + (i % 4)}
          fill="#d4a85a"
        />
      ))}
    </svg>
  );
}

interface PetTileProps {
  pet: Pet;
  stock: Stock;
  price?: StockPrice;
  pnl: number;
  returnRate: number;
  onClick: () => void;
}

const TIER_RING: Record<string, string> = {
  normal: 'ring-gray-300',
  spirit: 'ring-emerald-400 shadow-emerald-300/50',
  demon: 'ring-purple-400 shadow-purple-300/50',
  god: 'ring-amber-400 shadow-amber-300/50',
  saint: 'ring-orange-400 shadow-orange-300/50',
  celestial: 'ring-pink-400 shadow-pink-300/50',
  cursed1: 'ring-purple-900 shadow-purple-900/50',
  cursed2: 'ring-red-900 shadow-red-900/50',
  cursed3: 'ring-black shadow-black/70'
};

function PetTile({ pet, stock, price: _price, pnl, returnRate, onClick }: PetTileProps) {
  void _price;
  const species = getCreature(pet.speciesId);
  const corrupted = isCorrupted(pet);
  const ringClass = TIER_RING[pet.tier];
  const pnlSign = pnl >= 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center text-center active:scale-95 transition-transform"
    >
      {/* 損益標籤 */}
      <div
        className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-white shadow-sm border ${
          pnlSign ? 'text-tw-up border-red-200' : 'text-tw-down border-emerald-200'
        }`}
      >
        {formatSigned(pnl)}
      </div>
      {/* 神獸 */}
      <div
        className={`mt-1 w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/70 ring-4 ${ringClass} shadow-md flex items-center justify-center text-4xl sm:text-5xl ${
          corrupted ? 'grayscale' : ''
        }`}
      >
        {species?.emoji ?? '❓'}
      </div>
      {/* 名稱 + 報酬率 */}
      <div className="mt-1 text-xs">
        <div className="font-bold text-gray-700 leading-tight">{stock.name}</div>
        <div className={`text-[10px] ${pnlSign ? 'text-tw-up' : 'text-tw-down'}`}>
          {formatPercent(returnRate)}
        </div>
        <div className="text-[10px] text-gray-500">Lv.{pet.level}</div>
      </div>
    </button>
  );
}
