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
/** 攝影機 zoom 範圍 */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;

/** 場景底色:暖米紙色,讓寵物立繪自帶的米紙底不會跟場景出現顯著邊界 */
const RICE_PAPER_BG = '#efe6cf';

/**
 * 神獸活動區域(playableArea)邊界保留:
 *  - HUD 在 viewport 上方 ~90px,神獸 home 不該在那帶 + 30px buffer
 *  - BottomBar 在 viewport 下方 ~110px,神獸 home 不該在那帶 + 30px buffer
 *  - 兩側 40px 留白讓神獸不貼牆
 *  - 數字跟 .hud / .hud-bottom 的 padding/box-shadow 範圍對齊
 */
const HUD_HEIGHT = 90;
const BOTTOM_BAR_HEIGHT = 110;
const PET_VERTICAL_PADDING = 30;
const PET_SIDE_PADDING = 40;
/** 神獸 home 之間最小距離(避免初始重疊) */
const MIN_PET_SPACING = 80;

export interface PlayableArea {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export class WorldScene extends Phaser.Scene {
  private sprites: Map<string, PetSprite> = new Map();
  private clickHandler: ((petId: string) => void) | null = null;
  private dragStart: { x: number; y: number } | null = null;
  private cameraStart: { x: number; y: number } | null = null;
  /** 拖曳判斷門檻（像素），低於此距離視為點擊 */
  private dragThreshold = 6;
  private didDrag = false;
  /** 哪一隻寵物按下了 pointer。pointerup 沒拖曳才會 fire click */
  private pendingPetClick: string | null = null;

  constructor() {
    super('WorldScene');
  }

  preload() {
    // 載入主背景 + 兩種粒子(JPG 黑底 spark 用 ADD blend 直接吃黑)
    const base = import.meta.env.BASE_URL ?? '/';
    this.load.image('world-bg', `${base}assets/bg/main.JPG`);
    this.load.image('petal', `${base}assets/particles/petal.png`);
    this.load.image('spark', `${base}assets/particles/spark.JPG`);

    // 只對 art:true 的物種嘗試載入立繪 — 其他物種一定 fallback emoji,
    // 不必讓 Phaser 噴一堆 404 進 console。
    const artSpecies = CREATURES.filter((c) => c.art === true);
    if (artSpecies.length === 0) return;

    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      console.warn(`[WorldScene] sprite 載入失敗,fallback emoji:${file.key}`);
    });

