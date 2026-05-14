import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import {
  clearOldData,
  commitBackfilledTransactions,
  downloadBackupFile,
  exportBackup,
  newPendingTx,
  type CommitProgress,
  type PendingTransaction,
  type PendingTxType
} from '@/services';
import { db } from '@/db';
import { calcFee, type FeeConfig } from '@/utils';
import type { Settings } from '@/types';

interface HistoricalTransactionBackfillModalProps {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onActionComplete?: (message: string) => void;
}

type Step = 'warning' | 'prepare' | 'backup' | 'clearing' | 'entry' | 'finalizing' | 'done';

/**
 * 階段 5G:歷史交易補登精靈彈窗。
 *
 *  - 7 step state machine(警告 → 準備 → 備份 → 清資料 → 輸入 → 處理 → 完成)
 *  - entry step 包含「+ 新增交易」內嵌表單(state-based subview,不開 nested Modal)
 *  - 新增 / 編輯 / 刪除 PendingTransaction in memory;commit 時才寫進 db
 *  - 完成後跑 snapshotBackfill(自動)
 *
 * 重要約定:
 *  - clearOldData 後不可 rollback;Step 'clearing' 後關 modal 會跳警告
 *  - PendingTx 用 in-memory state,玩家可任意編輯/刪除
 *  - 同檔股票第一筆會自動走 buy(召喚神獸),後續 buyOrFeed 自動判斷 feed
 */
