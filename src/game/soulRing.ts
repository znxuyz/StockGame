import Phaser from 'phaser';
import { REALM_COLOR, type SoulRealm, type RingEffect } from '@/services/petTier';

/**
 * 魂環渲染器(階段 1.2 + 1.3)。
 *
 * 9 顆 ring graphic 半圓排列在神獸腳下,顏色對應魂環境界:
 *   fan(凡)  ⚪ 白         ling(靈) 🟡 黃
 *   yao(妖)  🟣 紫         shen(神) ⚫ 黑(銀邊光暈)
 *   sheng(聖) 🔴 紅         xian(仙) 🌈 彩虹漸層
 *
 * 排列:半圓在神獸腳下,index 0(左) → index 8(右),弧形微笑狀。
 * 9 顆 ring 都裝在 ringContainer(sub-container)裡,ringContainer addAt(0)
 * 進 PetSprite.container 最底層。對 ringContainer 做 alpha / angle tween
 * 讓 9 顆環一起動。
 *
 * 特效(applyEffect,階段 1.3):
 *   dim       alpha 0.3 靜態
 *   normal    alpha 1.0 靜態
 *   pulsing   alpha tween 0.5 ↔ 1.0,週期 1.5s
 *   rotating  angle 360° tween 8s/圈
 *   erupting  angle 360° tween 4s/圈 + 每顆 ring 800ms 噴小金光點向上飛 1s 淡出
 */

const RING_COUNT = 9;
/** 每顆 ring 的圓周半徑 — 直徑 ~16 px */
const RING_RADIUS = 8;
/** 半圓水平半徑(相對 sprite 寬度) */
const ARC_RADIUS_X_RATIO = 0.55;
/** 半圓垂直半徑(相對 sprite 高度,壓扁形成弧線) */
const ARC_RADIUS_Y_RATIO = 0.18;
/** 半圓中心 y 偏移(相對 sprite 高度,把弧推到腳下) */
const ARC_OFFSET_Y_RATIO = 0.45;

/** 彩虹色順序 — xian 仙境用,每環疊 6 圈不同色形成漸層 */
const RAINBOW_COLORS = [0xff0000, 0xff7f00, 0xffff00, 0x00ff00, 0x0000ff, 0x9400d3];

/** 噴光粒子:每顆 ring 每 N ms 噴一個 */
const ERUPTION_INTERVAL = 800;
/** 粒子向上飛距離(local 座標,ringContainer 旋轉時方向會跟著轉) */
const ERUPTION_DISTANCE = 40;
/** 粒子壽命 ms */
const ERUPTION_LIFESPAN = 1000;
/** 粒子半徑 */
const ERUPTION_RADIUS = 2;
/** 粒子顏色(金色) */
const ERUPTION_COLOR = 0xffd700;

export class SoulRingRenderer {
  private scene: Phaser.Scene;
  /** sub-container 包 9 顆 ring + erupting particles。對 container 做 tween,9 顆一起動 */
  private container: Phaser.GameObjects.Container;
  /** 9 顆 ring graphic,destroy / re-render 時清空 */
  private rings: Phaser.GameObjects.Graphics[] = [];
  /** Sprite 顯示尺寸,計算半圓座標用 */
  private spriteSize: number;
  /** 最近一次的 effect,destroy 時用來清 tween */
  private currentEffect: RingEffect = 'normal';
  /** 當前 effect 的 tween,切換 effect 要清掉 */
  private effectTweens: Phaser.Tweens.Tween[] = [];
  /** Erupting 的循環 timer,各 ring 一個,切換 effect 要全清 */
  private effectTimers: Phaser.Time.TimerEvent[] = [];

  constructor(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, spriteSize: number) {
    this.scene = scene;
    this.spriteSize = spriteSize;
    // 建立 ring sub-container,addAt(0) 放最底層讓 sprite 蓋上
    this.container = scene.add.container(0, 0);
    parent.addAt(this.container, 0);
  }

  /**
   * 重畫 9 顆 ring。每次 realm 變動時呼叫(effect 變動只跑 applyEffect)。
   */
  render(realm: SoulRealm, effect: RingEffect) {
    this.clearRings();

    const radiusX = this.spriteSize * ARC_RADIUS_X_RATIO;
    const radiusY = this.spriteSize * ARC_RADIUS_Y_RATIO;
    const offsetY = this.spriteSize * ARC_OFFSET_Y_RATIO;

    // 半圓 angle ∈ [π, 2π](下半圓),index 0 在左、index 8 在右
    const startAngle = Math.PI;
    const totalAngle = Math.PI;

    for (let i = 0; i < RING_COUNT; i++) {
      const angle = startAngle + (i / (RING_COUNT - 1)) * totalAngle;
      const x = Math.cos(angle) * radiusX;
      const y = Math.sin(angle) * radiusY + offsetY;
      const ring = this.drawRing(x, y, realm);
      this.rings.push(ring);
      this.container.add(ring);
    }

    this.applyEffect(effect);
  }

