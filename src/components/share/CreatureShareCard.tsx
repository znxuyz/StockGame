import { forwardRef } from 'react';
import type { Pet, UserProfile, CreatureSpecies } from '@/types';
import { getCreatureStory } from '@/data/creatureStories';
import { realmLabel, getTitle, type PetStatus } from '@/services';

export type CardSize = 'story' | 'post';
/** story = 9:16 IG Story 1080×1920;post = 4:5 IG 貼文 1080×1350 */
export const CARD_DIMENSIONS: Record<CardSize, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  post: { width: 1080, height: 1350 }
};

/**
 * 顯示選項(玩家在 ShareModal 勾選):每個都對應卡片上一塊資訊。
 * 隱藏不顯示時,該區佔位空間消除,排版自動推上來。
 */
export interface CardDisplayOptions {
  showNickname: boolean;
  showStory: boolean;
  showReturnRate: boolean;
  showCultivation: boolean;
  showDaysHeld: boolean;
}

export const DEFAULT_DISPLAY_OPTIONS: CardDisplayOptions = {
  showNickname: true,
  showStory: true,
  showReturnRate: true,
  showCultivation: false,
  showDaysHeld: false
};

interface CreatureShareCardProps {
  size: CardSize;
  pet: Pet;
  species: CreatureSpecies;
  status: PetStatus;
  /** 持有天數(從 holding.firstPurchasedAt 算) */
  daysHeld: number;
  /** 總修為 lifetimeEarned(顯示稱號用) */
  lifetimeEarned: number;
  profile: UserProfile | null;
  /** 玩家自訂訊息,150 字內。空字串視同無 */
  customMessage: string;
  options: CardDisplayOptions;
  /** 預留 hook,5D 後啟用 */
  showQRCode?: boolean;
  /** 預留 hook,5D 後啟用 */
  showInviteCode?: boolean;
}

/**
 * 階段 5C:神獸分享卡片(html-to-image 轉 PNG 用)。
 *
 * 全部用 inline style + absolute / fixed sizing,確保不論 viewport 多大,
 * html-to-image render 出來都是固定 1080x1920(或 1080x1350)。
 *
 * 視覺風:仙俠華麗 — 米白底 / 雙金邊 / 雲紋背景 / Noto Serif TC + 系統 serif fallback。
 * 用 forwardRef 讓 ShareModal 拿到 DOM node 餵給 html-to-image。
 */
