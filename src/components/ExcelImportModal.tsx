import { useRef, useState } from 'react';
import Modal from './Modal';
import { downloadBackupFile, exportBackup, type CommitProgress } from '@/services';
// Deep import — services/index 不 re-export 這隻,確保 ExcelJS 留在這個
// lazy chunk 內,主 bundle 不被 ~900KB 撐爆
import {
  executeImport,
  generateAndDownloadTemplate,
  parseExcelFile,
  previewImport,
  type ImportMode,
  type PreviewItem,
  type PreviewResult
} from '@/services/excelImportService';
import type { Settings } from '@/types';

interface ExcelImportModalProps {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onActionComplete?: (message: string) => void;
}

type Step = 'intro' | 'preview' | 'mode' | 'running' | 'done';

/**
 * 階段 5G:Excel 批次匯入交易紀錄。
 *
 * 5 step wizard:intro → preview → mode → running → done
 *  - intro:下載範本 + 上傳檔案
 *  - preview:逐行驗證結果(✅ / ❌ + 錯誤訊息)
 *  - mode:merge(保留現有持倉)/ replace(清掉現有)+ 備份匯出
 *  - running:進度條(import → snapshot)
 *  - done:匯入成功 / 失敗統計
 *
 * 用 ExcelJS(不是 SheetJS,後者 npm 版本有 known CVE),lazy loaded 不撐主檔。
 */
