/**
 * 階段 3B 試水溫 — settings 改成「雲端為主 + 本機快取」(stale-while-revalidate)。
 *
 * 角色變化:
 *  - 階段 2:Dexie 是唯一資料源,Repository 只是 wrapper
 *  - 階段 3B:Supabase `user_settings` 表是真實來源,本機 Dexie 降級為「加速 cache」
 *
 * 為什麼:
 *  - 一裝置改主題色 → 另一裝置立刻看見(blob sync 要 pullNow 才會更新)
 *  - 雲端可單欄位 query / 部分 update,blob 做不到
 *
 * Public interface 不變(`get` / `put` / `patch` / `count`),caller 完全無感。
 *
 * ──────────── 樂觀更新策略 ────────────
 *
 *  `put` / `patch`:
 *    1. 立刻更新本機(UI 即時反應)
 *    2. 同步 upsert 雲端
 *    3. 雲端失敗 → rollback 本機 + throw「設定同步失敗,請重試」
 *
 *  `get`:
 *    1. 本機 cache 立刻返回(stale)
 *    2. 背景非同步呼叫雲端 revalidate(while-revalidate)
 *    3. 雲端較新 → 寫回本機(useLiveQuery 自動重渲染 UI)
 *    4. 本機較新 → 現階段只 console.warn(階段 3D 處理 reconcile 上傳)
 *
 * ──────────── 過渡期注意事項 ────────────
 *
 *  - cloudSync.ts 仍然在 `user_data.blob` 寫整包 settings,跟新表並存。階段 3D
 *    完成後 cloudSync 整檔改寫,blob 退場
 *  - cloudSync 的 pullNow 在登入時把 blob.settings 寫進 db.settings(沒 updatedAt
 *    → 視為 0)。settingsRepo 隨後 revalidate 時雲端 user_settings 的版本贏
 *    → 本機被覆蓋成 user_settings 的值(可能是 trigger 建的預設,或別台裝置
 *      已更新過的值)。這是正確行為:user_settings 是新真實來源
 *
 * ──────────── 開發模式 fallback ────────────
 *
 *  `isCloudConfigured=false` → 退回階段 2 的 Dexie-only 行為(`DexieSettingsRepo`)。
 *  讓 dev 環境沒設 env 也能跑(production 必然 `true`,不會走這條)。
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { supabase, isCloudConfigured } from '@/lib/supabase';
import type { Settings, HudTheme } from '@/types';

// ─── 公開 interface(不變)─────────────────────────────

export interface SettingsRepository {
  get(): Promise<Settings | undefined>;
  put(settings: Settings): Promise<void>;
  patch(partial: Partial<Settings>): Promise<void>;
  count(): Promise<number>;
}

// ─── helper:取目前 user_id ────────────────────────────

/**
 * 從 `supabase.auth.getSession()` 拿目前登入 user_id。
 * 非 hook,可在 Repository 內呼叫。沒登入 → throw。
 *
 * Note:這個 helper 假設 auth 已 ready(階段 3A 的 AuthGate 已 enforce 玩家
 * 進到 Game 必定已 signed in)。理論上 auth 仍可能在 race 下回 null
 * (token expired exactly during a write),caller 看到 throw 即可。
 */
async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(`auth.getSession 失敗:${error.message}`);
  const uid = data.session?.user?.id;
  if (!uid) throw new Error('未登入');
  return uid;
}

// ─── 雲端 ↔ 本機 mapper ──────────────────────────────

/**
 * 雲端 `user_settings` row 的 shape。snake_case 對應 PG 表欄位。
 * 跟 Dexie `Settings` 一對一(欄位數、型別都對齊),只是命名 convention 不同。
 *
 * `id: 'singleton'` 是純本機概念(Dexie 主鍵需要),雲端用 `user_id` 當 PK
 * 不需要這個欄位。`updated_at` 雲端有(PG trigger 自動 touch),本機是 Repository
 * 自己塞 `updatedAt: Date.now()`。
 */
