import Phaser from 'phaser';
import { PetSprite, spriteKey, type PetSpriteData } from './petSprite';
import { CREATURES } from '@/data/creatures';
import { REALM_COLOR, realmLabel, type SoulRealm } from '@/services/petTier';

/**
 * 水墨世界場景。
 *
 * 設計：
 *  - 世界範圍 2400x1600（橫向 3:2，類公主連結家園探索感）
 *  - playableArea = world-relative：神獸散布整個 world，玩家拖曳 camera 才能看到所有神獸
 *  - 寵物以「網格 + jitter」分散，避免重疊
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

/** 世界邏輯尺寸(world coords)。橫向 3:2 對應 bg/main.JPG 1344×896 也是 3:2,scale=1.79x cover */
export const WORLD_WIDTH = 2400;
export const WORLD_HEIGHT = 1600;
/** 攝影機 zoom 範圍 */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;

/** 場景底色:暖米紙色,讓寵物立繪自帶的米紙底不會跟場景出現顯著邊界 */
const RICE_PAPER_BG = '#efe6cf';

/**
 * 神獸活動區域(playableArea)邊界保留(world-relative,不再依 viewport):
 *  - HUD 在 viewport 上方 ~90px(不浮在 Phaser camera 上,但 camera 拖到 world top 時
 *    最上面 90px 仍會被 HUD 蓋住),所以從世界頂保留 HUD 高度 + buffer
 *  - BottomBar 在 viewport 下方 ~110px,從世界底保留同樣空間
 *  - 兩側 40px 留白讓神獸不貼邊
 *  - 註:zoom out (0.5x) 時邊緣神獸可能被 UI 蓋一點點,zoom in 觀察則無影響
 */
