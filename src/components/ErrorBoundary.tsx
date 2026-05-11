import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** 出錯時顯示的訊息 */
  fallback?: ReactNode;
  /** 出錯時 console.error 加 prefix 方便辨識來源 */
  label?: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 通用 React error boundary。
 *
 * 用途:防止子樹內任何同步 throw(包括 useLiveQuery rethrow 的 Dexie 錯誤)
 * 把整個父樹炸掉變白屏。最常見的 4C 觸發點:
 *  - dexie .where('unindexedField') 直接 throw
 *  - dexie 表還沒 migrate 完就被 query
 *  - 渲染期某 pet 欄位 undefined 引發 .toString() / .map() 之類的 NPE
 *
 * 實作:class component + getDerivedStateFromError。
 * fallback 預設一個友善的「載入失敗」訊息 + console.error 詳細錯誤。
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const prefix = this.props.label ? `[ErrorBoundary:${this.props.label}]` : '[ErrorBoundary]';
    console.error(prefix, error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="data-card p-4 text-center text-sm text-red-600 space-y-2">
          <p>⚠️ 區塊載入失敗</p>
          <p className="text-xs text-gray-500 break-all">
            {this.state.error.message || String(this.state.error)}
          </p>
          <button
            type="button"
            onClick={this.reset}
            className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-bold"
          >
            重試
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
