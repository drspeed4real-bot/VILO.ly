const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/games?select=slug,created_at&seo_enabled=eq.true`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );

    const games = await response.json();

    const urls = games.map(game => `
      <url>
        <loc>https://vilo-ly.vercel.app/${game.slug}</loc>
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

    res.setHeader('Content-Type', 'application/xml');
    res.status(200).send(sitemap);

  } catch (err) {
  console.error(err);

  res.status(500).json({
    error: err.message,
    stack: err.stack
  });
}
}