const HUD_HEIGHT = 90;
const BOTTOM_BAR_HEIGHT = 110;
const PET_VERTICAL_PADDING = 30;
const PET_SIDE_PADDING = 40;

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
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    // 起始置中(viewport 中心對齊 world 中心)
    this.cameras.main.scrollX = (WORLD_WIDTH - this.cameras.main.width) / 2;
    this.cameras.main.scrollY = (WORLD_HEIGHT - this.cameras.main.height) / 2;

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
   * 神獸活動區域 = world 座標,固定矩形(從 world 邊緣保留 UI 高度 + buffer)。
   * 不再隨 viewport / camera 變動 — 神獸永遠在 (40, 120) 到 (2360, 1460) 這塊
   * world rectangle 裡漫遊,玩家拖 camera 才能看到不同位置的神獸。
   */
  private computePlayableArea() {
    this.playableArea = {
      top: HUD_HEIGHT + PET_VERTICAL_PADDING,
      bottom: WORLD_HEIGHT - BOTTOM_BAR_HEIGHT - PET_VERTICAL_PADDING,
      left: PET_SIDE_PADDING,
      right: WORLD_WIDTH - PET_SIDE_PADDING
    };
  }

  /** PetSprite.wanderNext 用,自由漫遊目標必在這個區域內 */
  getPlayableArea(): PlayableArea {
    return this.playableArea;
  }

  /**
   * 在 playableArea 內以「網格 + jitter」分散神獸:
   *  - 6 隻 → 3×2 網格;9 隻 → 3×3;依 ceil(sqrt(N)) 決定列數
   *  - 每隻落在自己的 cell 中心 ± 40% jitter,避免完全格狀
   *  - 新增神獸時找「沒被佔據的格子」放,讓分散持續均勻
   */
  private pickGridCellPosition(targetTotal: number): { x: number; y: number } {
    const a = this.playableArea;
    const cols = Math.max(1, Math.ceil(Math.sqrt(targetTotal)));
    const rows = Math.max(1, Math.ceil(targetTotal / cols));
    const cellW = (a.right - a.left) / cols;
    const cellH = (a.bottom - a.top) / rows;
    const existingPositions = [...this.sprites.values()].map((s) => s.getPosition());

    // 走訪每個格子,挑第一個沒人在裡面的
    for (let i = 0; i < cols * rows; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = a.left + col * cellW + cellW / 2;
      const cy = a.top + row * cellH + cellH / 2;
      const occupied = existingPositions.some(
        (p) =>
          Math.abs(p.x - cx) < cellW * 0.5 && Math.abs(p.y - cy) < cellH * 0.5
      );
      if (!occupied) {
        const jitterX = (Math.random() - 0.5) * cellW * 0.4;
        const jitterY = (Math.random() - 0.5) * cellH * 0.4;
        return { x: cx + jitterX, y: cy + jitterY };
      }
    }
    // 全格滿(密度太高),fallback 純隨機 + 距離過濾
    return this.pickRandomFallback(existingPositions);
  }

  private pickRandomFallback(existing: Array<{ x: number; y: number }>): {
    x: number;
    y: number;
  } {
    const a = this.playableArea;
    const w = Math.max(1, a.right - a.left);
    const h = Math.max(1, a.bottom - a.top);
    for (let attempt = 0; attempt < 50; attempt++) {
      const x = a.left + Math.random() * w;
      const y = a.top + Math.random() * h;
      const ok = existing.every((p) => Math.hypot(p.x - x, p.y - y) > 80);
      if (ok) return { x, y };
    }
    return { x: a.left + Math.random() * w, y: a.top + Math.random() * h };
  }

  /** wanderNext 用:給某隻神獸所有「其他神獸」的當前位置(避免目標太近) */
  getOtherPositions(excludePetId: string): Array<{ x: number; y: number }> {
    const out: Array<{ x: number; y: number }> = [];
    for (const [id, sprite] of this.sprites) {
      if (id === excludePetId) continue;
      out.push(sprite.getPosition());
    }
    return out;
  }

  /** viewport resize → 把跑出新 area 邊界的神獸 tween 回最近的有效位置,並重啟 wander */
  private handleResize() {
    this.computePlayableArea();
    const a = this.playableArea;
    for (const sprite of this.sprites.values()) {
      const pos = sprite.getPosition();
      const outOfBounds =
        pos.x < a.left || pos.x > a.right || pos.y < a.top || pos.y > a.bottom;
      if (outOfBounds) {
        const newX = Phaser.Math.Clamp(pos.x, a.left, a.right);
        const newY = Phaser.Math.Clamp(pos.y, a.top, a.bottom);
        sprite.relocate(newX, newY);
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
   * 鋪滿世界的主背景圖(bg/main.JPG 粉紅雲紋庭院)。
   * cover-fit 縮放:bg 1344×896 與 world 2400×1600 同 3:2 比例,scale ≈ 1.79x 完全覆蓋無裁切。
   */
  private drawBackground() {
    if (!this.textures.exists('world-bg')) return;
    const bg = this.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 'world-bg');
    const scale = Math.max(WORLD_WIDTH / bg.width, WORLD_HEIGHT / bg.height);
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
      x: { min: 0, max: WORLD_WIDTH },
      y: { min: 0, max: WORLD_HEIGHT },
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
   * 同步寵物清單到場景:
   *  - 不存在的 sprite 移除
   *  - 新出現的:
   *      a. 用 pickGridCellPosition 找空格(網格分散,均勻散佈整個 playableArea)
   *      b. PetSprite.startWandering() 啟動全地圖自由漫遊
   *  - 已存在的更新 emoji / level / 損益
   */
  syncPets(pets: PetSpriteData[]) {
    const seen = new Set<string>();
    // 先掃出新增的數量,讓 grid 計算用「最終總數」決定格數
    const newPets: PetSpriteData[] = [];
    for (const p of pets) {
      seen.add(p.petId);
      const existing = this.sprites.get(p.petId);
      if (existing) {
        existing.applyData(p);
      } else {
        newPets.push(p);
      }
    }

    const finalTotal = this.sprites.size + newPets.length;
    for (const p of newPets) {
      const { x, y } = this.pickGridCellPosition(finalTotal);
      const sprite = new PetSprite(this, x, y, p);
      // pointerdown 只記下「按到哪一隻」,真正 fire click 在 setupCameraDrag 的 pointerup
      sprite.onPointerDown((id) => {
        this.pendingPetClick = id;
      });
      this.sprites.set(p.petId, sprite);
      sprite.startWandering();
    }

    // 移除已賣光（retired）的
    for (const [id, sprite] of this.sprites) {
      if (!seen.has(id)) {
        sprite.destroy();
        this.sprites.delete(id);
      }
    }
  }

  update() {
    for (const sprite of this.sprites.values()) {
      sprite.step();
    }
    // 多圓形碰撞 — 圖案實體輪廓相交才彈,玩家視覺所見即邏輯
    this.applyBodyCollision();
  }

  /**
   * 多圓形碰撞檢查(per-pixel 90% 效果, 1% 成本):
   *  - 每隻神獸用 3 個圓覆蓋立繪輪廓(petSprite BODY_SHAPES)
   *  - 兩兩配對,任一對圓相交就視為碰撞
   *  - 50 隻 × 9 = 450 配對距離檢查/frame,完全 OK
   *  - 碰撞時兩邊都 bounceTo 反方向,各跳 60px,200ms cubic.easeOut tween
   *  - bouncing flag 期間跳過,避免 ping-pong
   *  - 完全重疊(中心距 < 0.5)時隨機方向脫離,避免除零
   */
  private applyBodyCollision() {
    const sprites = [...this.sprites.values()];
    const BOUNCE_FORCE = 60; // 反彈距離(每邊),總分離 ~120 ≈ 一個立繪寬度
    for (let i = 0; i < sprites.length; i++) {
      const a = sprites[i];
      if (a.isBouncing()) continue;
      const shapesA = a.getBodyShapesWorld();
      for (let j = i + 1; j < sprites.length; j++) {
        const b = sprites[j];
        if (b.isBouncing()) continue;
        const shapesB = b.getBodyShapesWorld();

        // 任一對 (a 的圓, b 的圓) 相交就判為碰撞
        let collided = false;
        outer: for (const sa of shapesA) {
          for (const sb of shapesB) {
            const dx = sb.x - sa.x;
            const dy = sb.y - sa.y;
            const minDist = sa.radius + sb.radius;
            if (dx * dx + dy * dy < minDist * minDist) {
              collided = true;
              break outer;
            }
          }
        }
        if (!collided) continue;

        // 彈開方向 = 從 b 中心指向 a 中心(a 退,b 推進反向)
        const pa = a.getPosition();
        const pb = b.getPosition();
        let dx = pa.x - pb.x;
        let dy = pa.y - pb.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.5) {
          // 完全重疊,隨機方向脫離
          const angle = Math.random() * Math.PI * 2;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
        } else {
          dx /= dist;
          dy /= dist;
        }
        a.bounceTo(pa.x + dx * BOUNCE_FORCE, pa.y + dy * BOUNCE_FORCE);
        b.bounceTo(pb.x - dx * BOUNCE_FORCE, pb.y - dy * BOUNCE_FORCE);
      }
    }
  }

  /** 攝影機回到中心（給「重置視角」按鈕用） */
  centerCamera() {
    this.cameras.main.scrollX = (WORLD_WIDTH - this.cameras.main.width) / 2;
    this.cameras.main.scrollY = (WORLD_HEIGHT - this.cameras.main.height) / 2;
  }

  /**
   * 境界突破慶祝動畫(階段 1.7)。
   *
   * 呼叫端(PhaserMap)偵測到 status.realm > pet.lastRealmCheck 觸發。
   * 整個過程 ~3 秒:
   *   - 全螢幕黑 overlay 淡入淡出(scrollFactor 0,擋住其他神獸聚焦)
   *   - 對應顏色光柱從 sprite 腳下升起 + 淡出
   *   - sprite 放大 1.2x 後縮回
   *   - 全螢幕中央文字「[名字] 突破至 X 境!」淡入淡出
   *
   * 不做的事:
   *   - 不寫 DB(lastRealmCheck 由呼叫端寫,scene 只負責視覺)
   *   - 不檢查 oldRealm vs newRealm 大小(由呼叫端把關)
   *   - 不重畫魂環(sprite.applyData 下次自然會 render 新 realm 顏色)
   */
  celebrateBreakthrough(petId: string, newRealm: SoulRealm, speciesName: string) {
    const sprite = this.sprites.get(petId);
    if (!sprite) return;
    const cam = this.cameras.main;
    const pos = sprite.getPosition();

    // 1. 全螢幕黑 overlay(viewport-fixed,深色幕讓主角凸出)
    const overlay = this.add.rectangle(
      cam.width / 2,
      cam.height / 2,
      cam.width,
      cam.height,
      0x000000
    );
    overlay.setAlpha(0).setScrollFactor(0).setDepth(9000);
    this.tweens.add({
      targets: overlay,
      alpha: 0.55,
      duration: 250,
      yoyo: true,
      hold: 2300,
      onComplete: () => overlay.destroy()
    });

    // 2. 光柱(world-positioned,跟 sprite 走)
    const pillarColor = REALM_COLOR[newRealm] ?? 0xff6b35; // xian (null) fallback 橘紅
    const pillar = this.add.rectangle(pos.x, pos.y + 70, 80, 0, pillarColor, 0.7);
    pillar.setOrigin(0.5, 1).setDepth(9100);
    this.tweens.add({
      targets: pillar,
      height: 400,
      alpha: 0,
      duration: 1500,
      ease: 'Cubic.easeOut',
      onComplete: () => pillar.destroy()
    });

    // 3. sprite 放大 1.2x → 縮回
    sprite.container.setDepth(9200); // 暫時拉到光柱之上,step() 下次會重設
    this.tweens.add({
      targets: sprite.container,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 600,
      ease: 'Back.easeOut',
      yoyo: true,
      hold: 1500,
      onComplete: () => {
        sprite.container.setScale(1);
      }
    });

    // 4. 全螢幕中央文字
    const textColor = pillarColor === 0x1a1a1a ? '#cccccc' : `#${pillarColor.toString(16).padStart(6, '0')}`;
    const title = this.add
      .text(
        cam.width / 2,
        cam.height / 2,
        `${speciesName} 突破至 ${realmLabel(newRealm)}境!`,
        {
          fontSize: '32px',
          fontFamily: '"Noto Sans TC",sans-serif',
          fontStyle: 'bold',
          color: textColor,
          stroke: '#000000',
          strokeThickness: 6,
          align: 'center'
        }
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(9300)
      .setAlpha(0);
    this.tweens.add({
      targets: title,
      alpha: 1,
      duration: 300,
      yoyo: true,
      hold: 2200,
      onComplete: () => title.destroy()
    });
  }

  destroy() {
    for (const sprite of this.sprites.values()) {
      sprite.destroy();
    }
    this.sprites.clear();
  }
}

// (舊 layoutFor / pseudoRand 已移除,改用 WorldScene.pickRandomHome 在 playableArea 內隨機散佈)
