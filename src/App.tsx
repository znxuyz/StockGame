import { useEffect, useState } from 'react';
import { seedIfEmpty } from '@/db';
import {
  isMarketOpen,
  lookupStock,
  fetchPrices,
  ApiError,
  describeApiError
} from '@/api';
import type { Stock, StockPrice } from '@/types';

interface DemoRow {
  stock: Stock;
  price?: StockPrice;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [rows, setRows] = useState<DemoRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marketOpen, setMarketOpen] = useState(isMarketOpen());

  useEffect(() => {
    seedIfEmpty()
      .then(() => setReady(true))
      .catch((e) => setSeedError(e instanceof Error ? e.message : String(e)));
  }, []);

  // 每分鐘更新一次盤中狀態顯示
  useEffect(() => {
    const t = setInterval(() => setMarketOpen(isMarketOpen()), 60_000);
    return () => clearInterval(t);
  }, []);

  async function handleLookup() {
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const stock = await lookupStock(code);
      const result = await fetchPrices({
        targets: [{ code: stock.code, market: stock.market }]
      });
      const price = result.prices.find((p) => p.code === stock.code);
      setRows((prev) => {
        const filtered = prev.filter((r) => r.stock.code !== stock.code);
        return [{ stock, price }, ...filtered];
      });
      setCode('');
    } catch (e) {
      setError(e instanceof ApiError ? describeApiError(e) : String(e));
    } finally {
      setBusy(false);
    }
  }

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
      <div className="w-full h-full flex items-center justify-center bg-sand-100">
        <p className="text-gray-500">資料庫初始化中⋯</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-auto bg-sand-100 no-select">
      <div className="max-w-md mx-auto px-4 py-6">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-sand-300">山海經股市 · API 測試</h1>
          <p className="text-xs text-gray-500">
            盤中狀態：
            <span className={marketOpen ? 'text-tw-up font-bold' : 'text-gray-600'}>
              {marketOpen ? '🟢 盤中（即時報價）' : '⚪ 盤後／假日（最新收盤）'}
            </span>
          </p>
        </header>

        <div className="bg-white/80 rounded-lg p-3 shadow mb-3">
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              placeholder="輸入股票代號 (例：2330, 0050, 5269)"
              className="flex-1 px-3 py-2 rounded border border-gray-300 bg-white text-base"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
              disabled={busy}
            />
            <button
              type="button"
              className="px-4 py-2 bg-sand-300 text-white rounded font-bold disabled:opacity-50"
              onClick={handleLookup}
              disabled={busy || !code.trim()}
            >
              {busy ? '查詢中…' : '查詢'}
            </button>
          </div>
          {error && (
            <p className="text-tw-down text-sm mt-2 bg-red-50 px-2 py-1 rounded">⚠️ {error}</p>
          )}
        </div>

        <div className="space-y-2">
          {rows.map((r) => (
            <PriceRow key={r.stock.code} stock={r.stock} price={r.price} />
          ))}
          {rows.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-8">查詢一個代號試試看</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PriceRow({ stock, price }: DemoRow) {
  const up = price && price.change > 0;
  const down = price && price.change < 0;
  const colorClass = up ? 'text-tw-up' : down ? 'text-tw-down' : 'text-tw-flat';

  return (
    <div className="bg-white rounded-lg p-3 shadow flex items-center justify-between">
      <div>
        <div className="font-bold">
          <span className="text-gray-500 mr-2">{stock.code}</span>
          {stock.name}
        </div>
        <div className="text-xs text-gray-500">
          {stock.market}
          {price && ` · ${price.source === 'intraday' ? '即時' : '收盤'}`}
        </div>
      </div>
      {price ? (
        <div className={`text-right ${colorClass}`}>
          <div className="text-lg font-bold">{price.currentPrice.toFixed(2)}</div>
          <div className="text-xs">
            {price.change >= 0 ? '+' : ''}
            {price.change.toFixed(2)} ({(price.changePercent * 100).toFixed(2)}%)
          </div>
        </div>
      ) : (
        <div className="text-gray-400 text-sm">無報價</div>
      )}
    </div>
  );
}