const CreatureShareCard = forwardRef<HTMLDivElement, CreatureShareCardProps>(function CreatureShareCard(
  props,
  ref
) {
  const { size, pet, species, status, daysHeld, lifetimeEarned, profile, customMessage, options } = props;
  const { width, height } = CARD_DIMENSIONS[size];

  const displayName = pet.customName?.trim() || species.name;
  const returnRate = status.returnRate;
  const returnSign = returnRate >= 0 ? '+' : '';
  const returnColor = returnRate >= 0 ? '#c62828' : '#2e7d32';

  const story = options.showStory ? getCreatureStory(species.id) : '';
  // 抽第一句(以 。為斷句)當卡片故事
  const storyExcerpt = story.split('。')[0]?.trim() ?? '';

  const title = profile ? getTitle(lifetimeEarned) : null;
  const playerNickname = profile?.nickname ?? '修仙者';

  const spriteSrc = species.art ? `/sprites/${species.id}.png` : null;

  // 9:16 → 神獸圖 800x800;4:5 → 500x500
  const spriteSize = size === 'story' ? 800 : 500;

  return (
    <div
      ref={ref}
      data-share-card
      style={{
        width: `${width}px`,
        height: `${height}px`,
        position: 'relative',
        background: `
          radial-gradient(ellipse 1200px 800px at top, #fff4dc 0%, transparent 65%),
          radial-gradient(ellipse 1000px 700px at bottom, #ffd9e8 0%, transparent 60%),
          linear-gradient(180deg, #fff8ec 0%, #fbe9d0 50%, #f5d6b4 100%)
        `,
        overflow: 'hidden',
        fontFamily: '"Noto Serif TC", "PingFang TC", serif',
        color: '#2c1810',
        boxSizing: 'border-box'
      }}
    >
      {/* 外金邊 + 內金邊 + 雲紋紋理層 */}
      <div
        style={{
          position: 'absolute',
          inset: '20px',
          border: '3px solid rgba(212,175,55,0.9)',
          borderRadius: '40px',
          pointerEvents: 'none'
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: '30px',
          border: '1px solid rgba(212,175,55,0.55)',
          borderRadius: '32px',
          pointerEvents: 'none'
        }}
      />
      {/* 角落裝飾 ✦ */}
      {(['40px 40px', '40px auto auto auto', 'auto 40px auto auto'] as const).map((_, i) => {
        const pos: React.CSSProperties = {};
        if (i === 0) {
          pos.top = '50px';
          pos.left = '60px';
        } else if (i === 1) {
          pos.top = '50px';
          pos.right = '60px';
        } else if (i === 2) {
          pos.bottom = '50px';
          pos.left = '60px';
        } else {
          pos.bottom = '50px';
          pos.right = '60px';
        }
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              ...pos,
              fontSize: '36px',
              color: 'rgba(212,175,55,0.55)',
              lineHeight: 1
            }}
          >
            ✦
          </div>
        );
      })}
      {/* 第 4 個角(右下) */}
      <div
        style={{
          position: 'absolute',
          bottom: '50px',
          right: '60px',
          fontSize: '36px',
          color: 'rgba(212,175,55,0.55)',
          lineHeight: 1
        }}
      >
        ✦
      </div>

      {/* ─── 排版主體 ──────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          inset: '60px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}
      >
        {/* 頂部標題 */}
        <div style={{ paddingTop: '30px', textAlign: 'center' }}>
          <div
            style={{
              fontSize: '40px',
              fontWeight: 700,
              letterSpacing: '12px',
              color: '#8b6914',
              textShadow: '0 2px 4px rgba(255,255,255,0.6)'
            }}
          >
            神獸股市 · 修仙錄
          </div>
          <div
            style={{
              marginTop: '20px',
              fontSize: '28px',
              color: 'rgba(139,105,20,0.6)',
              letterSpacing: '8px'
            }}
          >
            ━━━ ✦ ━━━
          </div>
        </div>

        {/* 中上:境界 + 陣營 */}
        <div
          style={{
            marginTop: size === 'story' ? '40px' : '24px',
            fontSize: '36px',
            color: '#8b6914',
            fontWeight: 600,
            textAlign: 'center'
          }}
        >
          {realmLabel(status.realm)} · {species.category}
        </div>

        {/* 中央:神獸圖 + 名稱 + Lv */}
        <div
          style={{
            marginTop: size === 'story' ? '40px' : '24px',
            width: `${spriteSize}px`,
            height: `${spriteSize}px`,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {/* 神獸金色光暈底層 */}
          <div
            style={{
              position: 'absolute',
              inset: '50px',
              borderRadius: '50%',
              background:
                'radial-gradient(circle, rgba(255,215,0,0.35) 0%, rgba(255,215,0,0.15) 40%, transparent 70%)',
              filter: 'blur(20px)'
            }}
          />
          {spriteSrc ? (
            <img
              src={spriteSrc}
              alt={species.name}
              crossOrigin="anonymous"
              style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                filter: 'drop-shadow(0 8px 16px rgba(139,105,20,0.35))'
              }}
            />
          ) : (
            <span
              style={{
                position: 'relative',
                fontSize: `${spriteSize * 0.6}px`,
                lineHeight: 1
              }}
            >
              {species.emoji}
            </span>
          )}
        </div>

        <div
          style={{
            marginTop: '24px',
            fontSize: '64px',
            fontWeight: 700,
            color: '#2c1810',
            textShadow: '0 2px 4px rgba(255,255,255,0.5)',
            textAlign: 'center',
            letterSpacing: '4px',
            maxWidth: '900px',
            wordBreak: 'break-word'
          }}
        >
          {displayName}
        </div>
        <div
          style={{
            marginTop: '12px',
            fontSize: '40px',
            fontWeight: 600,
            color: '#b8860b'
          }}
        >
          Lv. {status.level}
        </div>

        {/* 報酬率 + 持有天數 + 修為 */}
        {(options.showReturnRate || options.showDaysHeld || options.showCultivation) && (
          <>
            <div
              style={{
                marginTop: size === 'story' ? '32px' : '20px',
                fontSize: '24px',
                color: 'rgba(139,105,20,0.55)',
                letterSpacing: '6px'
              }}
            >
              ━━━ ✦ ━━━
            </div>
            {options.showReturnRate && (
              <div
                style={{
                  marginTop: '20px',
                  fontSize: '88px',
                  fontWeight: 700,
                  color: returnColor,
                  textShadow: '0 2px 4px rgba(255,255,255,0.5)',
                  letterSpacing: '2px'
                }}
              >
                報酬 {returnSign}
                {(returnRate * 100).toFixed(1)}%
              </div>
            )}
            <div
              style={{
                marginTop: '16px',
                fontSize: '32px',
                color: '#6b4d2c',
                letterSpacing: '2px',
                textAlign: 'center'
              }}
            >
              {options.showDaysHeld && <span>持有 {Math.floor(daysHeld / 30)} 個月</span>}
              {options.showDaysHeld && options.showCultivation && (
                <span style={{ margin: '0 16px', color: 'rgba(139,105,20,0.4)' }}>·</span>
              )}
              {options.showCultivation && <span>💎 修為 {lifetimeEarned.toLocaleString()}</span>}
            </div>
          </>
        )}

        {/* 自訂訊息(玩家寫的話) */}
        {customMessage.trim() && (
          <div
            style={{
              marginTop: size === 'story' ? '32px' : '20px',
              fontSize: '30px',
              fontStyle: 'italic',
              color: '#6b4d2c',
              lineHeight: 1.6,
              textAlign: 'center',
              maxWidth: '880px',
              padding: '0 40px'
            }}
          >
            「{customMessage.trim()}」
          </div>
        )}

        {/* 神獸故事 */}
        {options.showStory && storyExcerpt && (
          <div
            style={{
              marginTop: size === 'story' ? '32px' : '20px',
              fontSize: '30px',
              color: '#6b4d2c',
              lineHeight: 1.7,
              textAlign: 'center',
              maxWidth: '880px',
              padding: '0 40px'
            }}
          >
            「{storyExcerpt}。」
          </div>
        )}
      </div>

      {/* 底部 footer:左玩家暱稱 / 右 logo */}
      <div
        style={{
          position: 'absolute',
          left: '80px',
          right: '80px',
          bottom: '80px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#6b4d2c'
        }}
      >
        {options.showNickname && profile ? (
          <div style={{ fontSize: '30px', letterSpacing: '2px', maxWidth: '600px' }}>
            <div style={{ fontWeight: 700, color: '#2c1810' }}>{playerNickname}</div>
            <div style={{ fontSize: '24px', marginTop: '6px' }}>
              {title?.emoji} {title?.name}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '28px', color: '#a08560' }}>修仙者</div>
        )}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '30px', fontWeight: 700, color: '#8b6914' }}>神獸股市 ⚡</div>
          <div style={{ fontSize: '20px', color: '#a08560', marginTop: '6px' }}>
            stockgame-692.pages.dev
          </div>
        </div>
      </div>
    </div>
  );
});

export default CreatureShareCard;