    for (const c of artSpecies) {
      this.load.image(spriteKey(c.id), `${base}sprites/${c.id}.png`);
    }
  }

  /** 神獸活動區域(world coords),create() 跟 resize 時重算 */
  private playableArea: PlayableArea = { top: 0, bottom: 0, left: 0, right: 0 };

  create() {
    this.cameras.main.setBackgroundColor(RICE_PAPER_BG);
    this.cameras.main.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    // 起始置中
    this.cameras.main.scrollX = (WORLD_SIZE - this.cameras.main.width) / 2;
    this.cameras.main.scrollY = (WORLD_SIZE - this.cameras.main.height) / 2;

    // 點擊只觸發最上層 sprite,避免「點 A 跳 B 資訊」(depth 由 step() 寫成 y 座標)
    this.input.topOnly = true;

    this.computePlayableArea();
    // viewport resize(轉向、瀏覽器 resize)→ 重算 + 把超出範圍的神獸 tween 回有效區
    this.scale.on('resize', () => this.handleResize());

    this.drawBackground();
    this.spawnPetalRain();
    this.spawnSparks();
    this.setupCameraDrag();
    this.setupZoom();
  }

  /**
   * 神獸活動區域 = viewport 內,扣掉上方 HUD + 下方 BottomBar + 四週 buffer。
   * 用 default-centered camera 換算成 world 座標(camera 移動後 area 不再變,
   * 所以神獸鎖定在這個 world 矩形內,玩家拖 camera 看背景時神獸跟著移動,
   * 但 home 永遠在這塊 viewport-sized 區域裡)。
   */
  private computePlayableArea() {
    const cam = this.cameras.main;
    const scrollX = (WORLD_SIZE - cam.width) / 2;
    const scrollY = (WORLD_SIZE - cam.height) / 2;
    this.playableArea = {
      top: scrollY + HUD_HEIGHT + PET_VERTICAL_PADDING,
      bottom: scrollY + cam.height - BOTTOM_BAR_HEIGHT - PET_VERTICAL_PADDING,
      left: scrollX + PET_SIDE_PADDING,
      right: scrollX + cam.width - PET_SIDE_PADDING
    };
  }

  /** 給 PetSprite.pickNewTarget 用,wandering 限制在這個區域內 */
  getPlayableArea(): PlayableArea {
    return this.playableArea;
  }

  /**
   * 在 playableArea 內挑一個跟既有 home 距離 >= MIN_PET_SPACING 的隨機點。
   * 試 50 次找不到就 fallback 純隨機(密度太高時無法保證間距)。
   */
  private pickRandomHome(existing: Array<{ x: number; y: number }>): { x: number; y: number } {
    const a = this.playableArea;
    const w = Math.max(1, a.right - a.left);
    const h = Math.max(1, a.bottom - a.top);
    for (let attempt = 0; attempt < 50; attempt++) {
      const x = a.left + Math.random() * w;
      const y = a.top + Math.random() * h;
      const ok = existing.every((p) => Math.hypot(p.x - x, p.y - y) > MIN_PET_SPACING);
      if (ok) return { x, y };
    }
    return { x: a.left + Math.random() * w, y: a.top + Math.random() * h };
  }

  /** viewport resize → 把跑出新 area 邊界的神獸 tween 回最近的有效位置 */
  private handleResize() {
    this.computePlayableArea();
    const a = this.playableArea;
    for (const sprite of this.sprites.values()) {
      const home = sprite.getHome();
      const outOfBounds =
        home.x < a.left || home.x > a.right || home.y < a.top || home.y > a.bottom;
      if (outOfBounds) {
        const newX = Phaser.Math.Clamp(home.x, a.left, a.right);
        const newY = Phaser.Math.Clamp(home.y, a.top, a.bottom);
        sprite.setHome(newX, newY);
      }
    }
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
   * 鋪滿世界的主背景圖(bg/main.JPG 太極櫻花庭院)。
   * 用 cover-fit 縮放,水平剛好填滿,垂直略超出但被 camera bounds 裁掉。
   */
  private drawBackground() {
    if (!this.textures.exists('world-bg')) return;
    const bg = this.add.image(WORLD_SIZE / 2, WORLD_SIZE / 2, 'world-bg');
    const scale = Math.max(WORLD_SIZE / bg.width, WORLD_SIZE / bg.height);
    bg.setScale(scale).setDepth(-100);
  }

  /**
   * 櫻花飄落粒子(相機鎖定):
   *  - scrollFactor=0,跟著鏡頭走,不管 pan 到哪都從螢幕上方飄
   *  - x 範圍設大於任何手機螢幕寬,確保螢幕兩側都有粒子
   *  - 每顆 lifespan ~10 秒,frequency 500ms 一顆 → 螢幕上常有 ~20 顆
   */
  private spawnPetalRain() {
    if (!this.textures.exists('petal')) return;
    const emitter = this.add.particles(0, -40, 'petal', {
      x: { min: -100, max: 2400 },
      speedY: { min: 25, max: 65 },
      speedX: { min: -20, max: 20 },
      scale: { min: 0.18, max: 0.32 },
      rotate: { min: 0, max: 360 },
      alpha: { start: 0.85, end: 0 },
      lifespan: { min: 7000, max: 12000 },
      frequency: 500,
      quantity: 1
    });
    emitter.setScrollFactor(0).setDepth(100);
  }

  /**
   * 金光粒子(世界座標,加成混合):
   *  - 世界範圍隨機冒,二度淡入淡出像螢火
   *  - blendMode ADD 讓 spark.JPG 黑底直接被吃成透明,只剩金芒
   *  - depth -10,在 bg 上、寵物下,當 ambient 點綴
   */
  private spawnSparks() {
    if (!this.textures.exists('spark')) return;
    const emitter = this.add.particles(0, 0, 'spark', {
      x: { min: 0, max: WORLD_SIZE },
      y: { min: 0, max: WORLD_SIZE },
      scale: { start: 0.05, end: 0.18 },
      alpha: { start: 0.55, end: 0 },
      lifespan: 2200,
      frequency: 350,
      quantity: 1,
      blendMode: 'ADD'
    });
    emitter.setDepth(-10);
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
        // 一旦判定為拖曳,即使 pointerdown 落在寵物上也不算點擊
        this.pendingPetClick = null;
      }
      if (this.didDrag) {
        // 拖曳速度跟隨 zoom 反比例,zoom 越大移動 1px scroll 也 1px(視覺一致)
        const z = this.cameras.main.zoom || 1;
        this.cameras.main.scrollX = this.cameraStart.x - dx / z;
        this.cameras.main.scrollY = this.cameraStart.y - dy / z;
      }
    });
    this.input.on('pointerup', () => {
      // 沒拖曳 + pointerdown 落在寵物上 → 真正觸發點擊
      if (!this.didDrag && this.pendingPetClick) {
        this.clickHandler?.(this.pendingPetClick);
      }
      this.pendingPetClick = null;
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
   *  - 新出現的建立 — home 位置在 playableArea 隨機散佈,跟既有寵物距離 >= 80px
   *  - 已存在的更新 emoji / tier / 損益
   */
  syncPets(pets: PetSpriteData[]) {
    const seen = new Set<string>();
    pets.forEach((p) => {
      seen.add(p.petId);
      const existing = this.sprites.get(p.petId);
      if (existing) {
        existing.applyData(p);
      } else {
        const existingPositions = [...this.sprites.values()].map((s) => s.getHome());
        const { x, y } = this.pickRandomHome(existingPositions);
        const sprite = new PetSprite(this, x, y, p);
        // pointerdown 只記下「按到哪一隻」,真正 fire click 在 setupCameraDrag 的 pointerup
        // (那邊會 check didDrag,順便讓多隻重疊時改在 pointerup 拿 top-most)
        sprite.onPointerDown((id) => {
          this.pendingPetClick = id;
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
    // 軟性互推:重疊的兩隻每 frame 各分一半位移分離,
    // 跟 Phaser Arcade Physics 比起來不會 bouncy,但能保證不會疊在一起
    this.applyPairwiseRepulsion();
  }

  /**
   * 兩兩比對所有 sprite,距離 < REPULSION_RADIUS 就互推開:
   *  - 推力 = 重疊量 × 0.2(dampening 避免抖動)
   *  - 完全重疊(dist≈0)時隨機方向小推 5px 解套
   *  - nudge() 內部 clamp 到 playableArea,不會被推出邊界
   */
  private applyPairwiseRepulsion() {
    const sprites = [...this.sprites.values()];
    const PUSH_R = 95; // 對齊 petSprite 的 REPULSION_RADIUS
    for (let i = 0; i < sprites.length; i++) {
      for (let j = i + 1; j < sprites.length; j++) {
        const a = sprites[i];
        const b = sprites[j];
        const pa = a.getPosition();
        const pb = b.getPosition();
        const dx = pa.x - pb.x;
        const dy = pa.y - pb.y;
        const dist = Math.hypot(dx, dy);
        if (dist >= PUSH_R) continue;
        if (dist < 0.5) {
          // 完全重疊,隨機方向脫離
          const angle = Math.random() * Math.PI * 2;
          a.nudge(Math.cos(angle) * 5, Math.sin(angle) * 5);
          b.nudge(-Math.cos(angle) * 5, -Math.sin(angle) * 5);
          continue;
        }
        const overlap = PUSH_R - dist;
        const nx = dx / dist;
        const ny = dy / dist;
        const half = overlap * 0.2; // 0.2 dampening 防抖
        a.nudge(nx * half, ny * half);
        b.nudge(-nx * half, -ny * half);
      }
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

// (舊 layoutFor / pseudoRand 已移除,改用 WorldScene.pickRandomHome 在 playableArea 內隨機散佈)
