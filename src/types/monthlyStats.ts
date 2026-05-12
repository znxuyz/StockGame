/**
 * 階段 5C:月度戰績統計 type re-export(實際定義在 services/monthlyStatsService.ts)。
 * 放這只是讓 `import { MonthlyStats } from '@/types'` 可用,避免 circular import。
 */
export type {
  MonthlyStats,
  BestCreatureSummary,
  RealmBreakthroughEntry
} from '@/services/monthlyStatsService';