export default function HistoricalTransactionBackfillModal({
  open,
  onClose,
  settings,
  onActionComplete
}: HistoricalTransactionBackfillModalProps) {
  const [step, setStep] = useState<Step>('warning');
  const [pending, setPending] = useState<PendingTransaction[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null); // null = no form;'new' = adding;else editing existing uiId
  const [progress, setProgress] = useState<CommitProgress | null>(null);
  const [done, setDone] = useState<{ imported: number; failed: number; days: number } | null>(null);

  // 開啟時 reset 為第一步
  useEffect(() => {
    if (open) {
      setStep('warning');
      setPending([]);
      setEditingId(null);
      setProgress(null);
      setDone(null);
    }
  }, [open]);

  function safeClose() {
    // clearing / finalizing 中:資料正在動,擋下
    if (step === 'clearing' || step === 'finalizing') {
      alert('處理中,請等完成再關閉');
      return;
    }
    // entry 階段已輸入資料但還沒 finalize → 關閉會遺失
    if (step === 'entry' && pending.length > 0) {
      if (!confirm('資料已清除,關閉會遺失目前輸入的補登。確定關閉?')) return;
    }
    onClose();
  }

  // 排序 pending(顯示用)
  const sortedPending = useMemo(
    () => [...pending].sort((a, b) => a.date.localeCompare(b.date)),
    [pending]
  );

  // ─── handlers ────────────────────────────────────────

  async function handleClearAndStart() {
    setStep('clearing');
    try {
      await clearOldData();
      setStep('entry');
    } catch (e) {
      alert(`清資料失敗:${e instanceof Error ? e.message : String(e)}`);
      setStep('warning');
    }
  }

  async function handleBackupDownload() {
    try {
      const { filename, jsonString } = await exportBackup();
      downloadBackupFile(filename, jsonString);
      onActionComplete?.('💾 備份已下載');
    } catch (e) {
      alert(`備份失敗:${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function handleAddOrEditTx(tx: PendingTransaction) {
    setPending((prev) => {
      const idx = prev.findIndex((t) => t.uiId === tx.uiId);
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = tx;
        return next;
      }
      return [...prev, tx];
    });
    setEditingId(null);
  }

  function handleDeleteTx(uiId: string) {
    if (!confirm('確定刪除這筆?')) return;
    setPending((prev) => prev.filter((t) => t.uiId !== uiId));
  }

  async function handleFinalize() {
    if (pending.length === 0) {
      if (!confirm('沒有任何補登,確定完成?(會剩下空白狀態)')) return;
    } else {
      const earliest = sortedPending[0].date;
      const latest = sortedPending[sortedPending.length - 1].date;
      if (
        !confirm(
          `即將寫入 ${pending.length} 筆交易(${earliest} → ${latest})並補登 snapshot。\n確定執行?`
        )
      )
        return;
    }
    setStep('finalizing');
    setProgress({ step: 'importing', importingProgress: 0 });
    try {
      const r = await commitBackfilledTransactions(pending, settings, setProgress);
      setDone({
        imported: r.imported,
        failed: r.failed.length,
        days: r.snapshotBackfilled
      });
      if (r.failed.length > 0) {
        console.warn('[backfill] failed transactions:', r.failed);
      }
      setStep('done');
    } catch (e) {
      alert(`補登失敗:${e instanceof Error ? e.message : String(e)}`);
      setStep('entry');
    }
  }

  function todayYMD(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  }

  // ─── render ──────────────────────────────────────────

  return (
    <Modal open={open} onClose={safeClose} title="📋 歷史交易補登" hideClose={step === 'clearing' || step === 'finalizing'}>
      {step === 'warning' && (
        <WarningStep onContinue={() => setStep('prepare')} onCancel={onClose} />
      )}
      {step === 'prepare' && (
        <PrepareStep onContinue={() => setStep('backup')} onCancel={onClose} />
      )}
      {step === 'backup' && (
        <BackupStep
          onDownload={handleBackupDownload}
          onContinue={handleClearAndStart}
          onCancel={onClose}
        />
      )}
      {step === 'clearing' && (
        <div className="text-center py-12 space-y-3">
          <div className="text-4xl animate-pulse">🧹</div>
          <p className="text-sm text-gray-700">正在清除舊資料⋯</p>
        </div>
      )}
      {step === 'entry' && (
        <EntryStep
          pending={sortedPending}
          editingId={editingId}
          todayYMD={todayYMD()}
          onStartAdd={() => setEditingId('new')}
          onStartEdit={(id) => setEditingId(id)}
          onCancelEdit={() => setEditingId(null)}
          onSaveTx={handleAddOrEditTx}
          onDeleteTx={handleDeleteTx}
          onFinalize={handleFinalize}
          settings={settings}
        />
      )}
      {step === 'finalizing' && <FinalizingStep progress={progress} />}
      {step === 'done' && done && (
        <DoneStep
          imported={done.imported}
          failed={done.failed}
          days={done.days}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

// ─── Step 1:警告 ────────────────────────────────────────

function WarningStep({ onContinue, onCancel }: { onContinue: () => void; onCancel: () => void }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="font-bold text-red-600">⚠️ 此操作會永久執行以下動作:</p>
      <ol className="list-decimal list-inside text-gray-700 leading-relaxed space-y-0.5">
        <li>清除目前所有持倉</li>
        <li>清除目前所有神獸(含 retired)</li>
        <li>清除目前所有交易紀錄</li>
        <li>清除歷史 snapshot(會在補登後重建)</li>
      </ol>
      <p className="text-gray-700 mt-1">
        <b>保留</b>:個人檔案、修為總額、好友關係、已解鎖成就、圖鑑紀錄、設定
      </p>
      <hr className="border-gray-200" />
      <p className="text-xs text-gray-600 leading-relaxed">
        <b>適用情況</b>:加碼 / 賣出日期都被存成今天 / 想重新校正 IRR /
        從頭整理交易紀錄
      </p>
      <p className="text-[11px] text-gray-500 leading-relaxed">
        預估時間:5-15 分鐘(取決於交易筆數)
      </p>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold border border-gray-200"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm font-bold active:scale-[0.99] transition-transform"
        >
          我了解,繼續
        </button>
      </div>
    </div>
  );
}

// ─── Step 2:準備清單 ────────────────────────────────────

function PrepareStep({ onContinue, onCancel }: { onContinue: () => void; onCancel: () => void }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="font-bold">📋 開始前,請準備你的證券交易紀錄</p>
      <ul className="text-gray-700 leading-relaxed space-y-1 list-disc list-inside">
        <li>證券 APP 對帳單</li>
        <li>或紙本交割單</li>
      </ul>
      <hr className="border-gray-200" />
      <p className="text-xs text-gray-600">每筆交易需要的資訊:</p>
      <ul className="text-xs text-gray-700 leading-relaxed space-y-0.5 list-disc list-inside">
        <li>日期(YYYY/MM/DD)</li>
        <li>股票代號 / 名稱</li>
        <li>類型(買入 / 加碼 / 賣出)</li>
        <li>股數</li>
        <li>單價</li>
      </ul>
      <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
        💡 提示:從最早一筆開始輸入,系統會自動依日期排序
      </p>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold border border-gray-200"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold active:scale-[0.99] transition-transform"
        >
          我準備好了
        </button>
      </div>
    </div>
  );
}

// ─── Step 3:備份提示 ────────────────────────────────────

function BackupStep({
  onDownload,
  onContinue,
  onCancel
}: {
  onDownload: () => void;
  onContinue: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-gray-700">建議先匯出目前資料備份(萬一補登中途想恢復)</p>
      <button
        type="button"
        onClick={onDownload}
        className="w-full py-2 bg-emerald-500 text-white rounded-lg text-sm font-bold active:scale-[0.99] transition-transform"
      >
        💾 下載備份 .json
      </button>
      <hr className="border-gray-200" />
      <p className="text-xs text-gray-500 text-center">也可以直接開始補登</p>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold border border-gray-200"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm font-bold active:scale-[0.99] transition-transform"
        >
          跳過備份,開始補登
        </button>
      </div>
    </div>
  );
}

// ─── Step 5:Entry list + AddTxForm 內嵌 ──────────────────

function EntryStep({
  pending,
  editingId,
  todayYMD,
  onStartAdd,
  onStartEdit,
  onCancelEdit,
  onSaveTx,
  onDeleteTx,
  onFinalize,
  settings
}: {
  pending: PendingTransaction[];
  editingId: string | null;
  todayYMD: string;
  onStartAdd: () => void;
  onStartEdit: (uiId: string) => void;
  onCancelEdit: () => void;
  onSaveTx: (tx: PendingTransaction) => void;
  onDeleteTx: (uiId: string) => void;
  onFinalize: () => void;
  settings: Settings;
}) {
  // 編輯中 → 顯示表單,蓋掉列表
  if (editingId !== null) {
    const editing =
      editingId === 'new'
        ? null
        : pending.find((t) => t.uiId === editingId) ?? null;
    return (
      <AddTxForm
        initial={editing}
        todayYMD={todayYMD}
        pendingForValidation={pending}
        settings={settings}
        onSave={onSaveTx}
        onCancel={onCancelEdit}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-600">
        已輸入 <b className="text-gray-800">{pending.length}</b> 筆交易
      </div>

      <button
        type="button"
        onClick={onStartAdd}
        className="w-full py-3 bg-amber-500 text-white rounded-lg text-sm font-bold active:scale-[0.99] transition-transform"
      >
        + 新增交易
      </button>

      {pending.length > 0 && (
        <div className="space-y-1.5">
          {pending.map((tx) => (
            <div key={tx.uiId} className="item-card px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-500">{tx.date}</div>
                  <div className="text-sm font-bold">
                    {typeLabel(tx.type)} {tx.code} {tx.stockName ? `· ${tx.stockName}` : ''}
                  </div>
                  <div className="text-[11px] text-gray-600">
                    {tx.shares} 股 @ {tx.pricePerShare}
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onStartEdit(tx.uiId)}
                    className="px-2 py-0.5 text-[11px] text-mythic-jade-600 border border-gray-300 rounded"
                  >
                    編輯
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteTx(tx.uiId)}
                    className="px-2 py-0.5 text-[11px] text-red-600 border border-red-200 rounded"
                  >
                    刪除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <hr className="border-gray-200" />
      <button
        type="button"
        onClick={onFinalize}
        className="w-full py-3 bg-emerald-500 text-white rounded-lg text-base font-bold active:scale-[0.99] transition-transform"
      >
        ✅ 完成補登
      </button>
    </div>
  );
}

function typeLabel(t: PendingTxType): string {
  switch (t) {
    case 'buy':
      return '買入';
    case 'feed':
      return '加碼';
    case 'sell':
      return '賣出';
  }
}

// ─── 新增 / 編輯交易表單 ──────────────────────────────

function AddTxForm({
  initial,
  todayYMD,
  pendingForValidation,
  settings,
  onSave,
  onCancel
}: {
  initial: PendingTransaction | null;
  todayYMD: string;
  pendingForValidation: PendingTransaction[];
  settings: Settings;
  onSave: (tx: PendingTransaction) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<PendingTxType>(initial?.type ?? 'buy');
  const [code, setCode] = useState(initial?.code ?? '');
  const [stockName, setStockName] = useState(initial?.stockName ?? '');
  const [date, setDate] = useState(initial?.date ?? todayYMD);
  const [shares, setShares] = useState(initial?.shares ? String(initial.shares) : '');
  const [price, setPrice] = useState(initial?.pricePerShare ? String(initial.pricePerShare) : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 用「截至 date 為止」的 pending 模擬持倉,做 validation
  const localState = useMemo(() => {
    const others = initial
      ? pendingForValidation.filter((t) => t.uiId !== initial.uiId)
      : pendingForValidation;
    const sorted = [...others].sort((a, b) => a.date.localeCompare(b.date));
    // 截至這筆 date(含)之前的所有 tx
    const prior = sorted.filter((t) => t.date <= date);
    const sharesByCode = new Map<string, number>();
    for (const t of prior) {
      const cur = sharesByCode.get(t.code) ?? 0;
      if (t.type === 'buy' || t.type === 'feed') sharesByCode.set(t.code, cur + t.shares);
      else if (t.type === 'sell') sharesByCode.set(t.code, Math.max(0, cur - t.shares));
    }
    return sharesByCode;
  }, [pendingForValidation, initial, date]);

  // 試算手續費
  const sharesNum = Number(shares) || 0;
  const priceNum = Number(price) || 0;
  const grossAmount = Math.round(sharesNum * priceNum);
  const fee =
    grossAmount > 0
      ? calcFee(grossAmount, {
          discount: settings.brokerageFeeDiscount,
          minFee: settings.brokerageMinFee
        } satisfies FeeConfig)
      : 0;
  const netAmount =
    type === 'sell' ? grossAmount - fee : grossAmount + fee; // 賣出粗略估,真值是 portfolio.sell 算

  async function handleLookup() {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const cached = await db.stocks.get(code.trim());
      if (cached) {
        setStockName(cached.name);
      }
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit() {
    setError(null);
    if (!code.trim()) {
      setError('請輸入股票代號');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('日期格式不對');
      return;
    }
    if (date > todayYMD) {
      setError('日期不能是未來');
      return;
    }
    if (sharesNum <= 0) {
      setError('股數要大於 0');
      return;
    }
    if (priceNum <= 0) {
      setError('價格要大於 0');
      return;
    }

    // 類型 validation
    const heldShares = localState.get(code.trim()) ?? 0;
    if (type === 'feed') {
      if (heldShares <= 0) {
        setError(`「加碼」前必須先有「買入」紀錄(${code} 截至 ${date} 持有 0 股)`);
        return;
      }
    }
    if (type === 'sell') {
      if (heldShares < sharesNum) {
        setError(`賣出 ${sharesNum} 股,但截至 ${date} 持有只有 ${heldShares} 股`);
        return;
      }
    }
    if (type === 'buy') {
      if (heldShares > 0) {
        if (
          !confirm(
            `${code} 截至 ${date} 已持有 ${heldShares} 股,標記成「買入」會召喚新神獸(舊持倉不變)。確定?\n建議改用「加碼」。`
          )
        )
          return;
      }
    }

    onSave({
      uiId: initial?.uiId ?? newPendingTx().uiId,
      date,
      type,
      code: code.trim(),
      stockName: stockName.trim(),
      shares: sharesNum,
      pricePerShare: priceNum
    });
  }

  return (
    <div className="space-y-2 text-sm">
      <h4 className="font-bold text-gray-700">{initial ? '編輯交易' : '新增交易'}</h4>

      {/* 類型 */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">交易類型</label>
        <div className="flex gap-1">
          {(['buy', 'feed', 'sell'] as PendingTxType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex-1 py-1.5 rounded-md text-xs font-bold border transition-colors ${
                type === t
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-white/60 text-gray-700 border-gray-300'
              }`}
            >
              {typeLabel(t)}
            </button>
          ))}
        </div>
      </div>

      {/* 代號 + 名稱 */}
      <div className="grid grid-cols-[1fr_auto] gap-1">
        <div>
          <label className="block text-xs text-gray-500 mb-1">股票代號</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onBlur={handleLookup}
            className="input-field"
            placeholder="0050"
            maxLength={6}
          />
        </div>
        <div className="self-end">
          <button
            type="button"
            onClick={handleLookup}
            disabled={busy || !code.trim()}
            className="px-3 py-1.5 bg-mythic-jade-100 text-mythic-jade-700 border border-gray-300 rounded text-xs font-bold disabled:opacity-50"
          >
            查名
          </button>
        </div>
      </div>
      {stockName && <div className="text-[11px] text-gray-500">名稱:{stockName}</div>}

      {/* 日期 */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">日期</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          max={todayYMD}
          className="input-field"
        />
      </div>

      {/* 股數 + 單價 */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">股數</label>
          <input
            type="number"
            inputMode="numeric"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            className="input-field"
            placeholder="100"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">單價</label>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="input-field"
            placeholder="60.10"
          />
        </div>
      </div>

      {/* 試算 */}
      {grossAmount > 0 && (
        <div className="bg-sand-50 rounded-lg p-2 text-xs space-y-0.5">
          <div className="flex justify-between">
            <span className="text-gray-500">金額</span>
            <span>NT$ {grossAmount.toLocaleString('zh-TW')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">手續費(預估)</span>
            <span>NT$ {fee.toLocaleString('zh-TW')}</span>
          </div>
          <div className="flex justify-between font-bold border-t border-gray-200 pt-0.5 mt-0.5">
            <span>{type === 'sell' ? '實收' : '實付'}</span>
            <span>NT$ {netAmount.toLocaleString('zh-TW')}</span>
          </div>
        </div>
      )}

      {error && (
        <p className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold border border-gray-200"
        >
          取消
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="flex-1 py-2 bg-emerald-500 text-white rounded-lg text-sm font-bold"
        >
          {initial ? '儲存變更' : '新增'}
        </button>
      </div>
    </div>
  );
}

// ─── 處理中 ────────────────────────────────────────────

function FinalizingStep({ progress }: { progress: CommitProgress | null }) {
  let text = '處理中⋯';
  let pct: number | null = null;
  if (progress?.step === 'importing') {
    text = '正在寫入交易⋯';
    pct = (progress.importingProgress ?? 0) * 100;
  } else if (progress?.step === 'snapshot') {
    text = '正在補登歷史 snapshot⋯';
  } else if (progress?.step === 'done') {
    text = '完成,整理結果⋯';
  }
  return (
    <div className="text-center py-12 space-y-3">
      <div className="text-4xl animate-pulse">⏳</div>
      <p className="text-sm text-gray-700">{text}</p>
      {pct !== null && (
        <div className="bg-gray-100 rounded-full h-2 mx-auto max-w-xs overflow-hidden">
          <div
            className="bg-amber-500 h-full transition-[width]"
            style={{ width: `${Math.round(pct)}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ─── 完成 ──────────────────────────────────────────────

function DoneStep({
  imported,
  failed,
  days,
  onClose
}: {
  imported: number;
  failed: number;
  days: number;
  onClose: () => void;
}) {
  return (
    <div className="space-y-3 text-sm text-center">
      <div className="text-5xl">✅</div>
      <p className="font-bold text-gray-800">補登完成</p>
      <div className="space-y-1 text-xs text-gray-700 bg-emerald-50 border border-emerald-200 rounded p-3">
        <p>
          ✓ 寫入交易:<b>{imported}</b> 筆
        </p>
        {failed > 0 && (
          <p className="text-red-600">
            ⚠️ 失敗:<b>{failed}</b> 筆(請開 DevTools console 看詳情)
          </p>
        )}
        <p>
          ✓ 補登 snapshot:<b>{days}</b> 天
        </p>
      </div>
      <p className="text-xs text-gray-600 leading-relaxed">
        IRR / 累積報酬 / 月度損益 / 夏普 / 回撤 都已重新計算。
        <br />
        打開「紀錄」彈窗確認新指標。
      </p>
      <button
        type="button"
        onClick={onClose}
        className="w-full py-2 bg-emerald-500 text-white rounded-lg text-sm font-bold active:scale-[0.99] transition-transform"
      >
        關閉
      </button>
    </div>
  );
}
