import Phaser from 'phaser';
import type { WorldScene } from './scene';
import { SoulRingRenderer } from './soulRing';
import type { SoulRealm, RingEffect } from '@/services/petTier';

/**
 * 一隻寵物的視覺單位（立繪 / emoji + 損益標籤 + 名稱）。
 *
 * 設計：
 *  - 寵物本體優先用 Phaser.GameObjects.Image 顯示立繪(species.art=true 時),
 *    texture 載不到就 fallback 用 emoji Text(跨平台 OK)
 *  - 黑化用 tint+alpha 變灰暗,境界用 nameText 前綴 emoji 表示
 *  - 損益標籤用兩個 Text 疊在 Container 上方
 *  - 全部塞進 Container,方便整體位移
 *
 * 互動 (2026-05 更新):
 *  - hit area 改 makePixelPerfect(1) — 只有立繪不透明像素被算中
 *    (圓形 hit 範圍會誤觸視覺空白,user 堅持「點哪到哪」)
 *  - emoji fallback 沒 texture,退回預設 text bounds
 *  - hover tint 米白 + scale 1.05,pointerdown scale 0.92 yoyo + iOS 短震
 *
 * 動作 (2026-05 更新):
 *  - 不再有 home 領地概念
 *  - 全 playableArea 自由漫遊:scene.tweens 拉到隨機目標(>=80px 距離)
 *  - 抵達後停留 1-5 秒,再選新目標
 *  - tween 期間 step() 只更新 depth = container.y(下蓋上,視覺一致)
 */

export interface PetSpriteData {
  petId: string;
  /** 用來組 sprite texture key:`pet:${speciesId}` */
  speciesId: string;
  /** species.art 為 true,Phaser preload 已嘗試載入立繪 */
  hasArt: boolean;
  /** Sprite 載不到時用 emoji 兜底 */
  emoji: string;
  stockName: string;
  pnl: number;
  level: number;
  /** 魂環境界(凡/靈/妖/神/聖/仙)— 由 services/petTier.getRealm 算 */
  realm: SoulRealm;
  /** 魂環特效(暗/普通/脈動/旋轉/噴光)— 由 services/petTier.getRingEffect 算 */
  effect: RingEffect;
}

/** 自由漫遊速度(px/sec) */
const MOVE_SPEED = 30;
/** 兩次 wander 目標之間最小距離,避免原地小範圍打轉 */
const MIN_WANDER_DIST = 80;
/** 抵達目標後停留下界 1s */
const PAUSE_MIN = 1000;
/** 抵達目標後停留上界 5s */
const PAUSE_MAX = 5000;
/** Pixel-perfect 的 alpha threshold(>=1 才算 hit,過濾完全透明像素) */
const PIXEL_PERFECT_THRESHOLD = 1;
const EMOJI_SIZE = 100;
/** 立繪顯示邊長 */
const SPRITE_DISPLAY_SIZE = 130;

/**
 * 多圓形 body shape — 用 3 個圓覆蓋立繪實體輪廓(per-pixel 90% 效果, 1% 成本)。
 *  - 上圓 ≈ 頭 / 身體上半,下圓 ≈ 腳 / 尾
 *  - offset 用 container 局部座標(原點 = 立繪中心)
 *  - 50 隻 × 3×3 配對 = 450 距離檢查/frame,完全 OK
 *  - 半徑可視覺微調:目前覆蓋 130×130 立繪約 80% 不透明區
 */
export interface BodyShape {
  offsetX: number;
  offsetY: number;
  radius: number;
}
const BODY_SHAPES: BodyShape[] = [
  { offsetX: 0, offsetY: -25, radius: 30 }, // 上(頭)
  { offsetX: 0, offsetY: 15, radius: 40 }, // 中(身)
  { offsetX: 0, offsetY: 50, radius: 25 } // 下(腳)
];

/** 碰撞反彈 tween 時長 */
const BOUNCE_DURATION = 200;
/** 反彈後到下一次 wander 的恢復時間(神獸短暫呆著) */
const BOUNCE_RECOVERY = 300;

/** 組 Phaser texture key,跟 WorldScene.preload() 註冊的對應 */
export function spriteKey(speciesId: string): string {
  return `pet:${speciesId}`;
}