interface RemoteSettings {
  user_id: string;
  brokerage_fee_discount: number;
  brokerage_min_fee: number;
  sound_enabled: boolean;
  last_price_update_at: number | null;
  last_snapshot_date: string | null;
  player_name: string | null;
  created_at_ms: number;
  last_login_date: string | null;
  consecutive_days: number;
  max_consecutive_days: number;
  unlocked_backgrounds: string[];
  current_background: string;
  hud_theme: HudTheme;
  unlocked_hud_themes: HudTheme[];
  updated_at: string; // ISO timestamptz
}

/** 雲端 → 本機。`updatedAt` 用雲端 `updated_at` 的 ms */
function toLocal(remote: RemoteSettings): Settings {
  return {
    id: 'singleton',
    brokerageFeeDiscount: remote.brokerage_fee_discount,
    brokerageMinFee: remote.brokerage_min_fee,
    soundEnabled: remote.sound_enabled,
    lastPriceUpdateAt: remote.last_price_update_at ?? undefined,
    lastSnapshotDate: remote.last_snapshot_date ?? undefined,
    playerName: remote.player_name ?? undefined,
    createdAt: remote.created_at_ms,
    lastLoginDate: remote.last_login_date ?? undefined,
    consecutiveDays: remote.consecutive_days,
    maxConsecutiveDays: remote.max_consecutive_days,
    unlockedBackgrounds: remote.unlocked_backgrounds,
    currentBackground: remote.current_background,
    hudTheme: remote.hud_theme,
    unlockedHudThemes: remote.unlocked_hud_themes,
    updatedAt: new Date(remote.updated_at).getTime()
  };
}

/** 本機 → 雲端 upsert payload。`user_id` caller 帶進 */
function toRemote(
  local: Settings,
  userId: string
): Omit<RemoteSettings, 'updated_at'> {
  return {
    user_id: userId,
    brokerage_fee_discount: local.brokerageFeeDiscount,
    brokerage_min_fee: local.brokerageMinFee,
    sound_enabled: local.soundEnabled,
    last_price_update_at: local.lastPriceUpdateAt ?? null,
    last_snapshot_date: local.lastSnapshotDate ?? null,
    player_name: local.playerName ?? null,
    created_at_ms: local.createdAt,
    last_login_date: local.lastLoginDate ?? null,
    consecutive_days: local.consecutiveDays,
    max_consecutive_days: local.maxConsecutiveDays,
    unlocked_backgrounds: local.unlockedBackgrounds ?? ['default'],
    current_background: local.currentBackground ?? 'default',
    hud_theme: local.hudTheme ?? 'default',
    unlocked_hud_themes: local.unlockedHudThemes ?? ['default']
  };
}

// ─── Dexie-only impl(dev fallback / 階段 2 行為)─────

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

// ─── Cloud-first impl ────────────────────────────────

/**
 * 防 `useLiveQuery` 每次 render 都重打雲端 — 至少間隔這麼久才允許下一次 revalidate。
 * 10 秒夠涵蓋一波 React rerender 風暴,又不會讓「另一裝置改設定」感知太慢
 * (玩家切回此裝置時很可能停留超過 10 秒)。
 */
const REVALIDATE_INTERVAL_MS = 10_000;
let lastRevalidateAt = 0;

class CloudFirstSettingsRepo implements SettingsRepository {
  async get(): Promise<Settings | undefined> {
    const local = await db.settings.get('singleton');

    // 背景 revalidate(fire-and-forget,有 throttle 防 rerender 風暴)
    void this.scheduleRevalidate(local);

    if (local) return local;

    // 本機沒資料(理論上 seedIfEmpty 已跑,實務上極罕見)→ await 雲端
    try {
      return await this.fetchFromCloud();
    } catch (e) {
      console.warn('[settingsRepo] cloud fetch failed for empty local:', e);
      return undefined;
    }
  }

