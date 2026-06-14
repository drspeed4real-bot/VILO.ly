export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://odceujftrdympevtgknl.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kY2V1amZ0cmR5bXBldnRna25sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTU0MTgsImV4cCI6MjA5NjE3MTQxOH0.cha9-spThAN6ZIgqDii_58suKnyHa-QInbO3wB4trJI';

export default async function handler(req) {
  const url  = new URL(req.url);
  const slug = url.searchParams.get('slug') || '';

  // جلب بيانات اللعبة
  const apiRes = await fetch(
    `${SUPABASE_URL}/rest/v1/games?slug=eq.${slug}&select=*&limit=1`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  );
  const data = await apiRes.json();
  const g = data?.[0];

  // جلب game.html
  const htmlRes = await fetch(`${url.origin}/game.html`);
  let html = await htmlRes.text();

  if (g) {
    const pageUrl = `${url.origin}/${slug}`;
    const title   = `${g.title} — العب مجاناً | GameVault`;
    const desc    = g.meta_description || g.description || '';
    const image   = g.thumbnail_url || '';

    html = html
      .replace(/<title[^>]*>.*?<\/title>/i, `<title>${title}</title>`)
      .replace(/(<meta name="description"[^>]*content=")[^"]*/i, `$1${desc}`)
      .replace(/(<meta property="og:title"[^>]*content=")[^"]*/i, `$1${title}`)
      .replace(/(<meta property="og:description"[^>]*content=")[^"]*/i, `$1${desc}`)
      .replace(/(<meta property="og:image"[^>]*content=")[^"]*/i, `$1${image}`)
      .replace(/(<meta property="og:url"[^>]*content=")[^"]*/i, `$1${pageUrl}`)
      .replace(/(<meta name="twitter:title"[^>]*content=")[^"]*/i, `$1${title}`)
      .replace(/(<meta name="twitter:description"[^>]*content=")[^"]*/i, `$1${desc}`)
      .replace(/(<meta name="twitter:image"[^>]*content=")[^"]*/i, `$1${image}`);
  }

  return new Response(html, {
    headers: { 'content-type': 'text/html;charset=utf-8' }
  });
}
