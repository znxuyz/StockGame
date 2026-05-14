/**
 * 階段 2 試水溫 — user_settings 的 Repository 抽象層。
 *
 * 目的:把 `db.settings.xxx` 全部包進一層 Repository,未來資料源從 Dexie 換成
 * Supabase 時只需要動這個檔(換成 SupabaseSettingsRepo 實作同 interface)。
 *
 * 規則:
 *  - 內部一律 Dexie,**不接 Supabase**(這次純抽象,沒切換資料源)
 *  - 不做任何泛型 / Factory / Result wrapper / cache,就是個直白 wrapper
 *  - `patch()` 為 partial update sugar:get → merge → put,讓 caller 不必自己組
 *
 * 例外 — `cloudSync.ts` 的 escape hatch:
 *  cloudSync 把 `db.settings` 當「table reference」放進
 *  `db.transaction('rw', [...tables], ...)`,這是 Dexie 的 transactional 範疇
 *  概念,任何 Repository 抽象都包不掉。從本檔額外導出 `dexieSettingsTable`,
 *  cloudSync 用它取代直接 `db.settings`,維持「`src/` 內 `db.settings` 全 0
 *  (除了本檔)」的驗收條件。Supabase 切換時 cloudSync 整檔會被改寫,
 *  此 escape hatch 一起消失。
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import type { Settings } from '@/types';

/** 公開的 Repository interface — 未來 Supabase impl 也照這個 */
export interface SettingsRepository {
  /** 拿 singleton 設定,沒設定(全新使用者)→ undefined */
  get(): Promise<Settings | undefined>;
  /** 整筆覆蓋 */
  put(settings: Settings): Promise<void>;
  /** partial update:取現有 → merge → put。沒既有 settings 則 noop */
  patch(partial: Partial<Settings>): Promise<void>;
  /** seed.ts 判斷「全新使用者」用 */
  count(): Promise<number>;
}

class DexieSettingsRepo implements SettingsRepository {
  async get(): Promise<Settings | undefined> {
    return db.settings.get('singleton');
  }

  async put(settings: Settings): Promise<void> {
    await db.settings.put(settings);
  }

  async patch(partial: Partial<Settings>): Promise<void> {
    const current = await db.settings.get('singleton');
    if (!current) return;
    await db.settings.put({ ...current, ...partial });
  }

  async count(): Promise<number> {
    return db.settings.count();
  }
}

/** Singleton — caller 一律 import 這個 */
export const settingsRepo: SettingsRepository = new DexieSettingsRepo();

/** React hook — 取代 `useLiveQuery(() => db.settings.get('singleton'), [])` */
export function useSettings(): Settings | undefined {
  return useLiveQuery(() => settingsRepo.get(), []);
}

/**
 * Dexie transactional escape hatch — **只給 cloudSync.ts 用**。
 *
 * 用途:`db.transaction('rw', [...tables], async () => {...})` 需要實體 Dexie
 * Table 才能納入交易範圍。Repository 抽象沒辦法表達這層 — 純抽象路徑無法保證
 * 原子性。直到 cloudSync 整個改寫成 Supabase RPC(階段 3+),這個 escape hatch
 * 不會消失。
 */
export const dexieSettingsTable = db.settings;
