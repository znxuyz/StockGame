/**
 * 階段 3B 試水溫 — settings 改成「雲端為主 + 本機快取」(stale-while-revalidate)。
 *
 * 角色變化:
 *  - 階段 2:Dexie 是唯一資料源,Repository 只是 wrapper
 *  - 階段 3B:Supabase `user_settings` 表是真實來源,本機 Dexie 降級為「加速 cache」
 *
 * ──────────── 雲端 vs 本機 欄位範圍 ────────────
 *
 *  ✅ 上雲(`user_settings` 表 + cross-device 同步;`CLOUD_FIELDS`):
 *     - brokerageFeeDiscount / brokerageMinFee     手續費設定
 *     - soundEnabled                                音效
 *     - unlockedBackgrounds / currentBackground    家園背景(花修為解鎖)
 *     - hudTheme / unlockedHudThemes               HUD 主題(花修為解鎖)
 *
 *  ❌ 不上雲(本機 Dexie 才有,Supabase 表沒這些欄位):
 *     - consecutiveDays / maxConsecutiveDays /
 *       lastLoginDate                              連登 → 階段 3D 搬 loginStreakRepo
 *     - lastPriceUpdateAt / lastSnapshotDate        本機同步狀態,每裝置各自記
 *     - createdAt                                   帳戶元資料,沒必要跨裝置
 *     - playerName                                  deprecated,改用 user_profile.nickname
 *
 *  toRemote 用白名單(只送上面 ✅ 的欄位)避免發 unknown column 給 PostgREST。
 *  toLocal 回 merge with `existingLocal`,雲端只覆蓋外觀欄位,本機既有的連登
 *  / lastLoginDate 等保留。
 *
 *  ⚠️ 在 toRemote 加新欄位前,務必先在 Supabase `user_settings` 表 ALTER ADD
 *     COLUMN(否則 PostgREST schema cache 找不到欄位,寫入會 throw 卡住整個
 *     boot — 見階段 3B emergency fix)。
 *
 * ──────────── 樂觀更新策略 ────────────
 *
 *  `put` / `patch`:
 *    1. 立刻更新本機(UI 即時反應)
 *    2. 取 userId;沒登入(boot init 階段 auth 還沒 ready)→ 本機更新算完成,
 *       **不**上雲、**不** throw(讓 App 還能啟動)。等下次 auth ready 時的
 *       下一次 put 就會把本機狀態推上雲端
 *    3. 有 userId → upsert 雲端
 *    4. 雲端失敗(網路 / 4xx / RLS / 任何其他原因)→ rollback 本機 + throw
 *       「設定同步失敗,請重試」
 *
 *  `get`:
 *    1. 本機 cache 立刻返回(stale)
 *    2. 背景非同步 revalidate(while-revalidate,throttle 10s 防 rerender 風暴)
 *    3. 雲端較新 → 寫回本機(useLiveQuery 自動重渲染 UI)
 *    4. 本機較新 → 現階段只 console.warn(階段 3D 處理 reconcile 上傳)
 *
 *  整個 get() 包外層 try/catch,**永遠不會 throw** — 即便雲端錯也只 console.warn,
 *  回本機 cache 或 undefined(boot 容錯)。
 *
 * ──────────── 開發模式 fallback ────────────
 *
 *  `isCloudConfigured=false` → 退回階段 2 的 Dexie-only 行為(`DexieSettingsRepo`),
 *  讓 dev 環境沒設 env 也能跑(production 必然 `true`)。
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
 * 沒登入 → throw。caller 視情境決定要不要靜默(boot init 階段就靜默)。
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
 * 雲端表的 shape(snake_case 對應 PG 欄位)— 只有外觀設定的欄位。
 * 階段 3D 加新欄位時同步加進這裡 + Supabase migration ALTER。
 */
interface RemoteSettings {
  user_id: string;
  brokerage_fee_discount: number;
  brokerage_min_fee: number;
  sound_enabled: boolean;
  unlocked_backgrounds: string[];
  current_background: string;
  hud_theme: HudTheme;
  unlocked_hud_themes: HudTheme[];
  updated_at: string; // ISO timestamptz
}

