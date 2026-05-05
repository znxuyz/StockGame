import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { getCreature } from '@/data/creatures';
import { formatPrice } from '@/utils';

interface HoldingPickerProps {
  /** 已選的代號 */
  value: string | null;
  onChange: (code: string) => void;
  emptyMessage?: string;
}

/**
 * 持倉清單下拉式選擇器（用於加碼/賣出彈窗）。
 * 顯示神獸 emoji + 名稱 + 股數 + 均價，方便玩家選對股票。
 */
export default function HoldingPicker({ value, onChange, emptyMessage }: HoldingPickerProps) {
  const holdings = useLiveQuery(
    () => db.holdings.orderBy('lastTransactionAt').reverse().toArray(),
    []
  );
  const stocks = useLiveQuery(() => db.stocks.toArray(), []);
  const pets = useLiveQuery(() => db.pets.filter((p) => !p.retiredAt).toArray(), []);

  if (!holdings || holdings.length === 0) {
    return (
      <div className="text-sm text-gray-500 bg-gray-50 px-3 py-4 rounded text-center">
        {emptyMessage ?? '目前沒有持倉'}
      </div>
    );
  }

  const stockMap = new Map((stocks ?? []).map((s) => [s.code, s]));
  const petMap = new Map((pets ?? []).map((p) => [p.code, p]));

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100 max-h-60 overflow-y-auto">
      {holdings.map((h) => {
        const stock = stockMap.get(h.code);
        const pet = petMap.get(h.code);
        const species = pet ? getCreature(pet.speciesId) : undefined;
        const selected = value === h.code;
        return (
          <button
            key={h.code}
            type="button"
            onClick={() => onChange(h.code)}
            className={`w-full text-left px-3 py-2 flex items-center gap-3 ${
              selected ? 'bg-emerald-50' : 'bg-white hover:bg-gray-50'
            }`}
          >
            <span className="text-2xl">{species?.emoji ?? '❓'}</span>
            <div className="flex-1 text-sm">
              <div className="font-bold">
                {stock?.name ?? h.code}
                <span className="text-xs text-gray-500 ml-1">{h.code}</span>
              </div>
              <div className="text-xs text-gray-500">
                {h.shares} 股 · 均價 {formatPrice(h.avgCost)}
              </div>
            </div>
            {selected && <span className="text-emerald-600 text-lg">✓</span>}
          </button>
        );
      })}
    </div>
  );
}
