/**
 * 加權指數抓取 + 寫進 Dexie。
 *
 *  - ensureTaiexHistory:確保最近 N 天歷史在本地;缺哪幾個月就補
 *  - updateTaiexIntraday:抓最新值,寫入今天那筆(覆蓋)
 *
 * 失敗策略:silentRefresh 整套設計成失敗不彈 toast,所以這邊也跟著不丟
 * unhandled rejection,但**會 console.info 完整 diagnostic trace** —
 * 包含每月 URL / status / bar 數,出問題時 user 把 console 貼回來就能定位。
 *
 * **走 Cloudflare Pages Function proxy**(`/api/twse/v1/*` →
 * openapi.twse.com.tw)— 解決 CORS 根因。階段 4-C 加的 24h circuit-break
 * 在本檔已**拆除**,因為:
 *   - 有 proxy 後失敗率應該很低
 *   - 失敗時用戶看到 console.info 一條,不噴紅字,不需要 flag 防 spam
 *   - 24h block 反而會在「Proxy 部署順序卡住一次失敗」之後鎖死 UI,差體驗
 *
 * 模組載入時順手清舊版的 localStorage flag(v1 / v2 / v3),避免舊裝置
 * 升級後被歷史 flag 鎖住。
 */

import { db } from '@/db';
import { fetchTaiexQuote, fetchTaiexHistoryMonth } from '@/api';
import { isMarketOpen, getTaipeiDateString } from '@/api/marketHours';

const SYMBOL = 'TAIEX' as const;

/** 一次性清掉所有歷史版本的 circuit-break flag(本檔已不再使用) */
try {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('stockgame.marketIndex.disabled.v1');
    localStorage.removeItem('stockgame.marketIndex.disabled.v2');
    localStorage.removeItem('stockgame.marketIndex.disabled.v3');
  }
} catch {
  /* ignore */
}

/** YYYY-MM 字串(台北時區) */
function taipeiYearMonth(date: Date): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit'
  });
  // en-CA: "YYYY-MM-DD" 取前 7 chars 變 YYYY-MM
  return fmt.format(date).slice(0, 7);
}

/** 把 YYYY-MM 轉成 YYYYMMDD(月初) */
function yearMonthToOpenapiDate(ym: string): string {
  return ym.replace('-', '') + '01';
}

/**
 * 確保 TAIEX 歷史已經抓在本地。範圍**動態算**:
 *
 *  1. 找 db.transactions 內 type='buy' 最早一筆 → 從那天起算
 *     (跟 MarketCompareChart 的 baseline 對齊;否則只抓 90 天但 baseline
 *      在 200+ 天前,findClosestTaiexAtOrBefore(baseline) 拿不到資料 →
 *      chart `noTaiex: true` 線不畫)
 *  2. 沒任何 buy 交易 → fallback 抓 days(預設 90)天
 *  3. 算需要哪幾個月(YYYY-MM)
 *  4. 看 marketIndices 哪幾個月已有(>=15 筆 = 該月已抓過)
 *  5. 缺的月份逐個補(每月一個 API call)
 *
 * 上限 5 年 = 60 個月(防呆,避免 user 假資料 baseline 太遠抓爆 quota)。
 *
 * **完整 diagnostic 輸出**:每月一行,幫 debug 用。
 */
export async function ensureTaiexHistory(days: number = 90): Promise<{ fetchedMonths: number; error?: string }> {
  try {
    const now = new Date();
    // 找第一筆 buy 決定起點
    const buys = await db.transactions.where('type').equals('buy').toArray();
    const fromMs = buys.length > 0
      ? Math.min(...buys.map((t) => t.timestamp))
      : now.getTime() - days * 86_400_000;
    // 上限 5 年(防呆)
    const earliestAllowedMs = now.getTime() - 5 * 365 * 86_400_000;
    const startMs = Math.max(fromMs, earliestAllowedMs);

    const months = new Set<string>();
    // 從 startMs 倒推日,把覆蓋到的月份都收進來
    for (let ms = startMs; ms <= now.getTime(); ms += 86_400_000) {
      months.add(taipeiYearMonth(new Date(ms)));
    }
    // 補今天那個月(loop 可能差幾小時沒蓋到)
    months.add(taipeiYearMonth(now));
    const monthList = [...months].sort();
    // eslint-disable-next-line no-console
    console.info(`[marketIndex] ensureTaiexHistory(days=${days}) — 檢查 ${monthList.length} 個月: ${monthList.join(', ')}`);

    let fetched = 0;
    let skipped = 0;
    for (const ym of monthList) {
      const start = `${ym}-01`;
      const end = `${ym}-31`;
      const existing = await db.marketIndices
        .where('[symbol+date]')
        .between([SYMBOL, start], [SYMBOL, end], true, true)
        .count();
      const isCurrentMonth = ym === taipeiYearMonth(now);
      if (!isCurrentMonth && existing >= 15) {
        skipped++;
        continue;
      }

      const bars = await fetchTaiexHistoryMonth(yearMonthToOpenapiDate(ym));
      // eslint-disable-next-line no-console
      console.info(`[marketIndex] month ${ym}: 抓回 ${bars.length} 筆`);
      if (bars.length > 0) {
        await db.marketIndices.bulkPut(bars);
        fetched++;
      }
    }
    // eslint-disable-next-line no-console
    console.info(`[marketIndex] ensureTaiexHistory 完成:抓 ${fetched} 月,跳過 ${skipped} 月(本地已有)`);
    return { fetchedMonths: fetched };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[marketIndex] ensureTaiexHistory 失敗:${msg}`);
    return { fetchedMonths: 0, error: msg };
  }
}

/**
 * 抓 TAIEX 最新值,寫進今天那筆(覆蓋)。
 * 盤外時 source 標 'close',盤中標 'intraday'。
 *
 * 失敗只 console.warn,不丟錯誤 — silentRefresh 不希望雜訊彈 toast。
 */
export async function updateTaiexIntraday(): Promise<void> {
  try {
    const bar = await fetchTaiexQuote();
    if (!isMarketOpen()) bar.source = 'close';
    await db.marketIndices.put(bar);
  } catch (e) {
    console.warn('[marketIndex] updateTaiexIntraday 失敗:', e);
  }
}

/** 取得本地所有 TAIEX 紀錄,依日期升冪 */
export async function getAllTaiex(): Promise<
  Array<{ date: string; close: number; source: 'intraday' | 'close' }>
> {
  const all = await db.marketIndices.where('symbol').equals(SYMBOL).sortBy('date');
  return all.map((b) => ({ date: b.date, close: b.close, source: b.source }));
}

/** 取得最新一筆 TAIEX(若沒有回 null) */
export async function getLatestTaiex(): Promise<
  { date: string; close: number; source: 'intraday' | 'close' } | null
> {
  const all = await db.marketIndices.where('symbol').equals(SYMBOL).reverse().sortBy('date');
  const latest = all[0];
  if (!latest) return null;
  return { date: latest.date, close: latest.close, source: latest.source };
}

/** 今天的台北日期(給 UI 對齊用) */
export function todayDate(): string {
  return getTaipeiDateString();
}