  async put(settings: Settings): Promise<void> {
    const previous = await db.settings.get('singleton');
    const stamped: Settings = { ...settings, updatedAt: Date.now() };

    // 1. 樂觀更新本機 — UI 立刻反應
    await db.settings.put(stamped);

    // 2. upsert 雲端
    try {
      await this.uploadToCloud(stamped);
    } catch (e) {
      // 3. rollback 本機
      if (previous) {
        await db.settings.put(previous);
      } else {
        await db.settings.delete('singleton');
      }
      throw new Error(
        `設定同步失敗,請重試:${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  async patch(partial: Partial<Settings>): Promise<void> {
    const current = await db.settings.get('singleton');
    if (!current) return;
    await this.put({ ...current, ...partial });
  }

  async count(): Promise<number> {
    return db.settings.count();
  }

  // ─ private ─

  private async scheduleRevalidate(local: Settings | undefined): Promise<void> {
    const now = Date.now();
    if (now - lastRevalidateAt < REVALIDATE_INTERVAL_MS) return;
    lastRevalidateAt = now;

    try {
      const remote = await this.fetchFromCloud();
      if (!remote) return;

      const localUpdatedAt = local?.updatedAt ?? 0;
      if (remote.updatedAt && remote.updatedAt > localUpdatedAt) {
        // 雲端較新 — 寫進本機;useLiveQuery 訂閱 db.settings 變動會自動 retrigger
        await db.settings.put(remote);
      } else if (local && localUpdatedAt > (remote.updatedAt ?? 0)) {
        // 本機較新 — 階段 3D 才上傳;這版只 console.warn
        console.warn(
          `[settingsRepo] local newer than cloud (local=${localUpdatedAt} > cloud=${remote.updatedAt}), reconcile deferred to 階段 3D`
        );
      }
      // 兩邊一樣新 → no-op
    } catch (e) {
      console.warn('[settingsRepo] revalidate failed:', e);
    }
  }

  /**
   * 從雲端拉,沒 row → seed 本機資料上去當初始(處理「舊用戶無 trigger backfill」場景)。
   * 完全沒本機資料 → 回 undefined(極罕見,seedIfEmpty 通常已先跑)。
   */
  private async fetchFromCloud(): Promise<Settings | undefined> {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return toLocal(data as RemoteSettings);

    // 雲端沒 row(舊用戶,trigger 沒回填過)→ 用本機資料 seed 上去
    const local = await db.settings.get('singleton');
    if (!local) return undefined;
    const stamped: Settings = { ...local, updatedAt: Date.now() };
    await this.uploadToCloud(stamped);
    return stamped;
  }

  private async uploadToCloud(settings: Settings): Promise<void> {
    const userId = await getCurrentUserId();
    const { error } = await supabase
      .from('user_settings')
      .upsert(toRemote(settings, userId), { onConflict: 'user_id' });
    if (error) throw new Error(error.message);
  }
}

// ─── factory + singleton ─────────────────────────────

/**
 * Production / 已設 Supabase env → CloudFirstSettingsRepo
 * Dev / 沒設 env       → DexieSettingsRepo(舊行為,離線可開發)
 */
export const settingsRepo: SettingsRepository = isCloudConfigured
  ? new CloudFirstSettingsRepo()
  : new DexieSettingsRepo();

/** React hook — 取代 `useLiveQuery(() => db.settings.get('singleton'), [])` */
export function useSettings(): Settings | undefined {
  return useLiveQuery(() => settingsRepo.get(), []);
}

/**
 * Dexie transactional escape hatch — 只給 cloudSync.ts 用(階段 3D 改寫後消失)。
 * 維持「`src/` 內 `db.settings` 全 0(除了本檔)」驗收條件。
 */
export const dexieSettingsTable = db.settings;
