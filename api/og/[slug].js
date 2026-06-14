import { ImageResponse } from '@vercel/og'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

export default async function handler(req, context) {
  const slug = context.params.slug

  const { data: game } = await supabase
    .from('games')
    .select('*')
    .eq('slug', slug)
    .single()

  return new ImageResponse(
    (
      <div style={{
        width: '1200px',
        height: '630px',
        background: '#0f172a',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '60px'
      }}>
        <h1 style={{ fontSize: 60 }}>{game?.title}</h1>
        <p style={{ fontSize: 30 }}>{game?.description?.slice(0,120)}</p>
      </div>
    ),
    {
      width: 1200,
      height: 630
    }
  )
}
