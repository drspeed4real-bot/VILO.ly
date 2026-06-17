export const config = { runtime: 'edge' };

// ملاحظة: يفضّل ضبط هذه القيم كمتغيرات بيئة في إعدادات Vercel
// (Settings → Environment Variables) باسم SUPABASE_URL و SUPABASE_ANON_KEY.
// تم إبقاء القيم الحالية كـ fallback لضمان عدم تعطل الموقع إن لم تُضبط المتغيرات.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://odceujftrdympevtgknl.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kY2V1amZ0cmR5bXBldnRna25sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTU0MTgsImV4cCI6MjA5NjE3MTQxOH0.cha9-spThAN6ZIgqDii_58suKnyHa-QInbO3wB4trJI';

// تهرب من أي حرف يمكن أن يكسر سمة HTML (علامات اقتباس، أقواس)
function escAttr(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// يستبدل قيمة content="..." فقط إن كانت هناك قيمة جديدة غير فاضية،
// وإلا يحافظ على القيمة الافتراضية الموجودة أصلاً في game.html
function setMetaContent(html, attrRegex, value) {
  if (!value) return html;
  return html.replace(attrRegex, `$1${escAttr(value)}`);
}

export default async function handler(req) {
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug') || '';

  let g = null;

  // جلب بيانات اللعبة من Supabase — لا نكسر الصفحة إن فشل الطلب
  if (slug) {
    try {
      const apiRes = await fetch(
        `${SUPABASE_URL}/rest/v1/games?slug=eq.${encodeURIComponent(slug)}&select=*&limit=1`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      if (apiRes.ok) {
        const data = await apiRes.json();
        g = Array.isArray(data) ? data[0] : null;
      }
    } catch (err) {
      console.error('game-meta: supabase fetch failed', err);
    }
  }

  // جلب قالب game.html الأساسي — مع fallback بسيط إن فشل الجلب لأي سبب
  let html;
  try {
    const htmlRes = await fetch(`${url.origin}/game.html`);
    html = await htmlRes.text();
  } catch (err) {
    console.error('game-meta: failed to fetch game.html template', err);
    html = '<!DOCTYPE html><html><head><title>VILO.LY</title></head><body></body></html>';
  }

  // حقن الـ slug دائماً ليستخدمه app.js لتحميل اللعبة على الشاشة
  html = html.replace('</head>', `<script>window.__SLUG__=${JSON.stringify(slug)};</script></head>`);

  if (g) {
    const pageUrl = `${url.origin}/${slug}`;
    const title = `${g.title} | VILO.LY`;
    const desc = g.meta_description || g.description || '';
    const image = g.thumbnail_url || `${url.origin}/api/og/${encodeURIComponent(slug)}`;

    html = html
      .replace(/<title[^>]*>.*?<\/title>/i, `<title>${escAttr(title)}</title>`)
      .replace(/(<link rel="canonical"[^>]*href=")[^"]*/i, `$1${escAttr(pageUrl)}`);

    html = setMetaContent(html, /(<meta name="description"[^>]*content=")[^"]*/i, desc);
    html = setMetaContent(html, /(<meta property="og:title"[^>]*content=")[^"]*/i, title);
    html = setMetaContent(html, /(<meta property="og:description"[^>]*content=")[^"]*/i, desc);
    html = setMetaContent(html, /(<meta property="og:image"[^>]*content=")[^"]*/i, image);
    html = setMetaContent(html, /(<meta property="og:url"[^>]*content=")[^"]*/i, pageUrl);
    html = setMetaContent(html, /(<meta name="twitter:title"[^>]*content=")[^"]*/i, title);
    html = setMetaContent(html, /(<meta name="twitter:description"[^>]*content=")[^"]*/i, desc);
    html = setMetaContent(html, /(<meta name="twitter:image"[^>]*content=")[^"]*/i, image);
  }

  return new Response(html, {
    headers: {
      'content-type': 'text/html;charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400'
    }
  });
}