  /**
   * 畫單一 ring 在 (x, y) 位置。realm 決定顏色 + 是否加裝飾(銀邊 / 彩虹)。
   */
  private drawRing(x: number, y: number, realm: SoulRealm): Phaser.GameObjects.Graphics {
    const ring = this.scene.add.graphics();
    ring.x = x;
    ring.y = y;

    if (realm === 'xian') {
      // 仙境:6 色彩虹同心環疊加,從內到外漸大
      RAINBOW_COLORS.forEach((c, layer) => {
        ring.lineStyle(1.5, c, 0.85);
        ring.strokeCircle(0, 0, RING_RADIUS + layer * 0.6);
      });
      return ring;
    }

    const color = REALM_COLOR[realm];
    if (color !== null) {
      ring.lineStyle(3, color, 0.85);
      ring.strokeCircle(0, 0, RING_RADIUS);
    }

    if (realm === 'shen') {
      // 神境黑環外加銀色光暈,讓黑色不會在深色背景消失
      ring.lineStyle(1, 0xcccccc, 0.6);
      ring.strokeCircle(0, 0, RING_RADIUS + 3);
    }

    return ring;
  }

  /**
   * 套用 effect 視覺。階段 1.3 完整實作 5 種特效:
   *   dim      alpha 0.3 靜態
   *   normal   alpha 1.0 靜態
   *   pulsing  alpha tween 0.5↔1.0(1.5s 週期 yoyo)
   *   rotating ringContainer angle 0→360°(8s/圈)
   *   erupting ringContainer angle 0→360°(4s/圈)+ 每顆 ring 800ms 噴金光向上飛
   *
   * 切換時先清掉舊 tween + timer,再套新效果。alpha / angle 也手動 reset
   * 避免上次 effect 殘留(例如從 rotating 切回 normal,angle 卡在某個值)。
   */
  applyEffect(effect: RingEffect) {
    this.currentEffect = effect;

    // 1. 清舊 tween / timer
    for (const t of this.effectTweens) t.stop();
    this.effectTweens = [];
    for (const t of this.effectTimers) t.remove(false);
    this.effectTimers = [];

    // 2. 重置 container 屬性(避免上一個 effect 殘留)
    this.scene.tweens.killTweensOf(this.container);
    this.container.setAlpha(1);
    this.container.setAngle(0);

    // 3. 套新效果
    if (effect === 'dim') {
      this.container.setAlpha(0.3);
      return;
    }
    if (effect === 'normal') {
      // 靜態,什麼都不做
      return;
    }
    if (effect === 'pulsing') {
      this.effectTweens.push(
        this.scene.tweens.add({
          targets: this.container,
          alpha: { from: 0.5, to: 1 },
          duration: 1500,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        })
      );
      return;
    }
    if (effect === 'rotating') {
      this.effectTweens.push(
        this.scene.tweens.add({
          targets: this.container,
          angle: 360,
          duration: 8000,
          repeat: -1,
          ease: 'Linear'
        })
      );
      return;
    }
    if (effect === 'erupting') {
      // 旋轉(快 2 倍)+ 每顆 ring 800ms 一個粒子
      this.effectTweens.push(
        this.scene.tweens.add({
          targets: this.container,
          angle: 360,
          duration: 4000,
          repeat: -1,
          ease: 'Linear'
        })
      );
      for (const ring of this.rings) {
        this.effectTimers.push(
          this.scene.time.addEvent({
            delay: ERUPTION_INTERVAL,
            loop: true,
            callback: () => this.spawnEruptionParticle(ring.x, ring.y)
          })
        );
      }
      return;
    }
  }

  /**
   * 從 (x, y) 噴一個小金光點向上飛 + 淡出。
   * 粒子加進 ringContainer:旋轉中時,粒子會跟著 ring 旋轉的方向飛出,
   * 看起來像離心煙火,符合「噴光」意象。
   */
  private spawnEruptionParticle(x: number, y: number) {
    const p = this.scene.add.graphics();
    p.x = x;
    p.y = y;
    p.fillStyle(ERUPTION_COLOR, 1);
    p.fillCircle(0, 0, ERUPTION_RADIUS);
    this.container.add(p);
    this.scene.tweens.add({
      targets: p,
      y: y - ERUPTION_DISTANCE,
      alpha: 0,
      duration: ERUPTION_LIFESPAN,
      ease: 'Cubic.easeOut',
      onComplete: () => p.destroy()
    });
  }

  getEffect(): RingEffect {
    return this.currentEffect;
  }

  clearRings() {
    for (const r of this.rings) {
      this.scene.tweens.killTweensOf(r);
      r.destroy();
    }
    this.rings = [];
  }

  destroy() {
    for (const t of this.effectTweens) t.stop();
    this.effectTweens = [];
    for (const t of this.effectTimers) t.remove(false);
    this.effectTimers = [];
    this.scene.tweens.killTweensOf(this.container);
    this.clearRings();
    this.container.destroy();
  }
}
