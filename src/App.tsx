import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, seedIfEmpty } from '@/db';
import {
  isMarketOpen,
  lookupStock,
  ApiError,
  describeApiError
} from '@/api';
import {
  buyOrFeed,
  sell,
  runPriceUpdate,
  computeSummary,
  type PortfolioSummary
} from '@/services';
import { getCreature } from '@/data/creatures';
import { formatInt, formatSigned, formatPercent, formatPrice } from '@/utils';
import type { Stock } from '@/types';

const TIER_LABEL: Record<string, string> = {
  normal: '凡獸境',
  spirit: '靈獸境',
  demon: '妖獸境',
  god: '神獸境',
  saint: '聖獸境',
  celestial: '仙獸境',
  cursed1: '凶獸一階',
  cursed2: '凶獸二階',
  cursed3: '凶獸三階'
};

const TIER_COLOR: Record<string, string> = {
  normal: 'text-tier-normal',
  spirit: 'text-tier-spirit',
  demon: 'text-tier-demon',
  god: 'text-tier-god',
  saint: 'text-tier-saint',
  celestial: 'text-tier-celestial',
  cursed1: 'text-tier-cursed-1',
  cursed2: 'text-tier-cursed-2',
  cursed3: 'text-tier-cursed-3'
};

export default function App() {
  const [ready, setReady] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);

  useEffect(() => {
    seedIfEmpty()
      .then(() => setReady(true))
      .catch((e) => setSeedError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (seedError) {
    return (
      <CenteredMessage>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          初始化失敗：{seedError}
        </div>
      </CenteredMessage>
    );
  }

  if (!ready) {
    return <CenteredMessage>資料庫初始化中⋯</CenteredMessage>;
  }

  return <DemoApp />;
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-sand-100 p-6 text-gray-600">
      {children}
    </div>
  );
}

function DemoApp() {
  const [code, setCode] = useState('');
  const [shares, setShares] = useState('1000');
  const [price, setPrice] = useState('100');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [marketOpen, setMarketOpen] = useState(isMarketOpen());
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);

  const holdings = useLiveQuery(() => db.holdings.toArray(), []);
  const prices = useLiveQuery(() => db.prices.toArray(), []);
  const pets = useLiveQuery(() => db.pets.filter((p) => !p.retiredAt).toArray(), []);
  const stocks = useLiveQuery(() => db.stocks.toArray(), []);
  const settings = useLiveQuery(() => db.settings.get('singleton'), []);

  useEffect(() => {
    const t = setInterval(() => setMarketOpen(isMarketOpen()), 60_000);
    return () => clearInterval(t);
  }, []);

  // 自動重算 summary
  useEffect(() => {
    computeSummary().then(setSummary);
  }, [holdings, prices]);

  const stockMap = new Map((stocks ?? []).map((s) => [s.code, s]));
  const priceMap = new Map((prices ?? []).map((p) => [p.code, p]));
  const petMap = new Map((pets ?? []).map((p) => [p.code, p]));

  function withBusy<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    setInfo(null);
    return fn()
      .catch((e) => {
        setError(e instanceof ApiError ? describeApiError(e) : e instanceof Error ? e.message : String(e));
        return undefined;
      })
      .finally(() => setBusy(false));
  }

  async function handleBuy() {
    if (!settings) return;
    await withBusy(async () => {
      const stock: Stock = stockMap.get(code.trim().toUpperCase()) ?? (await lookupStock(code));
      const result = await buyOrFeed({
        stock,
        shares: Number(shares),
        price: Number(price),
        feeConfig: { discount: settings.brokerageFeeDiscount, minFee: settings.brokerageMinFee },
        now: Date.now()
      });
      setInfo(
        `${result.transaction.type === 'buy' ? '買入' : '加碼'} ${stock.name} ${shares} 股 @ ${price}（手續費 NT$${result.transaction.fee}）`
      );
      setCode('');
    });
  }

  async function handleSell() {
    if (!settings) return;
    await withBusy(async () => {
      const result = await sell({
        code: code.trim().toUpperCase(),
        shares: Number(shares),
        price: Number(price),
        feeConfig: { discount: settings.brokerageFeeDiscount, minFee: settings.brokerageMinFee },
        now: Date.now()
      });
      setInfo(
        `賣出 ${result.transaction.shares} 股 @ ${price}（已實現損益 ${formatSigned(result.transaction.realizedPnL)}）`
      );
      setCode('');
    });
  }

  async function handleRefresh() {
    await withBusy(async () => {
      const r = await runPriceUpdate();
      setInfo(
        `已更新 ${r.updated.length} 檔（${r.duringMarket ? '盤中即時' : '盤後收盤'}）` +
          (r.missing.length ? `，未抓到：${r.missing.join(', ')}` : '') +
          (r.evolved.length ? `，進化：${r.evolved.length} 隻` : '') +
          (r.corrupted.length ? `，黑化：${r.corrupted.length} 隻` : '') +
          (r.purified.length ? `，淨化：${r.purified.length} 隻` : '')
      );
    });
  }

  return (
    <div className="w-full h-full overflow-auto bg-sand-100">
      <div className="max-w-md mx-auto px-4 py-4 space-y-3">
        <h1 className="text-xl font-bold text-sand-300 text-center">山海經股市 · MVP 測試</h1>

        {/* 總資產列 */}
        {summary && (
          <div className="bg-white rounded-lg p-3 shadow text-sm">
            <div className="grid grid-cols-2 gap-y-1">
              <span className="text-gray-500">持有檔數</span>
              <span className="text-right">{summary.holdingCount} 檔</span>
              <span className="text-gray-500">總市值</span>
              <span className="text-right">NT$ {formatInt(summary.totalMarketValue)}</span>
              <span className="text-gray-500">累積成本</span>
              <span className="text-right">NT$ {formatInt(summary.totalCost)}</span>
              <span className="text-gray-500">未實現損益</span>
              <span className={`text-right font-bold ${summary.unrealizedPnL >= 0 ? 'text-tw-up' : 'text-tw-down'}`}>
                {formatSigned(summary.unrealizedPnL)}
              </span>
              <span className="text-gray-500">已實現損益</span>
              <span className={`text-right ${summary.realizedPnL >= 0 ? 'text-tw-up' : 'text-tw-down'}`}>
                {formatSigned(summary.realizedPnL)}
              </span>
              <span className="text-gray-500">總報酬率</span>
              <span className={`text-right font-bold ${summary.returnRate >= 0 ? 'text-tw-up' : 'text-tw-down'}`}>
                {formatPercent(summary.returnRate)}
              </span>
              <span className="text-gray-500">當日損益</span>
              <span className={`text-right ${summary.todayPnL >= 0 ? 'text-tw-up' : 'text-tw-down'}`}>
                {formatSigned(summary.todayPnL)} ({formatPercent(summary.todayReturnRate)})
              </span>
            </div>
            <p className="text-xs text-center mt-2">
              {marketOpen ? '🟢 盤中（即時）' : '⚪ 盤外（收盤）'}
            </p>
          </div>
        )}

        {/* 操作面板 */}
        <div className="bg-white rounded-lg p-3 shadow space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="代號"
              className="px-2 py-2 rounded border border-gray-300 text-sm"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={busy}
            />
            <input
              type="number"
              placeholder="股數"
              className="px-2 py-2 rounded border border-gray-300 text-sm"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              disabled={busy}
            />
            <input
              type="number"
              step="0.01"
              placeholder="價格"
              className="px-2 py-2 rounded border border-gray-300 text-sm"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              className="py-2 bg-emerald-600 text-white rounded text-sm font-bold disabled:opacity-50"
              onClick={handleBuy}
              disabled={busy || !code || !shares || !price}
            >
              買入/加碼
            </button>
            <button
              type="button"
              className="py-2 bg-orange-500 text-white rounded text-sm font-bold disabled:opacity-50"
              onClick={handleSell}
              disabled={busy || !code || !shares || !price}
            >
              賣出
            </button>
            <button
              type="button"
              className="py-2 bg-sand-300 text-white rounded text-sm font-bold disabled:opacity-50"
              onClick={handleRefresh}
              disabled={busy}
            >
              更新股價
            </button>
          </div>
          {error && <p className="text-tw-down text-xs bg-red-50 px-2 py-1 rounded">⚠️ {error}</p>}
          {info && <p className="text-emerald-700 text-xs bg-emerald-50 px-2 py-1 rounded">✓ {info}</p>}
        </div>

        {/* 寵物清單 */}
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-gray-600">我的神獸（{pets?.length ?? 0} 隻）</h2>
          {(holdings ?? []).map((h) => {
            const pet = petMap.get(h.code);
            const stock = stockMap.get(h.code);
            const price = priceMap.get(h.code);
            const species = pet ? getCreature(pet.speciesId) : undefined;
            const marketValue = price ? price.currentPrice * h.shares : h.avgCost * h.shares;
            const pnl = marketValue - h.totalCost;
            const ret = h.totalCost > 0 ? pnl / h.totalCost : 0;
            return (
              <div key={h.code} className="bg-white rounded-lg p-3 shadow flex items-center gap-3">
                <div className="text-3xl">{species?.emoji ?? '❓'}</div>
                <div className="flex-1 text-sm">
                  <div className="font-bold">
                    {species?.name ?? '?'} <span className="text-xs text-gray-500">/{stock?.name}</span>
                  </div>
                  <div className="text-xs">
                    <span className={pet ? TIER_COLOR[pet.tier] : ''}>{pet ? TIER_LABEL[pet.tier] : ''}</span>
                    <span className="text-gray-500"> · 修為 Lv.{pet?.level ?? 1}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {h.shares} 股 @均價 {formatPrice(h.avgCost)}
                    {price && ` · 現價 ${formatPrice(price.currentPrice)}`}
                  </div>
                </div>
                <div className={`text-right text-sm ${pnl >= 0 ? 'text-tw-up' : 'text-tw-down'}`}>
                  <div className="font-bold">{formatSigned(pnl)}</div>
                  <div className="text-xs">{formatPercent(ret)}</div>
                </div>
              </div>
            );
          })}
          {(holdings ?? []).length === 0 && (
            <p className="text-center text-gray-400 text-xs py-6">輸入代號 + 股數 + 價格買第一檔試試</p>
          )}
        </div>
      </div>
    </div>
  );
}
