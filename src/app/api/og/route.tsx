// ═══════════════════════════════════════════════════════════════════════
// OG Image Generator — Dynamic share cards for NeuralBet predictions
//
// GET /api/og?home=Arsenal&away=Chelsea&tip=Over+2.5&prob=68&quality=gold
//
// Generates a 1200×630 PNG image for social sharing (Twitter/X, WhatsApp,
// Telegram, etc). Uses Next.js ImageResponse (Satori under the hood).
//
// No external fonts loaded — uses system fonts for maximum reliability.
// ═══════════════════════════════════════════════════════════════════════

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const QUALITY_COLORS: Record<string, { bg: string; text: string; glow: string }> = {
  gold:   { bg: '#f59e0b', text: '#fef3c7', glow: 'rgba(245,158,11,0.3)' },
  silver: { bg: '#06b6d4', text: '#cffafe', glow: 'rgba(6,182,212,0.3)' },
  bronze: { bg: '#94a3b8', text: '#f1f5f9', glow: 'rgba(148,163,184,0.3)' },
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const home = searchParams.get('home') || 'Home Team';
  const away = searchParams.get('away') || 'Away Team';
  const tip = searchParams.get('tip') || 'No Tip';
  const prob = searchParams.get('prob') || '—';
  const quality = searchParams.get('quality') || 'silver';
  const market = searchParams.get('market') || '';
  const odds = searchParams.get('odds') || '';
  const league = searchParams.get('league') || '';

  const colors = QUALITY_COLORS[quality] || QUALITY_COLORS.silver;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #0a0e1a 0%, #111827 50%, #0a0e1a 100%)',
          padding: '48px 56px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
              }}
            >
              ⚡
            </div>
            <span style={{ fontSize: '24px', fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.5px' }}>
              NeuralBet
            </span>
          </div>
          {league && (
            <span style={{ fontSize: '16px', color: '#64748b' }}>
              {league}
            </span>
          )}
        </div>

        {/* Match */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '38px', fontWeight: 700, color: '#f1f5f9', textAlign: 'center' }}>
            {home}
          </span>
          <span style={{ fontSize: '20px', color: '#475569' }}>vs</span>
          <span style={{ fontSize: '38px', fontWeight: 700, color: '#cbd5e1', textAlign: 'center' }}>
            {away}
          </span>
        </div>

        {/* Tip Card */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255,255,255,0.04)',
            border: `2px solid ${colors.bg}`,
            borderRadius: '20px',
            padding: '24px 32px',
            boxShadow: `0 0 40px ${colors.glow}`,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {market && (
              <span style={{ fontSize: '14px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                {market}
              </span>
            )}
            <span style={{ fontSize: '32px', fontWeight: 800, color: '#f1f5f9' }}>
              {tip}
            </span>
            {odds && (
              <span style={{ fontSize: '20px', color: colors.bg, fontWeight: 700 }}>
                @{odds}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '48px', fontWeight: 900, color: colors.bg }}>
              {prob}%
            </span>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: colors.text,
                background: colors.bg,
                padding: '4px 12px',
                borderRadius: '20px',
                textTransform: 'uppercase',
                letterSpacing: '2px',
              }}
            >
              {quality}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '13px', color: '#475569' }}>
            V5 Phantom Engine · 15-layer xG Model · 7 intelligence modules
          </span>
          <span style={{ fontSize: '13px', color: '#475569' }}>
            neuralbet.vercel.app
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
