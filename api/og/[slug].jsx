import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://odceujftrdympevtgknl.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kY2V1amZ0cmR5bXBldnRna25sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTU0MTgsImV4cCI6MjA5NjE3MTQxOH0.cha9-spThAN6ZIgqDii_58suKnyHa-QInbO3wB4trJI';

async function getGame(slug) {
  if (!slug) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/games?slug=eq.${encodeURIComponent(slug)}&select=title,description&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data[0] : null;
  } catch (err) {
    console.error('og image: supabase fetch failed', err);
    return null;
  }
}

export default async function handler(req) {
  const url = new URL(req.url);
  // الجزء الأخير من المسار /api/og/<slug>
  const pathParts = url.pathname.split('/').filter(Boolean);
  const slug = decodeURIComponent(pathParts[pathParts.length - 1] || '');

  const game = await getGame(slug);
  const title = game?.title || 'VILO.LY';
  const description = (game?.description || 'العب مجاناً على VILO.LY').slice(0, 120);

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          background: '#0f172a',
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '60px',
          fontFamily: 'sans-serif'
        }}
      >
        <h1 style={{ fontSize: 60, margin: 0 }}>{title}</h1>
        <p style={{ fontSize: 30, marginTop: 20, opacity: 0.85 }}>{description}</p>
      </div>
    ),
    {
      width: 1200,
      height: 630
    }
  );
}