export default function ExcelImportModal({
  open,
  onClose,
  settings,
  onActionComplete
}: ExcelImportModalProps) {
  const [step, setStep] = useState<Step>('intro');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [mode, setMode] = useState<ImportMode>('replace');
  const [progress, setProgress] = useState<CommitProgress | null>(null);
  const [done, setDone] = useState<{ imported: number; failed: number; days: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep('intro');
    setPreview(null);
    setMode('replace');
    setProgress(null);
    setDone(null);
    setBusy(false);
    setError(null);
  }

  function safeClose() {
    if (step === 'running') {
      alert('匯入中,請等完成');
      return;
    }
    reset();
    onClose();
  }

  async function handleDownloadTemplate() {
    setBusy(true);
    setError(null);
    try {
      await generateAndDownloadTemplate();
      onActionComplete?.('📥 範本已下載');
    } catch (e) {
      setError(`下載範本失敗:${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const rows = await parseExcelFile(file);
      if (rows.length === 0) {
        setError('檔案沒有任何交易資料(第二列開始)');
        return;
      }
      const r = await previewImport(rows, mode);
      setPreview(r);
      setStep('preview');
    } catch (err) {
      setError(`解析失敗:${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
      // reset input 讓玩家可以重選同檔案
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleBackup() {
    setBusy(true);
    try {
      const { filename, jsonString } = await exportBackup();
      downloadBackupFile(filename, jsonString);
      onActionComplete?.('💾 備份已下載');
    } catch (err) {
      setError(`備份失敗:${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleRun() {
    if (!preview) return;
    if (preview.validCount === 0) {
      setError('沒有任何合法交易可匯入');
      return;
    }
    if (mode === 'replace') {
      if (
        !confirm(
          `「取代」模式會清掉現有所有持倉、神獸、交易。\n要繼續嗎?(${preview.validCount} 筆會匯入)`
        )
      )
        return;
    }
    setStep('running');
    setBusy(true);
    setError(null);
    try {
      const r = await executeImport(preview, mode, settings, setProgress);
      setDone({
        imported: r.imported,
        failed: r.failed.length,
        days: r.snapshotBackfilled
      });
      if (r.failed.length > 0) {
        console.warn('[excelImport] failed:', r.failed);
      }
      setStep('done');
    } catch (err) {
      setError(`匯入失敗:${err instanceof Error ? err.message : String(err)}`);
      setStep('mode');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={safeClose}
      title="📊 Excel 批次匯入"
      hideClose={step === 'running'}
    >
      {step === 'intro' && (
        <IntroStep
          busy={busy}
          error={error}
          onDownloadTemplate={handleDownloadTemplate}
          onPickFile={() => fileInputRef.current?.click()}
        />
      )}
      {step === 'preview' && preview && (
        <PreviewStep
          preview={preview}
          error={error}
          onBack={() => {
            setPreview(null);
            setStep('intro');
          }}
          onContinue={() => setStep('mode')}
        />
      )}
      {step === 'mode' && preview && (
        <ModeStep
          preview={preview}
          mode={mode}
          onModeChange={setMode}
          busy={busy}
          error={error}
          onBackup={handleBackup}
          onBack={() => setStep('preview')}
          onRun={handleRun}
        />
      )}
      {step === 'running' && <RunningStep progress={progress} />}
      {step === 'done' && done && (
        <DoneStep
          imported={done.imported}
          failed={done.failed}
          days={done.days}
          onClose={() => {
            reset();
            onClose();
          }}
        />
      )}

      {/* 隱藏 file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleUpload}
        style={{ display: 'none' }}
      />
    </Modal>
  );
}

// ─── Step 1:Intro ──────────────────────────────────────

function IntroStep({
  busy,
  error,
  onDownloadTemplate,
  onPickFile
}: {
  busy: boolean;
  error: string | null;
  onDownloadTemplate: () => void;
  onPickFile: () => void;
}) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-gray-700 leading-relaxed">
        把證券交易紀錄整理成 Excel,一次匯入所有持倉。
      </p>
      <ol className="list-decimal list-inside text-gray-700 leading-relaxed space-y-0.5">
        <li>下載範本檔</li>
        <li>填入交易紀錄</li>
        <li>上傳 .xlsx / .csv 檔</li>
        <li>預覽 + 確認</li>
        <li>一鍵匯入</li>
      </ol>

      <hr className="border-gray-200" />

      <button
        type="button"
        onClick={onDownloadTemplate}
        disabled={busy}
        className="w-full py-2.5 bg-emerald-500 text-white rounded-lg text-sm font-bold disabled:opacity-50 active:scale-[0.99] transition-transform"
      >
        📥 下載範本 .xlsx
      </button>

      <button
        type="button"
        onClick={onPickFile}
        disabled={busy}
        className="w-full py-2.5 bg-amber-500 text-white rounded-lg text-sm font-bold disabled:opacity-50 active:scale-[0.99] transition-transform"
      >
        📂 上傳 Excel / CSV 檔
      </button>

      {error && (
        <p className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </p>
      )}
      {busy && (
        <p className="text-[11px] text-gray-500 italic text-center">處理中⋯</p>
      )}

      <p className="text-[11px] text-gray-500 leading-relaxed">
        💡 範本有兩個 sheet:「交易紀錄」+「說明」。
        日期支援 YYYY/MM/DD 或 YYYY-MM-DD。第一筆同股票必須是「買入」。
      </p>
    </div>
  );
}

// ─── Step 2:Preview ────────────────────────────────────

function PreviewStep({
  preview,
  error,
  onBack,
  onContinue
}: {
  preview: PreviewResult;
  error: string | null;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="總筆數" value={preview.items.length} />
        <Stat label="合法" value={preview.validCount} color="text-emerald-700" />
        <Stat label="錯誤" value={preview.invalidCount} color="text-red-600" />
      </div>

      <div className="space-y-1 max-h-72 overflow-y-auto">
        {preview.items.map((item) => (
          <PreviewRow key={item.rowNum} item={item} />
        ))}
      </div>

      {preview.invalidCount > 0 && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 leading-relaxed">
          ⚠️ 有 {preview.invalidCount} 筆錯誤。可選擇修正 Excel 重新上傳,或略過錯誤匯入合法的。
        </p>
      )}

      {error && (
        <p className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold border border-gray-200"
        >
          ← 重新上傳
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={preview.validCount === 0}
          className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold disabled:opacity-50 active:scale-[0.99] transition-transform"
        >
          選擇匯入模式 ›
        </button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="bg-sand-50 rounded p-2">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className={`text-lg font-bold ${color ?? 'text-gray-800'}`}>{value}</div>
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = {
  buy: '買入',
  feed: '加碼',
  sell: '賣出'
};

function PreviewRow({ item }: { item: PreviewItem }) {
  const cls = item.valid
    ? 'bg-emerald-50 border-emerald-200'
    : 'bg-red-50 border-red-200';
  return (
    <div className={`rounded-lg border px-2 py-1.5 text-xs ${cls}`}>
      <div className="flex items-start gap-2">
        <span className="shrink-0 text-base leading-tight">{item.valid ? '✅' : '❌'}</span>
        <div className="flex-1 min-w-0">
          <div className="text-gray-500">第 {item.rowNum} 行</div>
          {item.valid && item.tx ? (
            <div className="font-bold text-gray-800">
              {item.tx.date} · {TYPE_LABEL[item.tx.type]} · {item.tx.code} ·{' '}
              {item.tx.shares} 股 @ {item.tx.pricePerShare}
            </div>
          ) : (
            <>
              <div className="text-gray-600 truncate">
                {item.raw.date} · {item.raw.type} · {item.raw.stockCode}
              </div>
              <div className="text-red-600 mt-0.5">{item.error}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step 3:Mode ───────────────────────────────────────

function ModeStep({
  preview,
  mode,
  onModeChange,
  busy,
  error,
  onBackup,
  onBack,
  onRun
}: {
  preview: PreviewResult;
  mode: ImportMode;
  onModeChange: (m: ImportMode) => void;
  busy: boolean;
  error: string | null;
  onBackup: () => void;
  onBack: () => void;
  onRun: () => void;
}) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-gray-700">
        將匯入 <b>{preview.validCount}</b> 筆合法交易。請選擇模式:
      </p>

      <ModeRadio
        active={mode === 'merge'}
        onClick={() => onModeChange('merge')}
        title="合併"
        desc="把 Excel 交易加到目前持倉,不刪除現有資料"
      />
      <ModeRadio
        active={mode === 'replace'}
        onClick={() => onModeChange('replace')}
        title="取代(建議第一次匯入用)"
        desc="清掉目前所有持倉,完全用 Excel 重建"
        warn="⚠️ 無法復原,建議先匯出備份"
      />

      <button
        type="button"
        onClick={onBackup}
        disabled={busy}
        className="w-full py-2 bg-white/70 border border-gray-300 text-gray-700 rounded-lg text-sm font-bold disabled:opacity-50"
      >
        💾 匯出備份 .json
      </button>

      {error && (
        <p className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold border border-gray-200"
        >
          ← 上一步
        </button>
        <button
          type="button"
          onClick={onRun}
          disabled={busy}
          className="flex-1 py-2 bg-emerald-500 text-white rounded-lg text-sm font-bold disabled:opacity-50 active:scale-[0.99] transition-transform"
        >
          開始匯入
        </button>
      </div>
    </div>
  );
}

function ModeRadio({
  active,
  onClick,
  title,
  desc,
  warn
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
  warn?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-2 transition-colors ${
        active
          ? 'bg-amber-50 border-amber-300'
          : 'bg-white/60 border-gray-200 hover:bg-white/80'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-base">{active ? '🟡' : '⚪'}</span>
        <span className="text-sm font-bold text-gray-800">{title}</span>
      </div>
      <div className="text-[11px] text-gray-600 mt-0.5 pl-6 leading-relaxed">{desc}</div>
      {warn && (
        <div className="text-[11px] text-amber-700 mt-0.5 pl-6 leading-relaxed">{warn}</div>
      )}
    </button>
  );
}

// ─── Step 4:Running ────────────────────────────────────

function RunningStep({ progress }: { progress: CommitProgress | null }) {
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

// ─── Step 5:Done ───────────────────────────────────────

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
      <p className="font-bold text-gray-800">匯入完成</p>
      <div className="space-y-1 text-xs text-gray-700 bg-emerald-50 border border-emerald-200 rounded p-3">
        <p>
          ✓ 成功匯入:<b>{imported}</b> 筆交易
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