/**
 * 雲端 → 本機。`existingLocal` 提供「本機限定欄位」的當前值
 * (連登 / lastLoginDate / lastPriceUpdateAt / lastSnapshotDate / createdAt /
 * playerName / consecutiveDays / maxConsecutiveDays),merge 保留之。
 *
 * 沒 `existingLocal`(極罕見:本機 Dexie 是空的且全新註冊)→ 用 Dexie schema
 * 預設值(從 seed.ts 對齊)。
 */
function toLocal(remote: RemoteSettings, existingLocal: Settings | undefined): Settings {
  const baseline: Settings = existingLocal ?? {
    id: 'singleton',
    brokerageFeeDiscount: 1.0,
    brokerageMinFee: 20,
    soundEnabled: true,
    createdAt: Date.now(),
    consecutiveDays: 0,
    maxConsecutiveDays: 0
  };
  return {
    ...baseline,
    // 只覆蓋雲端有對應的「外觀」欄位
    brokerageFeeDiscount: remote.brokerage_fee_discount,
    brokerageMinFee: remote.brokerage_min_fee,
    soundEnabled: remote.sound_enabled,
    unlockedBackgrounds: remote.unlocked_backgrounds,
    currentBackground: remote.current_background,
    hudTheme: remote.hud_theme,
    unlockedHudThemes: remote.unlocked_hud_themes,
    updatedAt: new Date(remote.updated_at).getTime()
  };
}

/**
 * 本機 → 雲端 upsert payload。**白名單**:只送雲端 schema 有的欄位,
 * 避免 PostgREST 報「column not found」(連登 / createdAt 等本機限定欄位不送)。
 */
function toRemote(
  local: Settings,
  userId: string
): Omit<RemoteSettings, 'updated_at'> {
  return {
    user_id: userId,
    brokerage_fee_discount: local.brokerageFeeDiscount,
    brokerage_min_fee: local.brokerageMinFee,
    sound_enabled: local.soundEnabled,
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
    // 整個 get 包外層 try/catch,**永遠不 throw**(boot 容錯)
    try {
      const local = await db.settings.get('singleton');

      // 背景 revalidate(fire-and-forget,有 throttle 防 rerender 風暴)
      void this.scheduleRevalidate(local);

      if (local) return local;

      // 本機沒資料(理論上 seedIfEmpty 已跑,實務上極罕見)→ 嘗試雲端
      return await this.fetchFromCloud();
    } catch (e) {
      console.error('[settingsRepo] get failed, returning undefined:', e);
      return undefined;
    }
  }

  async put(settings: Settings): Promise<void> {
    const previous = await db.settings.get('singleton');
    const stamped: Settings = { ...settings, updatedAt: Date.now() };

    // 1. 樂觀更新本機 — UI 立刻反應
    await db.settings.put(stamped);

    // 2. 取 userId — 沒登入(boot init 階段)→ 本機更新算完成,不上雲、不 throw
    let userId: string;
    try {
      userId = await getCurrentUserId();
    } catch (e) {
      console.warn(
        '[settingsRepo] not signed in — local-only write, will sync after next sign-in:',
        e
      );
      return;
    }

    // 3. upsert 雲端
    try {
      await this.uploadToCloud(stamped, userId);
    } catch (e) {
      // 4. rollback 本機
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

    // **Bug A 修正**:throttle 延後到 userId 拿到再蓋(同其他 repo)
    try {
      await getCurrentUserId();
    } catch {
      return;
    }
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
   * 完全沒本機資料且雲端也沒 → 回 undefined(極罕見,seedIfEmpty 通常已先跑)。
   *
   * 沒登入 → throw「未登入」(caller 端的 get() 外層 try/catch 會吞掉)。
   */
  private async fetchFromCloud(): Promise<Settings | undefined> {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const existingLocal = await db.settings.get('singleton');
    if (data) return toLocal(data as RemoteSettings, existingLocal);

    // 雲端沒 row(舊用戶,trigger 沒回填過)→ 用本機資料 seed 上去
    if (!existingLocal) return undefined;
    const stamped: Settings = { ...existingLocal, updatedAt: Date.now() };
    await this.uploadToCloud(stamped, userId);
    return stamped;
  }

  private async uploadToCloud(settings: Settings, userId: string): Promise<void> {
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
