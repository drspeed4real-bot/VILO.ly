// ملاحظة: يفضّل ضبط هذه القيم كمتغيرات بيئة في إعدادات Vercel
// (Settings → Environment Variables) باسم SUPABASE_URL و SUPABASE_ANON_KEY.
// تم إبقاء القيم الحالية كـ fallback لضمان عدم تعطل خريطة الموقع إن لم تُضبط المتغيرات.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://odceujftrdympevtgknl.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kY2V1amZ0cmR5bXBldnRna25sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTU0MTgsImV4cCI6MjA5NjE3MTQxOH0.cha9-spThAN6ZIgqDii_58suKnyHa-QInbO3wB4trJI';

function escXml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default async function handler(req, res) {
  // قاعدة أساسية: تضمن أن خريطة الموقع لا تفشل بالكامل (500) حتى لو تعطّلت قاعدة البيانات
  const fallbackSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">

<url>
  <loc>https://vilo-ly.vercel.app/</loc>
  <changefreq>daily</changefreq>
  <priority>1.0</priority>
</url>

</urlset>`;

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
    }

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/games?select=slug,created_at&seo_enabled=eq.true`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Supabase request failed with status ${response.status}`);
    }

    const games = await response.json();

    if (!Array.isArray(games)) {
      throw new Error('Unexpected Supabase response shape');
    }

    const urls = games.map(game => `
      <url>
        <loc>https://vilo-ly.vercel.app/${escXml(game.slug)}</loc>
        <lastmod>${new Date(game.created_at).toISOString()}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.9</priority>
      </url>
    `).join('');

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">

<url>
  <loc>https://vilo-ly.vercel.app/</loc>
  <changefreq>daily</changefreq>
  <priority>1.0</priority>
</url>

${urls}

</urlset>`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).send(sitemap);

  } catch (err) {
    console.error('sitemap.xml error:', err);

    // مهم جداً: لا نُرجع 500/JSON أبداً لمحركات البحث.
    // نُرجع دائماً XML صالح (حتى لو كان أساسياً فقط) برمز حالة 200،
    // لأن أي استجابة غير XML أو غير 200 تجعل Google Search Console يفشل في "جلب" الملف.
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.status(200).send(fallbackSitemap);
  }
}
