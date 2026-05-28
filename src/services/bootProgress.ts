/**
 * 啟動進度追蹤(階段 6.Y 全螢幕封面 splash 用)。
 *
 * 設計:
 *  - 把 boot 拆成 6 個有權重的 step(總和 100)
 *  - 每個 step 完成時呼叫 `markStep(id)`,SplashScreen 反映實際進度
 *  - `ready` = 全部 6 個 step 都完成才 true
 *  - 順序無所謂 — 設計上 step 可並行完成
 *  - **idempotent**:同 step 重複 mark 只記一次,React StrictMode double-invoke
 *    安全
 *  - **safety net**:30 秒後 `forceAllDone` 強制 unblock,避免任何 step 漏掉導致
 *    splash 永遠卡住(個別 service 已 try/catch,這層只是最後保險)
 *
 * 6 個 step 對應 App.tsx / AuthGate / Game / PwaUpdatePrompt 內現有的初始化邏輯:
 *  - `db-init`     Dexie seedIfEmpty 完成
 *  - `local-init`  啟動本機檢查(checkInLoginToday + runAchievementChecks + backfillSnapshots)
 *  - `pwa-ready`   PWA Service Worker 註冊 + 第一次 update check 解決完
 *  - `auth`        Supabase auth.getSession() 確定登入狀態(無論有無 session)
 *  - `cloud-sync`  forceFetchAllFromCloud 完成(沒登入則跳過)
 *  - `post-login`  streak / tasks / profile 等 post-login 初始化(沒登入則跳過)
 *
 * **更新中狀態**:當 PWA 偵測到新版 SW 並開始 `updateServiceWorker(true)`(會
 * trigger page reload)時,呼叫 `setUpdating()`,splash 改顯「正在更新到
 * 最新版本…」並停止進度顯示。reload 後重新 boot,新 bundle 直接接手。
 */

import { useEffect, useState } from 'react';

export type BootStepId =
  | 'db-init'
  | 'local-init'
  | 'pwa-ready'
  | 'auth'
  | 'cloud-sync'
  | 'post-login';

const WEIGHTS: Record<BootStepId, number> = {
  'db-init': 10,
  'local-init': 15,
  'pwa-ready': 15,
  auth: 10,
  'cloud-sync': 35,
  'post-login': 15
};

const TOTAL_WEIGHT = Object.values(WEIGHTS).reduce((a, b) => a + b, 0); // 100

/** 30 秒 safety net,避免某個 step 漏掉永遠卡住 */
const SAFETY_NET_MS = 30_000;

type Listener = () => void;

class BootProgressTracker {
  private done = new Set<BootStepId>();
  private updating = false;
  private listeners = new Set<Listener>();
  private safetyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.safetyTimer = setTimeout(() => {
      if (!this.isReady()) {
        console.warn('[bootProgress] 30s safety net triggered, force-marking remaining steps done');
        this.forceAllDone();
      }
    }, SAFETY_NET_MS);
  }

  markStep(id: BootStepId): void {
    if (this.done.has(id)) return;
    this.done.add(id);
    this.notify();
  }

  /** PWA 進入「自動套用更新 + reload」階段,splash 顯示「更新中」 */
  setUpdating(): void {
    if (this.updating) return;
    this.updating = true;
    this.notify();
  }

  getProgress(): number {
    let sum = 0;
    this.done.forEach((id) => {
      sum += WEIGHTS[id];
    });
    return Math.round((sum / TOTAL_WEIGHT) * 100);
  }

  isReady(): boolean {
    return (Object.keys(WEIGHTS) as BootStepId[]).every((k) => this.done.has(k));
  }

  isUpdating(): boolean {
    return this.updating;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private forceAllDone(): void {
    (Object.keys(WEIGHTS) as BootStepId[]).forEach((k) => this.done.add(k));
    this.notify();
  }

  private notify(): void {
    if (this.safetyTimer && this.isReady()) {
      clearTimeout(this.safetyTimer);
      this.safetyTimer = null;
    }
    this.listeners.forEach((l) => l());
  }
}

export const bootProgress = new BootProgressTracker();

export interface BootProgressSnapshot {
  progress: number;
  ready: boolean;
  updating: boolean;
}

export function useBootProgress(): BootProgressSnapshot {
  const [snapshot, setSnapshot] = useState<BootProgressSnapshot>(() => ({
    progress: bootProgress.getProgress(),
    ready: bootProgress.isReady(),
    updating: bootProgress.isUpdating()
  }));
  useEffect(() => {
    return bootProgress.subscribe(() => {
      setSnapshot({
        progress: bootProgress.getProgress(),
        ready: bootProgress.isReady(),
        updating: bootProgress.isUpdating()
      });
    });
  }, []);
  return snapshot;
}
