import { forwardRef } from 'react';
import type { UserProfile, MonthlyStats } from '@/types';
import { getTitle, formatInviteCode } from '@/services';

interface MonthlyReviewCardProps {
  stats: MonthlyStats;
  profile: UserProfile | null;
  /** 玩家累計修為 lifetimeEarned(顯示稱號用) */
  lifetimeEarned: number;
  /** 預留:階段 5D 後啟用 QR Code 顯示 */
  showQRCode?: boolean;
  /** 預留:階段 5D 後啟用邀請碼分享 */
  showInviteCode?: boolean;
}

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1920;

/**
 * 階段 5C:月度戰績卡(9:16 直式 1080x1920)。
 *
 * 跟 CreatureShareCard 一樣固定尺寸 + 內聯 style,讓 html-to-image render 出來的
 * PNG 不受螢幕 viewport 影響。視覺風一致:仙俠 + 米金漸層 + 雙金邊。
 *
 * 區塊:標題 / 玩家頭像 + 暱稱 / 本月成績 / 本月最賺 / 本月突破 / 修為總計 / 修煉日曆 / footer。
 * isEmpty 月份不會進到這裡(MonthlyReviewModal 已先擋掉)。
 */
const MonthlyReviewCard = forwardRef<HTMLDivElement, MonthlyReviewCardProps>(function MonthlyReviewCard(
  { stats, profile, lifetimeEarned, showInviteCode = false },
  ref
) {
  const title = profile ? getTitle(lifetimeEarned) : null;
  const playerNickname = profile?.nickname ?? '修仙者';
  const avatarId = profile?.avatarCreatureId;
  const avatarSrc = avatarId ? `/sprites/${avatarId}.png` : null;

  const growthPositive = stats.cultivationGrowth >= 0;
  const growthSign = growthPositive ? '+' : '';
  const growthColor = growthPositive ? '#c62828' : '#2e7d32';
  const growthPercent =
    stats.cultivationStart > 0
      ? Math.round((stats.cultivationGrowth / stats.cultivationStart) * 100)
      : 0;

  return (
    <div
      ref={ref}
      data-monthly-card
      style={{
        width: `${CARD_WIDTH}px`,
        height: `${CARD_HEIGHT}px`,
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
      {/* 雙金邊 */}
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

      <div
        style={{
          position: 'absolute',
          inset: '60px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch'
        }}
      >
        {/* 標題 */}
        <div style={{ paddingTop: '30px', textAlign: 'center' }}>
          <div
            style={{
              fontSize: '64px',
              fontWeight: 700,
              letterSpacing: '8px',
              color: '#8b6914'
            }}
          >
            {stats.year} 年 {stats.month} 月
          </div>
          <div
            style={{
              fontSize: '40px',
              fontWeight: 700,
              letterSpacing: '12px',
              color: '#2c1810',
              marginTop: '8px'
            }}
          >
            修 煉 錄
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

        {/* 玩家頭像 + 暱稱 */}
        <div
          style={{
            marginTop: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '32px'
          }}
        >
          <div
            style={{
              width: '150px',
              height: '150px',
              borderRadius: '50%',
              border: '4px solid #b8860b',
              overflow: 'hidden',
              background: 'linear-gradient(135deg, #fff4dc, #f5d6b4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            {avatarSrc ? (
              <img
                src={avatarSrc}
                crossOrigin="anonymous"
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span style={{ fontSize: '70px', color: '#a08560' }}>?</span>
            )}
          </div>
          <div>
            <div style={{ fontSize: '44px', fontWeight: 700 }}>{playerNickname}</div>
            <div style={{ fontSize: '30px', color: '#8b6914', marginTop: '6px' }}>
              {title?.emoji} {title?.name}
            </div>
          </div>
        </div>

        {/* 📊 本月成績 */}
        <SectionTitle text="📊 本月成績" />
        <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 40px' }}>
          <StatRow label="新召喚神獸" value={`${stats.newCreaturesCount} 隻`} />
          <StatRow label="神獸退役" value={`${stats.retiredCreaturesCount} 隻`} />
          <StatRow
            label="修為成長"
            value={`${growthSign}${stats.cultivationGrowth.toLocaleString()}`}
            color={growthColor}
          />
          <StatRow label="連登天數" value={`${stats.consecutiveDays} 天`} />
          <StatRow label="完成任務" value={`${stats.completedTasks} 個`} />
        </div>

        {/* 🏆 本月最賺 */}
        {stats.bestCreature && stats.bestCreature.species && (
          <>
            <SectionTitle text="🏆 本月最賺" />
            <div
              style={{
                marginTop: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '24px',
                padding: '20px 24px',
                background: 'rgba(255,243,219,0.6)',
                border: '2px solid rgba(212,175,55,0.4)',
                borderRadius: '24px'
              }}
            >
              <div
                style={{
                  width: '120px',
                  height: '120px',
                  borderRadius: '20px',
                  background: 'linear-gradient(135deg, #fff4dc, #f5d6b4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  flexShrink: 0
                }}
              >
                {stats.bestCreature.species.art ? (
                  <img
                    src={`/sprites/${stats.bestCreature.species.id}.png`}
                    crossOrigin="anonymous"
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{ fontSize: '72px' }}>{stats.bestCreature.species.emoji}</span>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '36px', fontWeight: 700 }}>
                  {stats.bestCreature.species.name}
                </div>
                <div
                  style={{
                    fontSize: '32px',
                    marginTop: '8px',
                    color: stats.bestCreature.profit >= 0 ? '#c62828' : '#2e7d32',
                    fontWeight: 600
                  }}
                >
                  {stats.bestCreature.profit >= 0 ? '+' : ''}
                  {Math.round(stats.bestCreature.profit).toLocaleString()} ({(stats.bestCreature.profitPercent * 100).toFixed(1)}%)
                </div>
              </div>
            </div>
          </>
        )}

        {/* ✨ 本月突破 */}
        {stats.breakthroughs.length > 0 && (
          <>
            <SectionTitle text="✨ 本月突破" />
            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {stats.breakthroughs.slice(0, 3).map((b) => (
                <div
                  key={b.petId}
                  style={{
                    fontSize: '28px',
                    color: '#6b4d2c',
                    paddingLeft: '20px'
                  }}
                >
                  · {b.fromLabel} → <span style={{ fontWeight: 700, color: '#8b6914' }}>{b.toLabel}</span>
                </div>
              ))}
              {stats.breakthroughs.length > 3 && (
                <div style={{ fontSize: '24px', color: '#a08560', paddingLeft: '20px' }}>
                  ⋯ 共 {stats.breakthroughs.length} 次境界突破
                </div>
              )}
            </div>
          </>
        )}

        {/* 💎 修為總計 */}
        <SectionTitle text="💎 修為總計" />
        <div
          style={{
            marginTop: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-around',
            padding: '20px 24px',
            background: 'rgba(255,243,219,0.6)',
            border: '2px solid rgba(212,175,55,0.4)',
            borderRadius: '24px',
            textAlign: 'center'
          }}
        >
          <div>
            <div style={{ fontSize: '22px', color: '#8b6914' }}>月初</div>
            <div style={{ fontSize: '36px', fontWeight: 700, marginTop: '4px' }}>
              {stats.cultivationStart.toLocaleString()}
            </div>
          </div>
          <div style={{ fontSize: '36px', color: '#a08560' }}>→</div>
          <div>
            <div style={{ fontSize: '22px', color: '#8b6914' }}>月底</div>
            <div style={{ fontSize: '36px', fontWeight: 700, marginTop: '4px' }}>
              {stats.cultivationEnd.toLocaleString()}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '22px', color: '#8b6914' }}>成長</div>
            <div
              style={{
                fontSize: '36px',
                fontWeight: 700,
                marginTop: '4px',
                color: growthColor
              }}
            >
              {growthSign}
              {stats.cultivationGrowth.toLocaleString()}
              {stats.cultivationStart > 0 && (
                <span style={{ fontSize: '22px', marginLeft: '6px' }}>
                  ({growthSign}
                  {growthPercent}%)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 📅 修煉日曆 */}
        <SectionTitle text="📅 修煉日曆" />
        <div
          style={{
            marginTop: '16px',
            display: 'grid',
            gridTemplateColumns: 'repeat(15, 1fr)',
            gap: '8px',
            padding: '0 20px'
          }}
        >
          {stats.loginCalendar.map((on, i) => (
            <div
              key={i}
              style={{
                aspectRatio: '1',
                borderRadius: '6px',
                background: on
                  ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                  : 'rgba(212,175,55,0.15)',
                border: '1px solid rgba(212,175,55,0.4)'
              }}
            />
          ))}
        </div>
        <div
          style={{
            marginTop: '12px',
            fontSize: '22px',
            color: '#8b6914',
            textAlign: 'center'
          }}
        >
          本月打卡 {stats.consecutiveDays} / {stats.loginCalendar.length} 天
        </div>
      </div>

      {/* 底部 footer */}
      <div
        style={{
          position: 'absolute',
          left: '80px',
          right: '80px',
          bottom: '60px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#6b4d2c'
        }}
      >
        <div>
          {showInviteCode && profile && (
            <div style={{ fontSize: '24px', color: '#8b6914' }}>
              我的邀請碼:
              <span style={{ fontFamily: 'monospace', fontWeight: 700, marginLeft: '8px' }}>
                {formatInviteCode(profile.inviteCode)}
              </span>
            </div>
          )}
        </div>
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

function SectionTitle({ text }: { text: string }) {
  return (
    <div
      style={{
        marginTop: '32px',
        fontSize: '32px',
        fontWeight: 700,
        color: '#8b6914',
        borderLeft: '6px solid #d4af37',
        paddingLeft: '16px',
        letterSpacing: '2px'
      }}
    >
      {text}
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        padding: '8px 4px',
        borderBottom: '1px dashed rgba(212,175,55,0.4)'
      }}
    >
      <span style={{ fontSize: '26px', color: '#6b4d2c' }}>{label}</span>
      <span style={{ fontSize: '32px', fontWeight: 700, color: color ?? '#2c1810' }}>{value}</span>
    </div>
  );
}

export default MonthlyReviewCard;
