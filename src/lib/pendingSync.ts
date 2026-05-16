/**
 * 離線寫入排隊 + 連線恢復自動 drain(階段 4-C)。
 *
 * 設計取捨:**不做 per-op queue**,直接利用既有 `forceSyncAllToCloud()` 當
 * drainer。理由:
 *   - 各 Repository 樂觀寫已經把資料留在本機 Dexie(IndexedDB 持久化),
 *     資料本身不會掉
 *   - forceSyncAllToCloud 是 idempotent per-row upsert,跑一次把所有本機
 *     資料推上雲,效果等同 replay queue
 *   - 不需要 schema queue 表 / op type / 序列化 payload,降低複雜度
 *   - 唯一需要持久化的是「**有事要 drain**」這個 boolean flag
 *
 * 流程:
 *   1. 任何 Repository 上雲失敗 → markPendingSync() 寫 localStorage flag
 *   2. `online` 事件 fire / App boot online → drainPendingSync() 跑 forceSync
 *   3. forceSync 成功 → clearPendingSync()
 *   4. 仍有失敗 → flag 保留,下次 online 再試
 *
 * 注意:flag 在 localStorage,**多 tab 共用 + 跨 session 持久化**。
 */

import { forceSyncAllToCloud } from '@/repositories/syncAll';
import { eventBus } from '@/services/eventBus';

const PENDING_KEY = 'stockgame.pendingSync.v1';

export function markPendingSync(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PENDING_KEY, '1');
    }
  } catch {
    /* private mode / quota — drain 仍會在下次 online event 跑,
       只是不會在跨 session 邊界被觸發 */
  }
}

export function clearPendingSync(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(PENDING_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function hasPendingSync(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

/** 同 tick 內已啟動的 drain promise,避免 online event 重複 fire 時併發 */
let inflight: Promise<void> | null = null;

/**
 * 把所有本機 Dexie 資料推上雲(forceSyncAllToCloud)。
 *
 *  - 若不在 online 狀態 / flag 沒 set / 已有 inflight → no-op
 *  - 成功(0 失敗)→ 清 flag
 *  - 部分失敗(成功 < 嘗試)→ 保留 flag,下次 online 再試
 *  - 整個 throw → 保留 flag
 */
export async function drainPendingSync(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  if (!hasPendingSync()) return;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      // eslint-disable-next-line no-console
      console.log('[pendingSync] online — draining via forceSyncAllToCloud');
      const result = await forceSyncAllToCloud();
      if (result.ok && result.totalFailed === 0) {
        clearPendingSync();
        // eslint-disable-next-line no-console
        console.log(`[pendingSync] drain 完成 ${result.totalSucceeded}/${result.totalAttempted}`);
      } else {
        console.warn(
          `[pendingSync] drain 不完整(失敗 ${result.totalFailed} 筆),flag 保留`
        );
      }
    } catch (e) {
      console.warn('[pendingSync] drain threw:', e);
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/**
 * Repository 統一回報「雲端寫入失敗」入口。
 *
 * 行為:
 *   - markPendingSync()(localStorage flag,連線恢復時 drain)
 *   - eventBus emit toast,離線時 info 色 + 「連線後自動同步」文案,
 *     線上 5xx / 一般失敗用 error 色 + 「稍後自動重試」文案
 *   - console.warn 帶 label + error 給開發者
 *   - **不 rollback 本機資料** — 由 caller 決定保留 local(offline-first 預設)
 *
 * App.tsx eventBus 訂閱者已對同訊息做 30 秒 dedup,不會 spam。
 */
export function reportCloudWriteFailure(label: string, error: unknown): void {
  markPendingSync();
  const offline =
    typeof navigator !== 'undefined' && !navigator.onLine;
  console.warn(
    `[${label}] cloud write failed${offline ? ' (offline)' : ''}, kept local + marked pending:`,
    error
  );
  eventBus.emit('toast:show', {
    message: offline
      ? `📡 離線中 — ${label}已寫入本機,連線後自動同步`
      : `⚠ ${label}同步失敗 — 稍後自動重試`,
    variant: offline ? 'info' : 'error'
  });
}

/**
 * 在 App 入口呼叫一次,監聽 `online` event 自動 drain。
 *
 * 回傳 detach function,unmount 時呼叫解除 listener。
 */
export function attachPendingSyncListener(): () => void {
  if (typeof window === 'undefined') return () => {};

  const onOnline = () => {
    void drainPendingSync();
  };
  window.addEventListener('online', onOnline);

  // App 啟動時若已 online 且有 pending,也立刻 drain
  if (navigator.onLine && hasPendingSync()) {
    void drainPendingSync();
  }

  return () => window.removeEventListener('online', onOnline);
}