export class PetSprite {
  scene: Phaser.Scene;
  container: Phaser.GameObjects.Container;
  image: Phaser.GameObjects.Image;
  emoji: Phaser.GameObjects.Text;
  pnlBox: Phaser.GameObjects.Container;
  pnlText: Phaser.GameObjects.Text;
  pnlBg: Phaser.GameObjects.Rectangle;
  nameText: Phaser.GameObjects.Text;
  data: PetSpriteData;

  /** 互動目標 — art 走 image+pixelPerfect,emoji 走 emoji text(預設 bounds) */
  private hitTarget: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
  /** 走動方向 — 給 pointerout 還原翻面用 */
  private facingLeft = false;
  /** 抵達目標後排程的「下一輪 wander」timer,relocate/destroy 要取消 */
  private pendingTimer: Phaser.Time.TimerEvent | null = null;
  /** 9 顆魂環半圓渲染器(階段 1.2) */
  private ringRenderer: SoulRingRenderer;

  constructor(scene: Phaser.Scene, x: number, y: number, data: PetSpriteData) {
    this.scene = scene;
    this.data = data;

    // 容器（整體位移用）
    this.container = scene.add.container(x, y);

    // 立繪 + emoji 兜底
    const key = spriteKey(data.speciesId);
    const hasTexture = data.hasArt && scene.textures.exists(key);
    this.image = scene.add
      .image(0, 4, hasTexture ? key : '__missing__')
      .setOrigin(0.5)
      .setDisplaySize(SPRITE_DISPLAY_SIZE, SPRITE_DISPLAY_SIZE)
      .setVisible(hasTexture);

    this.emoji = scene.add
      .text(0, 4, data.emoji, {
        fontSize: `${EMOJI_SIZE}px`,
        fontFamily:
          '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'
      })
      .setOrigin(0.5)
      .setVisible(!hasTexture);

    const half = SPRITE_DISPLAY_SIZE / 2;

    // 損益標籤
    this.pnlBg = scene.add.rectangle(0, -half - 16, 76, 22, 0xffffff, 0.95);
    this.pnlBg.setStrokeStyle(1, 0xe5e7eb);
    this.pnlText = scene.add
      .text(0, -half - 16, '+0', {
        fontSize: '14px',
        fontFamily: '"Noto Sans TC",sans-serif',
        fontStyle: 'bold',
        color: '#1f9e4a'
      })
      .setOrigin(0.5);
    this.pnlBox = scene.add.container(0, 0, [this.pnlBg, this.pnlText]);

    // 名牌 — 股票名 + 修為等級
    this.nameText = scene.add
      .text(0, half + 6, `${data.stockName} · Lv.${data.level}`, {
        fontSize: '13px',
        fontFamily: '"Noto Sans TC",sans-serif',
        color: '#1f2937',
        backgroundColor: '#ffffffcc',
        padding: { left: 4, right: 4, top: 1, bottom: 1 }
      })
      .setOrigin(0.5, 0);

    this.container.add([this.image, this.emoji, this.pnlBox, this.nameText]);

    // 魂環渲染器(addAt 0 把 ring 放最底層,sprite 蓋在上面)
    this.ringRenderer = new SoulRingRenderer(scene, this.container, SPRITE_DISPLAY_SIZE);

    // === 互動 ===
    // pixelPerfect 必須對有 texture 的 GameObject 設,Container 沒 texture。
    // 所以拿 image(art)或 emoji(fallback)當 hitTarget,事件 listener 都掛上去。
    if (hasTexture) {
      this.hitTarget = this.image;
      // 只算立繪不透明區域,不會在透明像素誤觸 → 點哪到哪精準度
      this.image.setInteractive(scene.input.makePixelPerfect(PIXEL_PERFECT_THRESHOLD));
    } else {
      this.hitTarget = this.emoji;
      // emoji text 退回預設 rectangular bounds(text 有自己的測量)
      this.emoji.setInteractive();
    }
    this.bindPointerHandlers();

    this.applyData(data);
  }

