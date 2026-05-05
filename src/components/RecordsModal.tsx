import { useLiveQuery } from 'dexie-react-hooks';
import Modal from './Modal';
import { db } from '@/db';
import { ACHIEVEMENTS } from '@/data/achievements';
import { formatInt, formatPrice, formatSigned, formatPercent } from '@/utils';

interface RecordsModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 紀錄頁（佔位版本）。
 * 第 8 個 commit 會在這裡接上 Recharts 圖表，本版本先顯示：
 *  - 交易明細（Transactions 表倒序）
 *  - 成就清單（已解鎖 + 進度）
 *  - 圖鑑（已收集神獸）
 */
export default function RecordsModal({ open, onClose }: RecordsModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="紀錄">
      <div className="p-4 space-y-4">
        <Achievements />
        <Transactions />
        <PetCollection />
        <p className="text-xs text-center text-gray-400 italic pt-3">
          下一個 commit 會在這裡加上累積報酬曲線、月度損益、夏普比率等圖表
        </p>
      </div>
    </Modal>
  );
}

function Achievements() {
  const progress = useLiveQuery(() => db.achievements.toArray(), []);
  const map = new Map((progress ?? []).map((a) => [a.id, a]));
  const unlockedCount = (progress ?? []).filter((a) => a.unlockedAt).length;

  return (
    <section>
      <h3 className="font-bold text-sm mb-2">
        🏆 成就 ({unlockedCount}/{ACHIEVEMENTS.length})
      </h3>
      <div className="space-y-1">
        {ACHIEVEMENTS.map((def) => {
          const p = map.get(def.id);
          const unlocked = !!p?.unlockedAt;
          const cur = p?.current ?? 0;
          return (
            <div
              key={def.id}
              className={`px-3 py-2 rounded text-xs flex items-center justify-between ${
                unlocked ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-200'
              }`}
            >
              <div className="flex-1">
                <div className={unlocked ? 'font-bold text-amber-800' : 'text-gray-700'}>
                  {unlocked ? '🏅' : '🔒'} {def.name}
                </div>
                <div className="text-gray-500 mt-0.5">{def.description}</div>
              </div>
              <div className="text-right text-gray-500 ml-2">
                {cur}/{def.target}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Transactions() {
  const txns = useLiveQuery(() => db.transactions.orderBy('timestamp').reverse().limit(50).toArray(), []);
  const stocks = useLiveQuery(() => db.stocks.toArray(), []);
  const stockMap = new Map((stocks ?? []).map((s) => [s.code, s]));

  return (
    <section>
      <h3 className="font-bold text-sm mb-2">📜 交易明細（最近 50 筆）</h3>
      {(txns ?? []).length === 0 ? (
        <p className="text-xs text-gray-500 text-center py-4">還沒有任何交易</p>
      ) : (
        <div className="space-y-1">
          {(txns ?? []).map((t) => {
            const stock = stockMap.get(t.code);
            const typeLabel =
              t.type === 'buy' ? '🥚 買入' : t.type === 'feed' ? '🍖 加碼' : '📦 賣出';
            return (
              <div key={t.id} className="px-3 py-2 bg-white border border-gray-200 rounded text-xs">
                <div className="flex justify-between">
                  <span>
                    {typeLabel}{' '}
                    <b>
                      {stock?.name ?? t.code} <span className="text-gray-500">{t.code}</span>
                    </b>
                  </span>
                  <span className="text-gray-400">
                    {new Date(t.timestamp).toLocaleString('zh-TW', { hour12: false })}
                  </span>
                </div>
                <div className="text-gray-600 mt-0.5">
                  {t.shares} 股 @ {formatPrice(t.price)} · 手續費 {formatInt(t.fee)}
                  {t.tax > 0 && ` · 證交稅 ${formatInt(t.tax)}`}
                </div>
                {t.type === 'sell' && (
                  <div
                    className={`mt-0.5 font-bold ${
                      t.realizedPnL >= 0 ? 'text-tw-up' : 'text-tw-down'
                    }`}
                  >
                    已實現 {formatSigned(t.realizedPnL)} ({formatPercent(t.realizedPnL / (t.price * t.shares))})
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PetCollection() {
  const pets = useLiveQuery(() => db.pets.toArray(), []);
  const speciesIds = new Set((pets ?? []).map((p) => p.speciesId));

  return (
    <section>
      <h3 className="font-bold text-sm mb-2">📚 神獸圖鑑 ({speciesIds.size} 種)</h3>
      <p className="text-xs text-gray-500">
        買進新檔股票才會解鎖新神獸；賣光的也會永久保留在這裡。
      </p>
    </section>
  );
}
