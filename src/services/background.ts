/**
 * 家園背景圖目錄(階段 4B.4)。
 *
 * 解鎖一次 cost 修為,append 到 settings.unlockedBackgrounds 後可隨時免費切換。
 * 切換時 settings.currentBackground 更新 → PhaserMap useEffect 同步 →
 * WorldScene.setBackgroundId(id) 動態載入對應 texture 並 swap。
 *
 * 目前只有 'default'(main.JPG)有美術檔。其他 3 張(snow.jpg / night.jpg /
 * lava.jpg)只是 catalog entry,等用戶補美術上傳到 public/assets/bg/。檔案
 * 不存在時 setBackgroundId 偵測 FILE_LOAD_ERROR fallback 維持原 bg,玩家不會白屏。
 */

export interface BackgroundDef {
  /** 寫入 settings.currentBackground / settings.unlockedBackgrounds 的 id */
  id: string;
  /** UI 標籤 */
  label: string;
  /** public/assets/bg/ 下的檔名 */
  filename: string;
  /** 解鎖修為(default = 0;玩家預設已擁有) */
  cost: number;
  /** 美術檔是否已上傳(catalog 上 false 的玩家可解鎖但會看到 fallback 警示) */
  hasAsset: boolean;
}

export const BACKGROUNDS: BackgroundDef[] = [
  { id: 'default', label: '粉紅雲紋', filename: 'main.JPG', cost: 0, hasAsset: true },
  { id: 'snow', label: '雪白冰原', filename: 'snow.png', cost: 500, hasAsset: true },
  { id: 'night', label: '夜晚星空', filename: 'night.png', cost: 500, hasAsset: true },
  { id: 'lava', label: '火紅熔岩', filename: 'lava.png', cost: 500, hasAsset: true }
];

export function getBackgroundDef(id: string): BackgroundDef | undefined {
  return BACKGROUNDS.find((b) => b.id === id);
}

/** Phaser texture key 命名(WorldScene preload + setBackgroundId 共用) */
export function bgTextureKey(id: string): string {
  return `world-bg:${id}`;
}
