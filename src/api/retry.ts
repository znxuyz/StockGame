import { ApiError } from './errors';

export interface RetryOptions {
  /** 最多重試次數（不含第一次） */
  maxRetries?: number;
  /** 第一次重試的延遲（ms），之後 exponential backoff */
  baseDelayMs?: number;
  /** 抖動 0~1，避免雷霆群 */
  jitter?: number;
  /** 哪些錯誤碼會觸發重試（其他直接 throw） */
  retryOn?: Set<string>;
}

const DEFAULT_RETRY: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  jitter: 0.3,
  retryOn: new Set(['network', 'http', 'rate-limit'])
};

/**
 * 包一層 retry：失敗時 exponential backoff 重試。
 * 不重試 not-found、parse 等永久性錯誤。
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const opts = { ...DEFAULT_RETRY, ...options };
  let lastErr: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!(e instanceof ApiError) || !opts.retryOn.has(e.code)) {
        throw e; // 永久性錯誤，不重試
      }
      if (attempt === opts.maxRetries) break;

      const baseDelay = opts.baseDelayMs * 2 ** attempt;
      const delay = baseDelay * (1 + (Math.random() - 0.5) * 2 * opts.jitter);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastErr;
}
