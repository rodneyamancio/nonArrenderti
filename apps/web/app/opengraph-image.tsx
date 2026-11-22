import { ImageResponse } from 'next/og';
import { SITE } from '@/lib/site';

export const alt = 'Tenace — metas semanais em grupo, com cota em dinheiro';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const runtime = 'edge';

/** Social preview (WhatsApp, Instagram, LinkedIn, X): brand mark, promise and a week card. */
export default async function OpengraphImage() {
  // Brand font (Plus Jakarta Sans, OFL) bundled with the route.
  const [bold, semibold] = await Promise.all([
    fetch(new URL('./og-fonts/PlusJakartaSans_800ExtraBold.ttf', import.meta.url)).then((r) => r.arrayBuffer()),
    fetch(new URL('./og-fonts/PlusJakartaSans_600SemiBold.ttf', import.meta.url)).then((r) => r.arrayBuffer()),
  ]);
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: 'linear-gradient(135deg, #17142B 0%, #2A1F5C 55%, #6D3BFF 100%)', color: '#fff', padding: 72, fontFamily: 'Jakarta' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <svg width="88" height="88" viewBox="0 0 64 64">
              <defs>
                <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#8A5CFF" />
                  <stop offset="1" stopColor="#5524E0" />
                </linearGradient>
              </defs>
              <rect width="64" height="64" rx="18" fill="url(#g)" />
              <path d="M19 28.5 L45 22" stroke="#fff" strokeWidth="8" strokeLinecap="round" fill="none" />
              <path d="M32.5 25.4 V49" stroke="#fff" strokeWidth="8" strokeLinecap="round" fill="none" />
              <circle cx="32.5" cy="12.5" r="5" fill="#FF7A1A" />
            </svg>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: -2 }}>tenace</div>
              <div style={{ fontSize: 26, color: 'rgba(255,255,255,0.7)' }}>{SITE.tagline}</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, maxWidth: 720 }}>Suas metas. Seu grupo. Seu bolso.</div>
            <div style={{ fontSize: 30, color: 'rgba(255,255,255,0.82)', maxWidth: 700 }}>Cada meta cumprida paga uma cota. O que faltar vai para o caixa do grupo.</div>
          </div>
          <div style={{ display: 'flex', fontSize: 26, color: '#FFB27A', fontWeight: 700 }}>Grátis para começar · tenace.amancio.family</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: 340, background: '#fff', borderRadius: 28, overflow: 'hidden', color: '#17142B', boxShadow: '0 30px 80px rgba(0,0,0,0.35)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '22px 24px', background: 'linear-gradient(135deg, #6D3BFF, #A47BFF)', color: '#fff' }}>
              <div style={{ fontSize: 34 }}>🔥</div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 26, fontWeight: 800 }}>Clube do Foco</div>
                <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.85)' }}>4 pessoas · fecha em 2d</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: 24 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 16, color: '#5E5975', fontWeight: 700 }}>SUA SEMANA</div>
                <div style={{ fontSize: 40, fontWeight: 800 }}>−R$ 5,00</div>
              </div>
              {[
                { e: '🏋️', n: 'Academia', a: 3, s: 3 },
                { e: '📚', n: 'Leitura', a: 2, s: 3 },
              ].map((g) => (
                <div key={g.n} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 700 }}>
                    <span>
                      {g.e} {g.n}
                    </span>
                    <span style={{ color: '#5E5975' }}>
                      {g.a}/{g.s}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {Array.from({ length: g.s }, (_, i) => (
                      <div key={i} style={{ flex: 1, height: 12, borderRadius: 6, background: i < g.a ? (g.a === g.s ? '#14935A' : '#6D3BFF') : '#EFECF7' }} />
                    ))}
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', background: '#E4F6EC', color: '#12804F', borderRadius: 14, padding: '12px 16px', fontSize: 20, fontWeight: 800 }}>+R$ 5,00 · cota paga! 🔥</div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Jakarta', data: bold, weight: 800, style: 'normal' },
        { name: 'Jakarta', data: semibold, weight: 600, style: 'normal' },
      ],
    },
  );
}
