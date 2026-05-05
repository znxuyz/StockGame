/**
 * API 錯誤類型。
 *
 * 設計原則：「錯誤要顯示給使用者方便修改」（不要靜默吞掉）。
 *  - 網路錯誤、CORS、API 改 schema 都會 surface 出來，UI 層會顯示
 */

export type ApiErrorCode =
  | 'network' // fetch 失敗（離線、CORS、DNS）
  | 'http' // HTTP 非 2xx
  | 'parse' // 回應格式無法解析
  | 'not-found' // 找不到該股票代號
  | 'rate-limit' // 太頻繁
  | 'unknown';

export class ApiError extends Error {
  code: ApiErrorCode;
  /** 來源 endpoint（debug 用） */
  endpoint?: string;
  /** 原始錯誤（debug 用） */
  cause?: unknown;

  constructor(code: ApiErrorCode, message: string, options?: { endpoint?: string; cause?: unknown }) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.endpoint = options?.endpoint;
    this.cause = options?.cause;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** 給 UI 顯示用的中文訊息 */
export function describeApiError(e: ApiError): string {
  switch (e.code) {
    case 'network':
      return '網路連線失敗，請檢查網路或稍後再試';
    case 'http':
      return `伺服器回應異常（${e.message}）`;
    case 'parse':
      return '股價資料格式異常，可能是 API 改版（請通知開發者）';
    case 'not-found':
      return '找不到此股票代號';
    case 'rate-limit':
      return '查詢過於頻繁，已自動延遲重試';
    default:
      return `未知錯誤：${e.message}`;
  }
}
