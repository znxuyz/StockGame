import Phaser from 'phaser';
import { REALM_COLOR, type SoulRealm, type RingEffect } from '@/services/petTier';

/**
 * 魂環渲染器(階段 1.2)。
 *
 * 9 顆 ring graphics 半圓排列在神獸腳下,顏色對應魂環境界:
 *   fan(凡)  ⚪ 白         ling(靈) 🟡 黃
 *   yao(妖)  🟣 紫         shen(神) ⚫ 黑(銀邊光暈)
 *   sheng(聖) 🔴 紅         xian(仙) 🌈 彩虹漸層
 *
 * 排列:半圓在神獸腳下,index 0(左) → index 8(右),弧形微笑狀。
 * 預設 add 進 PetSprite.container 內部的最底層(addAt(0)),自動跟著神獸位移,
 * 不需要 sync 位置。
 *
 * 階段 1.2 範圍:render 9 顆環 + realm 顏色。
 * 階段 1.3 才補完 applyEffect 的 pulsing / rotating / erupting 動畫(目前 dim
 * 走 alpha 0.3、其他都 alpha 1)。
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

export class SoulRingRenderer {
  private scene: Phaser.Scene;
  /** 9 顆 ring graphic,destroy / re-render 時清空 */
  private rings: Phaser.GameObjects.Graphics[] = [];
  /** PetSprite.container 引用,addAt(0) 把 ring 放最底層讓 sprite 蓋上 */
  private parent: Phaser.GameObjects.Container;
  /** Sprite 顯示尺寸,計算半圓座標用 */
  private spriteSize: number;
  /** 最近一次的 effect,destroy 時用來清 tween */
  private currentEffect: RingEffect = 'normal';

  constructor(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, spriteSize: number) {
    this.scene = scene;
    this.parent = parent;
    this.spriteSize = spriteSize;
  }

  /**
   * 重畫 9 顆 ring。每次 realm / effect 變動時呼叫。
   * 為了避免重畫在每 frame 都跑,呼叫端應自己判斷 realm/effect 是否真的變了。
   */
  render(realm: SoulRealm, effect: RingEffect) {
    this.clearRings();

    const radiusX = this.spriteSize * ARC_RADIUS_X_RATIO;
    const radiusY = this.spriteSize * ARC_RADIUS_Y_RATIO;
    const offsetY = this.spriteSize * ARC_OFFSET_Y_RATIO;

    // 半圓覆蓋 angle ∈ [π, 2π](下半圓),index 0 在左、index 8 在右
    const startAngle = Math.PI;
    const totalAngle = Math.PI;

    for (let i = 0; i < RING_COUNT; i++) {
      const angle = startAngle + (i / (RING_COUNT - 1)) * totalAngle;
      const x = Math.cos(angle) * radiusX;
      const y = Math.sin(angle) * radiusY + offsetY;
      const ring = this.drawRing(x, y, realm);
      this.rings.push(ring);
      // addAt(0) 放在 parent container 最底層(神獸 image / emoji 蓋在上面)
      this.parent.addAt(ring, 0);
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
   * 套用 effect 視覺。階段 1.2 只支援:
   *   dim     → alpha 0.3
   *   normal  → alpha 1.0
   * 階段 1.3 會補:
   *   pulsing  alpha tween 0.5↔1.0
   *   rotating 整組魂環旋轉
   *   erupting 旋轉 + 粒子噴發
   */
  applyEffect(effect: RingEffect) {
    this.currentEffect = effect;
    const alpha = effect === 'dim' ? 0.3 : 1.0;
    for (const ring of this.rings) {
      ring.setAlpha(alpha);
    }
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
    this.clearRings();
  }
}
