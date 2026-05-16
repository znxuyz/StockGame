/**
 * 全域線上狀態 hook(階段 4-C 離線支援)。
 *
 * 用 `navigator.onLine` + `online` / `offline` 事件偵測。**注意 navigator.onLine
 * 不完全可靠**(Linux 上可能說 true 但實際打不到雲端;Wi-Fi 連線但 DNS 解析
 * 失敗 也說 online)。對 80% case 夠用,真網路狀態最終以 fetch 結果為準。
 *
 * 用法:
 *   const online = useOnline();
 *   <button disabled={!online}>...</button>
 */
import { useEffect, useState } from 'react';

export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
