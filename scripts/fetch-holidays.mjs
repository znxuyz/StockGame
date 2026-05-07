#!/usr/bin/env node
// 從 ruyut/TaiwanCalendar 抓今年 + 明年的台灣國定假日,寫入 src/data/holidays.json。
// 給 GitHub Actions 每月跑;也可本機手跑(`node scripts/fetch-holidays.mjs`)。
//
// 資料源:
//  https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/<YEAR>.json
//  社群維護的繁中版人事行政總處公告整理,update 頻繁、欄位穩定。
//
//  每筆格式:{ date: "YYYYMMDD", week: "中文", isHoliday: bool, description: "..." }
//  我們只取 isHoliday === true 的日期,轉成 YYYY-MM-DD 字串集合。
//
// JSON 結構:
//  { fetchedAt, source, count, holidays: ["YYYY-MM-DD", ...] }

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const outPath = resolve(repoRoot, 'src', 'data', 'holidays.json');

const SOURCE_BASE = 'https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data';

async function fetchYear(year) {
  const url = `${SOURCE_BASE}/${year}.json`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'stockgame-holidays-bot/1.0' }
  });
  if (!res.ok) throw new Error(`${year}: HTTP ${res.status}`);
  return res.json();
}

/** YYYYMMDD → YYYY-MM-DD */
function toIsoDate(s) {
  if (!s || s.length !== 8) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

async function main() {
  const thisYear = new Date().getFullYear();
  const years = [thisYear, thisYear + 1]; // 今年 + 明年(年底時抓得到下一年)

  /** @type {Set<string>} */
  const holidays = new Set();
  const fetched = [];
  for (const year of years) {
    try {
      console.log(`[fetch-holidays] 抓 ${year} ...`);
      const data = await fetchYear(year);
      let yearCount = 0;
      let skippedWeekends = 0;
      for (const day of data) {
        if (!day.isHoliday) continue;
        // ruyut 把週末也標 isHoliday=true,我們的 isWeekday 已經處理週末,
        // 不需要把週末加進 holidays(只會讓 list 多 ~50% 雜訊)。
        // 真要過濾的是「週一到週五的假日」+「補上班日」(後者 isHoliday=false
        // 自動排除,不用特別處理)。
        if (day.week === '六' || day.week === '日') {
          skippedWeekends++;
          continue;
        }
        const iso = toIsoDate(String(day.date));
        if (!iso) continue;
        holidays.add(iso);
        yearCount++;
      }
      console.log(`  → ${yearCount} 個工作日假日(過濾掉 ${skippedWeekends} 個週末)`);
      fetched.push(year);
    } catch (e) {
      // 某年資料還沒上架(常見:上半年抓下一年會掛)→ 不算錯,只 warn
      console.warn(`  ⚠ ${year} 抓取失敗(可能還沒上架):${e.message}`);
    }
  }

  if (fetched.length === 0) {
    console.error('[fetch-holidays] 兩個年度都掛了,放棄寫檔');
    process.exit(1);
  }

  const sorted = [...holidays].sort();
  const output = {
    fetchedAt: new Date().toISOString(),
    source: `ruyut/TaiwanCalendar (years: ${fetched.join(', ')})`,
    count: sorted.length,
    holidays: sorted
  };

  // 跟舊檔比對,沒變動就不寫(避免空 commit)
  let changed = true;
  if (existsSync(outPath)) {
    try {
      const old = JSON.parse(readFileSync(outPath, 'utf8'));
      if (JSON.stringify(old.holidays) === JSON.stringify(sorted)) {
        changed = false;
      }
    } catch {
      // 舊檔壞掉就視為有變動
    }
  }

  if (!changed) {
    console.log('[fetch-holidays] 資料無變動,不寫檔');
    return;
  }

  writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
  console.log(`[fetch-holidays] 寫入 ${outPath}(${sorted.length} 個假日)`);
}

main().catch((e) => {
  console.error('[fetch-holidays] 失敗:', e);
  process.exit(1);
});
