import Phaser from 'phaser';

/**
 * 一隻寵物的視覺單位（emoji + 境界光環 + 損益標籤 + 名稱）。
 *
 * 設計：
 *  - emoji 用 Phaser.GameObjects.Text 顯示（不需要美術 asset，跨平台 OK）
 *  - 境界光環用 Graphics 畫圓
 *  - 損益標籤用兩個 Text 疊在 Container 上方
 *  - 全部塞進 Container，方便整體位移
 *
 * 動作：
 *  - 在 territory（半徑 80）內隨機漫步
 *  - 速度慢（每秒 ~20 px）
 *  - 達到目標點後 0.5-3 秒停留，再選新目標
 */

export interface PetSpriteData {
  petId: string;
  emoji: string;
  stockName: string;
  pnl: number;
  level: number;
  tier: PetTier;
  isCorrupted: boolean;
}

export type PetTier =
  | 'normal'
  | 'spirit'
  | 'demon'
  | 'god'
  | 'saint'
  | 'celestial'
  | 'cursed1'
  | 'cursed2'
  | 'cursed3';

const TIER_COLOR: Record<PetTier, number> = {
  normal: 0xd1d5db, // gray-300
  spirit: 0x22c55e,
  demon: 0xa855f7,
  god: 0xeab308,
  saint: 0xf97316,
  celestial: 0xec4899,
  cursed1: 0x6b21a8,
  cursed2: 0x991b1b,
  cursed3: 0x111111
};

const TERRITORY_RADIUS = 80;
const MOVE_SPEED = 18; // px/sec
const RING_RADIUS = 38;
const EMOJI_SIZE = 56;

export class PetSprite {
  scene: Phaser.Scene;
  container: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Arc;
  emoji: Phaser.GameObjects.Text;
  pnlBox: Phaser.GameObjects.Container;
  pnlText: Phaser.GameObjects.Text;
  pnlBg: Phaser.GameObjects.Rectangle;
  nameText: Phaser.GameObjects.Text;

  /** 領地中心 */
  homeX: number;
  homeY: number;
  /** 當前移動目標點（世界座標） */
  targetX: number;
  targetY: number;
  /** 抵達目標後的停留時間（ms） */
  pauseUntil = 0;

  data: PetSpriteData;

  constructor(scene: Phaser.Scene, x: number, y: number, data: PetSpriteData) {
    this.scene = scene;
    this.homeX = x;
    this.homeY = y;
    this.targetX = x;
    this.targetY = y;
    this.data = data;

    // 容器（整體位移用）
    this.container = scene.add.container(x, y);

    // 光環
    this.ring = scene.add.circle(0, 0, RING_RADIUS, 0xffffff, 0.6);
    this.ring.setStrokeStyle(4, TIER_COLOR[data.tier]);

    // emoji
    this.emoji = scene.add
      .text(0, 4, data.emoji, {
        fontSize: `${EMOJI_SIZE}px`,
        fontFamily:
          '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'
      })
      .setOrigin(0.5);

    // 損益標籤背景 + 文字
    this.pnlBg = scene.add.rectangle(0, -RING_RADIUS - 16, 76, 22, 0xffffff, 0.95);
    this.pnlBg.setStrokeStyle(1, 0xe5e7eb);
    this.pnlText = scene.add
      .text(0, -RING_RADIUS - 16, '+0', {
        fontSize: '14px',
        fontFamily: '"Noto Sans TC",sans-serif',
        fontStyle: 'bold',
        color: '#1f9e4a'
      })
      .setOrigin(0.5);
    this.pnlBox = scene.add.container(0, 0, [this.pnlBg, this.pnlText]);

    // 股票名稱（在腳邊）
    this.nameText = scene.add
      .text(0, RING_RADIUS + 6, `${data.stockName}`, {
        fontSize: '13px',
        fontFamily: '"Noto Sans TC",sans-serif',
        color: '#1f2937',
        backgroundColor: '#ffffffcc',
        padding: { left: 4, right: 4, top: 1, bottom: 1 }
      })
      .setOrigin(0.5, 0);

    this.container.add([this.ring, this.emoji, this.pnlBox, this.nameText]);

    // 互動
    this.container.setSize(RING_RADIUS * 2, RING_RADIUS * 2);
    this.container.setInteractive(
      new Phaser.Geom.Circle(0, 0, RING_RADIUS + 4),
      Phaser.Geom.Circle.Contains
    );
    this.container.on('pointerover', () => {
      this.scene.input.setDefaultCursor('pointer');
      this.ring.setFillStyle(0xfff7d6, 0.9);
    });
    this.container.on('pointerout', () => {
      this.scene.input.setDefaultCursor('default');
      this.ring.setFillStyle(0xffffff, 0.6);
    });

    this.applyData(data);
    this.pickNewTarget(0);
  }

  /** 把玩家點擊轉發出去，讓 React 知道哪隻寵物被點 */
  onPointerDown(handler: (petId: string) => void) {
    this.container.on('pointerdown', () => handler(this.data.petId));
  }

  applyData(data: PetSpriteData) {
    this.data = data;
    this.emoji.setText(data.emoji);
    this.ring.setStrokeStyle(4, TIER_COLOR[data.tier]);
    this.emoji.setAlpha(data.isCorrupted ? 0.55 : 1);
    this.emoji.setTint(data.isCorrupted ? 0x444444 : 0xffffff);

    const sign = data.pnl >= 0 ? '+' : '';
    this.pnlText.setText(`${sign}${formatThousands(Math.round(data.pnl))}`);
    this.pnlText.setColor(data.pnl >= 0 ? '#e23b3b' : '#1f9e4a');
    this.nameText.setText(`${data.stockName} · Lv.${data.level}`);
  }

  /** 在 territory 內隨機選新目標 */
  pickNewTarget(now: number) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * TERRITORY_RADIUS;
    this.targetX = this.homeX + Math.cos(angle) * dist;
    this.targetY = this.homeY + Math.sin(angle) * dist;
    // 抵達後在原點停留 0.5-3 秒
    this.pauseUntil = now + 500 + Math.random() * 2500;
  }

  /** 每 tick 呼叫；delta 為自上次的毫秒 */
  step(now: number, delta: number) {
    if (now < this.pauseUntil) return;

    const dx = this.targetX - this.container.x;
    const dy = this.targetY - this.container.y;
    const dist = Math.hypot(dx, dy);
    const stepDist = (MOVE_SPEED * delta) / 1000;

    if (dist < stepDist) {
      this.container.x = this.targetX;
      this.container.y = this.targetY;
      this.pickNewTarget(now);
    } else {
      this.container.x += (dx / dist) * stepDist;
      this.container.y += (dy / dist) * stepDist;
      // 走動時左右翻轉
      this.emoji.setScale(dx >= 0 ? 1 : -1, 1);
    }
  }

  destroy() {
    this.container.destroy();
  }
}

function formatThousands(n: number): string {
  return n.toLocaleString('en-US');
}