  /** 把 hover / down 事件綁到 hitTarget;hitTarget 改變時(applyData 換 art)要重綁 */
  private bindPointerHandlers() {
    this.hitTarget.on('pointerover', () => {
      this.scene.input.setDefaultCursor('pointer');
      this.image.setTint(0xfff8dc);
      this.image.setScale(this.image.scaleX * 1.05, this.image.scaleY * 1.05);
    });
    this.hitTarget.on('pointerout', () => {
      this.scene.input.setDefaultCursor('default');
      this.image.clearTint();
      this.image.setDisplaySize(SPRITE_DISPLAY_SIZE, SPRITE_DISPLAY_SIZE);
      this.image.setFlipX(this.facingLeft);
    });
    this.hitTarget.on('pointerdown', () => {
      // 視覺反饋:整個 container 縮 92% yoyo,玩家明確感受按到了
      this.scene.tweens.add({
        targets: this.container,
        scaleX: 0.92,
        scaleY: 0.92,
        duration: 80,
        yoyo: true,
        ease: 'Sine.easeOut'
      });
      // Android Chrome 短震 10ms(iOS Safari 不支援 navigator.vibrate)
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(10);
      }
    });
  }

  /** 把玩家點擊轉發出去,讓 React 知道哪隻寵物被點 */
  onPointerDown(handler: (petId: string) => void) {
    this.hitTarget.on('pointerdown', () => handler(this.data.petId));
  }

  applyData(data: PetSpriteData) {
    const prev = this.data;
    this.data = data;

    const key = spriteKey(data.speciesId);
    const hasTexture = data.hasArt && this.scene.textures.exists(key);

    if (hasTexture) {
      this.image.setTexture(key);
      this.image.setDisplaySize(SPRITE_DISPLAY_SIZE, SPRITE_DISPLAY_SIZE);
      this.image.setVisible(true);
      this.emoji.setVisible(false);
    } else {
      this.image.setVisible(false);
      this.emoji.setText(data.emoji);
      this.emoji.setVisible(true);
    }

    const sign = data.pnl >= 0 ? '+' : '';
    this.pnlText.setText(`${sign}${formatThousands(Math.round(data.pnl))}`);
    this.pnlText.setColor(data.pnl >= 0 ? '#e23b3b' : '#1f9e4a');
    this.nameText.setText(`${data.stockName} · Lv.${data.level}`);

    if (prev?.pnl !== undefined && prev.pnl !== data.pnl) {
      this.flashPnL(data.pnl > prev.pnl ? 0xfde68a : 0xfecaca);
    }

    // 魂環:realm 變動 → 重畫 9 顆環(換顏色);只 effect 變動 → 只切 alpha 不重畫
    const realmChanged = !prev || prev.realm !== data.realm;
    const effectChanged = !prev || prev.effect !== data.effect;
    if (realmChanged) {
      this.ringRenderer.render(data.realm, data.effect);
    } else if (effectChanged) {
      this.ringRenderer.applyEffect(data.effect);
    }
  }

  flashPnL(color: number) {
    this.pnlBg.setFillStyle(color, 0.95);
    this.scene.time.delayedCall(500, () => {
      this.pnlBg.setFillStyle(0xffffff, 0.95);
    });
  }

  /** scene 在 sprite 加進來後呼叫,啟動全地圖自由漫遊 */
  startWandering() {
    this.wanderNext();
  }

  /**
   * 隨機挑 playableArea 內、距離當前位置 >= MIN_WANDER_DIST、
   * 且離其他神獸 >= MIN_WANDER_DIST 的目標,tween 過去再排下一輪。
   */
  private wanderNext() {
    const worldScene = this.scene as WorldScene;
    const a = worldScene.getPlayableArea();
    const others = worldScene.getOtherPositions(this.data.petId);
    const cur = { x: this.container.x, y: this.container.y };

    let target = cur;
    for (let i = 0; i < 20; i++) {
      const tx = a.left + Math.random() * (a.right - a.left);
      const ty = a.top + Math.random() * (a.bottom - a.top);
      const distSelf = Math.hypot(tx - cur.x, ty - cur.y);
      if (distSelf < MIN_WANDER_DIST) continue;
      const tooClose = others.some(
        (p) => Math.hypot(tx - p.x, ty - p.y) < MIN_WANDER_DIST
      );
      if (tooClose) continue;
      target = { x: tx, y: ty };
      break;
    }

    // 朝目標翻面
    this.facingLeft = target.x < cur.x;
    this.image.setFlipX(this.facingLeft);
    this.emoji.setScale(this.facingLeft ? -1 : 1, 1);

    const dist = Math.hypot(target.x - cur.x, target.y - cur.y);
    const duration = Math.max(500, (dist / MOVE_SPEED) * 1000);

    this.scene.tweens.add({
      targets: this.container,
      x: target.x,
      y: target.y,
      duration,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        // 停 1-5 秒讓玩家看清,再走下一段
        this.pendingTimer = this.scene.time.delayedCall(
          PAUSE_MIN + Math.random() * (PAUSE_MAX - PAUSE_MIN),
          () => this.wanderNext()
        );
      }
    });
  }

  /** 取消當前 tween + pending timer,平滑移到新位置後重啟漫遊 (resize 時用) */
  relocate(x: number, y: number) {
    this.scene.tweens.killTweensOf(this.container);
    if (this.pendingTimer) {
      this.pendingTimer.remove();
      this.pendingTimer = null;
    }
    this.scene.tweens.add({
      targets: this.container,
      x,
      y,
      duration: 600,
      ease: 'Cubic.easeOut',
      onComplete: () => this.wanderNext()
    });
  }

  /** scene update 用:讓 collision 檢查拿位置算距離 */
  getPosition(): { x: number; y: number } {
    return { x: this.container.x, y: this.container.y };
  }

  /**
   * 回傳這隻神獸的 3 個 body 圓(已換成世界座標)讓 scene 做圓-圓相交檢查。
   * 局部 offset 已加 container.x/y,scene 直接用。
   */
  getBodyShapesWorld(): Array<{ x: number; y: number; radius: number }> {
    return BODY_SHAPES.map((s) => ({
      x: this.container.x + s.offsetX,
      y: this.container.y + s.offsetY,
      radius: s.radius
    }));
  }

  /** 反彈中:scene 在 bounce tween + 恢復期間都跳過此 sprite 的碰撞檢查 */
  isBouncing(): boolean {
    return this.bouncing;
  }
  private bouncing = false;

  /**
   * scene 偵測到 body 圓相交時呼叫:
   *  - 取消當前 wander tween 與 pendingTimer
   *  - 200ms cubic.easeOut tween 到 (targetX, targetY)
   *  - 600ms 恢復期(站在原地呆著,不被再次彈)
   *  - 然後 wanderNext() 重新挑目標
   *
   *  bouncing flag 整個流程都 true,scene 不會 ping-pong 反彈
   */
  bounceTo(targetX: number, targetY: number) {
    this.scene.tweens.killTweensOf(this.container);
    if (this.pendingTimer) {
      this.pendingTimer.remove();
      this.pendingTimer = null;
    }
    this.bouncing = true;

    const a = (this.scene as WorldScene).getPlayableArea();
    const bx = clamp(targetX, a.left, a.right);
    const by = clamp(targetY, a.top, a.bottom);

    // 翻面跟反彈方向一致
    this.facingLeft = bx < this.container.x;
    this.image.setFlipX(this.facingLeft);
    this.emoji.setScale(this.facingLeft ? -1 : 1, 1);

    this.scene.tweens.add({
      targets: this.container,
      x: bx,
      y: by,
      duration: BOUNCE_DURATION,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.pendingTimer = this.scene.time.delayedCall(BOUNCE_RECOVERY, () => {
          this.bouncing = false;
          this.wanderNext();
        });
      }
    });
  }

  /** 每 tick 呼叫:只剩 depth 排序(走動由 tween 處理) */
  step() {
    this.container.setDepth(this.container.y);
  }

  destroy() {
    this.scene.tweens.killTweensOf(this.container);
    if (this.pendingTimer) {
      this.pendingTimer.remove();
      this.pendingTimer = null;
    }
    this.ringRenderer.destroy();
    this.container.destroy();
  }
}

function formatThousands(n: number): string {
  return n.toLocaleString('en-US');
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
