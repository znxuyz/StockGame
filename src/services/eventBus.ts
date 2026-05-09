/**
 * 輕量 event bus(階段 2.1 引入,給修為系統做飄字 + count-up 動畫用)。
 *
 * 為什麼自己寫不用 mitt/EventEmitter3:
 *  - 整個專案目前沒有任何 event-style 跨元件溝通需求,引第三方 npm 太重
 *  - 需求只有「emit + on/off」三個方法,< 50 行就夠
 *  - 用 generics 保持型別安全(emit 跟 on 必須匹配 payload 型別)
 *
 * 用法:
 *   eventBus.on<CultivationEarnEvent>('cultivation:earn', (data) => { ... });
 *   eventBus.emit<CultivationEarnEvent>('cultivation:earn', { amount: 5, ... });
 *
 * 使用前先在下方 EventMap 註冊事件名 + payload 型別,讓 TS 強制檢查。
 */

import type { CultivationReason } from '@/types';

/** 修為賺取事件 */
export interface CultivationEarnEvent {
  amount: number;
  reason: CultivationReason;
  reasonText: string;
}

/** 修為消耗事件(階段 4 才會用,先列好) */
export interface CultivationSpendEvent {
  amount: number;
  reason: CultivationReason;
  reasonText: string;
}

/** 集中註冊所有 event 名 + payload 型別,emit/on 都吃這張 map 確保型別 */
export interface EventMap {
  'cultivation:earn': CultivationEarnEvent;
  'cultivation:spend': CultivationSpendEvent;
}

type Listener<T> = (payload: T) => void;

class EventBus {
  private readonly listeners = new Map<keyof EventMap, Set<Listener<unknown>>>();

  on<K extends keyof EventMap>(event: K, fn: Listener<EventMap[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn as Listener<unknown>);
    return () => this.off(event, fn);
  }

  off<K extends keyof EventMap>(event: K, fn: Listener<EventMap[K]>): void {
    this.listeners.get(event)?.delete(fn as Listener<unknown>);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    // 抓 throw 避免一個 listener 噴錯就讓其他 listener 也壞掉
    for (const fn of set) {
      try {
        (fn as Listener<EventMap[K]>)(payload);
      } catch (e) {
        console.error(`[eventBus] listener for "${event}" threw:`, e);
      }
    }
  }
}

export const eventBus = new EventBus();
