import Phaser from 'phaser';
import { PetSprite, spriteKey, type PetSpriteData } from './petSprite';
import { CREATURES } from '@/data/creatures';

/**
 * 水墨世界場景。
 *
 * 設計：
 *  - 世界範圍 1500x1500，攝影機可拖曳
 *  - 寵物以「id 雜湊 → 領地中心」決定位置，避免重疊
 *  - 點擊寵物 emit 'pet-click'（React 端訂閱開個股資訊）
 *  - 場景裝飾：松、石、雲、月,靜態裝飾不互動(水墨意象,emoji 占位)
 *  - preload 嘗試載入有 art:true 的物種立繪;沒檔的物種完全不 load
 *    (避免 console 一堆 404 錯誤),PetSprite 看 texture exist 自動切 fallback
 *
 * 為什麼用 Phaser：
 *  - 寵物動畫 / 位移用 Phaser scene loop 比 React rerender 順
 *  - Camera drag、世界座標系統開箱即用
 *  - 將來想加 sprite sheet 動畫時很容易接
 */

export const WORLD_SIZE = 1400;
const GRID_CELL = 280; // 每個寵物的初始位置格子大小(寵物會自由漫步,只決定起手位置)
const COLS = Math.floor(WORLD_SIZE / GRID_CELL);
/** 攝影機 zoom 範圍 */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;

/** 場景底色:暖米紙色,讓寵物立繪自帶的米紙底不會跟場景出現顯著邊界 */
const RICE_PAPER_BG = '#efe6cf';

export class WorldScene extends Phaser.Scene {
  private sprites: Map<string, PetSprite> = new Map();
  private clickHandler: ((petId: string) => void) | null = null;
  private dragStart: { x: number; y: number } | null = null;
  private cameraStart: { x: number; y: number } | null = null;
  /** 拖曳判斷門檻（像素），低於此距離視為點擊 */
  private dragThreshold = 6;
  private didDrag = false;

  constructor() {
    super('WorldScene');
  }

