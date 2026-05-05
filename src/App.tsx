import { useEffect, useState } from 'react';
import { seedIfEmpty } from '@/db';
import { CREATURES } from '@/data/creatures';
import { ACHIEVEMENTS } from '@/data/achievements';
import { STARTER_STOCKS } from '@/data/stocks';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    seedIfEmpty()
      .then(() => setReady(true))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-sand-100 no-select">
      <div className="text-center px-6 max-w-md">
        <h1 className="text-3xl font-bold mb-3 text-sand-300">山海經股票養成</h1>
        <p className="text-base text-gray-700 mb-6">神獸股市 · 台股版</p>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded text-sm mb-3">
            初始化失敗：{error}
          </div>
        )}

        {!ready && !error && <p className="text-sm text-gray-500">資料庫初始化中⋯</p>}

        {ready && (
          <div className="bg-white/70 rounded-lg p-4 text-left text-sm space-y-1 shadow">
            <div>✅ 七張表已建立、起手包已種入</div>
            <div>📦 神獸：{CREATURES.length} 種</div>
            <div>🏆 成就：{ACHIEVEMENTS.length} 個</div>
            <div>📊 起手台股：{STARTER_STOCKS.length} 檔</div>
            <div className="text-gray-500 mt-2">下一步：API client + 核心動作</div>
          </div>
        )}
      </div>
    </div>
  );
}
