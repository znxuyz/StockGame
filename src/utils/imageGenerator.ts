/**
 * 階段 5C:HTML → PNG 圖片生成 utility(神獸分享卡 / 月度戰績卡共用)。
 *
 *  - 走 html-to-image 的 toPng,DOM 直接轉 PNG,iOS Safari 也跑得起來
 *  - 解析度自動以裝置 dpr 為基礎,deviceMemory < 4 時降到 1.5x 省記憶體
 *  - 字體生成前 await document.fonts.ready,避免抓到 fallback 字
 *  - sprite 圖片可能來自 /sprites/,跟 app 同源,不會 CORS 黑掉(但仍開 useCORS)
 *  - 失敗回 null,caller 顯示「請手動截圖」fallback
 */

import { toPng } from 'html-to-image';

export interface GenerateOptions {
  /** 卡片實際輸出寬,html-to-image 會以這個尺寸 render */
  width: number;
  height: number;
  /** 背景色(防 transparent png 在 IG 上看起來破破的) */
  backgroundColor?: string;
}

/**
 * 偵測「合適的 device pixel ratio」。
 * 高階機 2x;低記憶體裝置(< 4GB)降到 1.5x 避免 OOM。
 * 桌機 dpr 大多 1-2,行動裝置 2-3。
 */
function pickPixelRatio(): number {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  // navigator.deviceMemory 是 Chrome / Android 才有,iOS Safari 沒
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof mem === 'number' && mem < 4) {
    return Math.min(dpr, 1.5);
  }
  return Math.min(dpr, 2);
}

/** await 字體載入完成(只 await 一次,後面 generate 都跳過) */
let fontsReady: Promise<void> | null = null;
function awaitFontsReady(): Promise<void> {
  if (!fontsReady) {
    fontsReady = (async () => {
      try {
        if (document.fonts?.ready) {
          await document.fonts.ready;
        }
      } catch {
        // 不支援 / 失敗都吞掉,只是字會用 fallback
      }
    })();
  }
  return fontsReady;
}

/**
 * 把 React 渲染好的 DOM node 轉成 PNG dataURL。
 *  - 失敗回 null
 *  - cacheBust:true 避免 sprite 用瀏覽器舊快取(MJ 換過會抓到舊圖)
 *  - skipFonts:false → 把網頁字體 inline 進 PNG(html-to-image 預設行為)
 */
export async function nodeToPng(
  node: HTMLElement,
  options: GenerateOptions
): Promise<string | null> {
  await awaitFontsReady();
  try {
    const pixelRatio = pickPixelRatio();
    return await toPng(node, {
      width: options.width,
      height: options.height,
      pixelRatio,
      backgroundColor: options.backgroundColor ?? '#fefaf3',
      cacheBust: true,
      // html-to-image 預設會 inline images(用 fetch + base64),sprite 在同源
      // 內不會 CORS;若 caller 真有跨域圖,自己加 crossOrigin='anonymous'
      style: {
        // 防 transform / scale 影響輸出
        transform: 'none'
      }
    });
  } catch (e) {
    console.warn('[imageGenerator] nodeToPng failed:', e);
    return null;
  }
}

/**
 * 把 dataURL 觸發 <a download> 下載。
 *  - iOS Safari 對 a[download] 限制嚴格:PWA 內可能直接開新分頁顯示 image,
 *    使用者長按可儲存到相簿。桌面 / Android Chrome 直接下載到本機。
 *  - filename 不帶副檔名也可,瀏覽器會根據 mime 自動補
 */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  // iOS Safari 要 link 在 DOM 內才能觸發 click()
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * 把 dataURL 轉 Blob → File,給 navigator.share 帶圖用。
 *  - iOS PWA 用 share API 必須要 File(不能只丟字串 + URL),
 *    這個 helper 把 dataURL 反序列成 File
 *  - 失敗回 null
 */
export async function dataUrlToFile(
  dataUrl: string,
  filename: string,
  mimeType = 'image/png'
): Promise<File | null> {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], filename, { type: mimeType });
  } catch (e) {
    console.warn('[imageGenerator] dataUrlToFile failed:', e);
    return null;
  }
}

/**
 * 試著呼叫 navigator.share 帶圖。
 *  - 不支援 → 回 false,caller 自己 fallback download
 *  - 用戶取消 → 回 false 但不算錯誤
 *  - 成功 → 回 true
 */
export async function shareDataUrl(
  dataUrl: string,
  filename: string,
  text: string,
  url: string
): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return false;
  }
  const file = await dataUrlToFile(dataUrl, filename);
  const payload: ShareData = { text, url };
  if (file && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    payload.files = [file];
  }
  try {
    await navigator.share(payload);
    return true;
  } catch (e) {
    // AbortError = 使用者取消,不視為錯誤
    if (e instanceof Error && e.name === 'AbortError') return false;
    console.warn('[imageGenerator] share failed:', e);
    return false;
  }
}