  preload() {
    // 只對 art:true 的物種嘗試載入立繪 — 其他物種一定 fallback emoji,
    // 不必讓 Phaser 噴一堆 404 進 console。
    const artSpecies = CREATURES.filter((c) => c.art === true);
    if (artSpecies.length === 0) return;

    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      console.warn(`[WorldScene] sprite 載入失敗,fallback emoji:${file.key}`);
    });

    const base = import.meta.env.BASE_URL ?? '/';
    for (const c of artSpecies) {
      this.load.image(spriteKey(c.id), `${base}sprites/${c.id}.png`);
    }
  }

  create() {
    this.cameras.main.setBackgroundColor(RICE_PAPER_BG);
    this.cameras.main.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    // 起始置中
    this.cameras.main.scrollX = (WORLD_SIZE - this.cameras.main.width) / 2;
    this.cameras.main.scrollY = (WORLD_SIZE - this.cameras.main.height) / 2;

    this.drawDecorations();
    this.setupCameraDrag();
    this.setupZoom();
  }

  /** 攝影機縮放:wheel(桌機)+ pinch(手機 2 指) */
  private pinchInitialDistance = 0;
  private pinchInitialZoom = 1;
  private setupZoom() {
    // 桌機:滾輪縮放
    this.input.on(
      'wheel',
      (_pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
        const cam = this.cameras.main;
        const factor = dy > 0 ? 0.9 : 1.1;
        cam.setZoom(Phaser.Math.Clamp(cam.zoom * factor, ZOOM_MIN, ZOOM_MAX));
      }
    );

    // 手機 / 觸控:雙指 pinch
    this.input.on('pointermove', () => {
      const p1 = this.input.pointer1;
      const p2 = this.input.pointer2;
      if (!p1.isDown || !p2.isDown) {
        this.pinchInitialDistance = 0;
        return;
      }
      const distance = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
      if (this.pinchInitialDistance === 0) {
        this.pinchInitialDistance = distance;
        this.pinchInitialZoom = this.cameras.main.zoom;
      }
      const zoom = this.pinchInitialZoom * (distance / this.pinchInitialDistance);
      this.cameras.main.setZoom(Phaser.Math.Clamp(zoom, ZOOM_MIN, ZOOM_MAX));
    });

    this.input.on('pointerup', () => {
      this.pinchInitialDistance = 0;
    });
  }

  /** 給 React UI 提供的 zoom in/out 鈕 */
  zoomBy(factor: number) {
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Clamp(cam.zoom * factor, ZOOM_MIN, ZOOM_MAX));
  }

  /**
   * 場景裝飾:水墨意象 emoji(松、石、雲、月)散佈。
   * 用 deterministic 偽亂數,避免每次 reload 位置變動。
   * 之後若有正式美術 asset(水墨松/石/雲圖檔)再替換。
   */
  private drawDecorations() {
    const decoEmojis = ['🌲', '🪨', '☁️', '🌙'];
    for (let i = 0; i < 60; i++) {
      const x = pseudoRand(i * 31) * WORLD_SIZE;
      const y = pseudoRand(i * 17 + 5) * WORLD_SIZE;
      const emoji = decoEmojis[Math.floor(pseudoRand(i) * decoEmojis.length)];
      const text = this.add.text(x, y, emoji, {
        fontSize: '28px',
        fontFamily:
          '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'
      });
      text.setOrigin(0.5).setAlpha(0.7);
      text.setDepth(-1);
    }
  }

  private setupCameraDrag() {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.dragStart = { x: pointer.x, y: pointer.y };
      this.cameraStart = { x: this.cameras.main.scrollX, y: this.cameras.main.scrollY };
      this.didDrag = false;
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || !this.dragStart || !this.cameraStart) return;
      // 雙指按下時是 pinch zoom,不要當 drag 處理
      if (this.input.pointer1.isDown && this.input.pointer2.isDown) return;
      const dx = pointer.x - this.dragStart.x;
      const dy = pointer.y - this.dragStart.y;
      if (!this.didDrag && Math.hypot(dx, dy) > this.dragThreshold) {
        this.didDrag = true;
      }
      if (this.didDrag) {
        // 拖曳速度跟隨 zoom 反比例,zoom 越大移動 1px scroll 也 1px(視覺一致)
        const z = this.cameras.main.zoom || 1;
        this.cameras.main.scrollX = this.cameraStart.x - dx / z;
        this.cameras.main.scrollY = this.cameraStart.y - dy / z;
      }
    });
    this.input.on('pointerup', () => {
      this.dragStart = null;
      this.cameraStart = null;
    });
  }

  /** 註冊點擊回呼，從 React 傳進來 */
  setClickHandler(handler: (petId: string) => void) {
    this.clickHandler = handler;
  }

  /**
   * 同步寵物清單到場景：
   *  - 不存在的 sprite 移除
   *  - 新出現的建立
   *  - 已存在的更新 emoji / tier / 損益
   */
  syncPets(pets: PetSpriteData[]) {
    const seen = new Set<string>();
    pets.forEach((p, idx) => {
      seen.add(p.petId);
      const existing = this.sprites.get(p.petId);
      if (existing) {
        existing.applyData(p);
      } else {
        const { x, y } = layoutFor(idx, p.petId);
        const sprite = new PetSprite(this, x, y, p);
        sprite.onPointerDown((id) => {
          if (this.didDrag) return; // 拖曳中不算點擊
          this.clickHandler?.(id);
        });
        this.sprites.set(p.petId, sprite);
      }
    });
    // 移除已賣光（retired）的
    for (const [id, sprite] of this.sprites) {
      if (!seen.has(id)) {
        sprite.destroy();
        this.sprites.delete(id);
      }
    }
  }

  update(time: number, delta: number) {
    for (const sprite of this.sprites.values()) {
      sprite.step(time, delta);
    }
  }

  /** 攝影機回到中心（給「重置視角」按鈕用） */
  centerCamera() {
    this.cameras.main.scrollX = (WORLD_SIZE - this.cameras.main.width) / 2;
    this.cameras.main.scrollY = (WORLD_SIZE - this.cameras.main.height) / 2;
  }

  destroy() {
    for (const sprite of this.sprites.values()) {
      sprite.destroy();
    }
    this.sprites.clear();
  }
}

/** 依 index 給寵物一個固定的「領地中心」，避免重疊 */
function layoutFor(idx: number, petId: string): { x: number; y: number } {
  const col = idx % COLS;
  const row = Math.floor(idx / COLS);
  // 在格子內以 petId 雜湊偏移，避免完全格狀
  const seed = petId.charCodeAt(0) + petId.charCodeAt(petId.length - 1);
  const offsetX = (pseudoRand(seed) - 0.5) * 60;
  const offsetY = (pseudoRand(seed + 1) - 0.5) * 60;
  return {
    x: GRID_CELL / 2 + col * GRID_CELL + offsetX,
    y: GRID_CELL / 2 + row * GRID_CELL + offsetY
  };
}

/** 確定性偽亂數（0-1） */
function pseudoRand(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}
