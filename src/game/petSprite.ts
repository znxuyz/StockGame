import Phaser from 'phaser';

/**
 * 一隻寵物的視覺單位（立繪 / emoji + 境界光環 + 損益標籤 + 名稱）。
 *
 * 設計：
 *  - 寵物本體優先用 Phaser.GameObjects.Image 顯示立繪(species.art=true 時),
 *    texture 載不到就 fallback 用 emoji Text(跨平台 OK)
 *  - 單一立繪、不分 idle/asc/corrupt frame:進化用光環顏色表達、
 *    黑化用 tint+alpha 變灰暗,跟舊版邏輯一致
 *  - 境界光環用 Graphics 畫圓
 *  - 損益標籤用兩個 Text 疊在 Container 上方
 *  - 全部塞進 Container，方便整體位移
 *
 * 動作：
 *  - 在 territory（半徑 80）內隨機漫步
 *  - 速度慢（每秒 ~20 px）
 *  - 達到目標點後 0.5-3 秒停留，再選新目標
 *  - 沒走路動畫:移動時 image setFlipX、emoji setScale 表現方向
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

const TERRITORY_RADIUS = 50; // px;放大後每隻領地縮小,避免重疊太多
const MOVE_SPEED = 18; // px/sec
/** 視覺/點擊判定用半徑(沒有實體 ring 渲染了,但保留半徑常數做 hit area) */
const HIT_RADIUS = 78;
const EMOJI_SIZE = 100;
/** 立繪顯示邊長 */
const SPRITE_DISPLAY_SIZE = 130;

/** 境界 → 名牌前綴 emoji,給玩家在地圖上一眼判別 tier */
const TIER_EMOJI: Record<PetTier, string> = {
  normal: '⚪',
  spirit: '🟢',
  demon: '🟣',
  god: '🟡',
  saint: '🟠',
  celestial: '🌈',
  cursed1: '⬛',
  cursed2: '🟥',
  cursed3: '☠️'
};

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

    // 立繪 + emoji 兜底:同位置疊著、按 texture 是否載入決定顯示哪個
    // 不再渲染 ring 圓圈;tier 改用 nameText 前綴 emoji 表示
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

    // 損益標籤 + 名牌位置以立繪一半邊長為基準(沒 ring 後)
    const half = SPRITE_DISPLAY_SIZE / 2;

    // 損益標籤背景 + 文字
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

    // 股票名稱（在腳邊）— 開頭加 tier emoji
    this.nameText = scene.add
      .text(0, half + 6, `${TIER_EMOJI[data.tier]} ${data.stockName}`, {
        fontSize: '13px',
        fontFamily: '"Noto Sans TC",sans-serif',
        color: '#1f2937',
        backgroundColor: '#ffffffcc',
        padding: { left: 4, right: 4, top: 1, bottom: 1 }
      })
      .setOrigin(0.5, 0);

    this.container.add([this.image, this.emoji, this.pnlBox, this.nameText]);

    // 互動 — 用 HIT_RADIUS 圓形 hit area,手指點觸容易命中
    this.container.setSize(HIT_RADIUS * 2, HIT_RADIUS * 2);
    this.container.setInteractive(
      new Phaser.Geom.Circle(0, 0, HIT_RADIUS),
      Phaser.Geom.Circle.Contains
    );
    this.container.on('pointerover', () => {
      this.scene.input.setDefaultCursor('pointer');
      this.image.setScale(this.image.scaleX * 1.05, this.image.scaleY * 1.05);
    });
    this.container.on('pointerout', () => {
      this.scene.input.setDefaultCursor('default');
      // 還原成 displaySize 比例
      this.image.setDisplaySize(SPRITE_DISPLAY_SIZE, SPRITE_DISPLAY_SIZE);
      this.image.setFlipX(this.container.x > this.targetX); // 保留方向 flip
    });

    this.applyData(data);
    this.pickNewTarget(0);
  }

  /** 把玩家點擊轉發出去，讓 React 知道哪隻寵物被點 */
  onPointerDown(handler: (petId: string) => void) {
    this.container.on('pointerdown', () => handler(this.data.petId));
  }

  applyData(data: PetSpriteData) {
    const prevPnl = this.data?.pnl;
    this.data = data;
    // 沒有 ring 渲染了,tier 直接寫進 nameText emoji 前綴

    // 重新評估 texture(物種可能變了 / 立繪後來才載完)
    const key = spriteKey(data.speciesId);
    const hasTexture = data.hasArt && this.scene.textures.exists(key);

    if (hasTexture) {
      this.image.setTexture(key);
      this.image.setDisplaySize(SPRITE_DISPLAY_SIZE, SPRITE_DISPLAY_SIZE);
      this.image.setAlpha(data.isCorrupted ? 0.55 : 1);
      this.image.setTint(data.isCorrupted ? 0x444444 : 0xffffff);
      this.image.setVisible(true);
      this.emoji.setVisible(false);
    } else {
      this.image.setVisible(false);
      this.emoji.setText(data.emoji);
      this.emoji.setAlpha(data.isCorrupted ? 0.55 : 1);
      this.emoji.setTint(data.isCorrupted ? 0x444444 : 0xffffff);
      this.emoji.setVisible(true);
    }

    const sign = data.pnl >= 0 ? '+' : '';
    this.pnlText.setText(`${sign}${formatThousands(Math.round(data.pnl))}`);
    this.pnlText.setColor(data.pnl >= 0 ? '#e23b3b' : '#1f9e4a');
    this.nameText.setText(`${TIER_EMOJI[data.tier]} ${data.stockName} · Lv.${data.level}`);

    // 損益變動時閃光:漲淡黃、跌淡紅
    // 第一次 applyData(prevPnl undefined)不閃,避免初始化跳一次
    if (prevPnl !== undefined && prevPnl !== data.pnl) {
      this.flashPnL(data.pnl > prevPnl ? 0xfde68a : 0xfecaca);
    }
  }

  /** PnL 標籤閃光 500ms 後恢復白底 */
  flashPnL(color: number) {
    this.pnlBg.setFillStyle(color, 0.95);
    this.scene.time.delayedCall(500, () => {
      this.pnlBg.setFillStyle(0xffffff, 0.95);
    });
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
      // 走動時左右翻轉 — image 用 flipX,emoji 用 scale
      this.image.setFlipX(dx < 0);
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
