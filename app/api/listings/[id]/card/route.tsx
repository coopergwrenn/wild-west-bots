import { ImageResponse } from 'next/og'
import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

const SPACE_MONO_REGULAR_URL = 'https://github.com/google/fonts/raw/main/ofl/spacemono/SpaceMono-Regular.ttf'
const SPACE_MONO_BOLD_URL = 'https://github.com/google/fonts/raw/main/ofl/spacemono/SpaceMono-Bold.ttf'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const [spaceMonoRegularData, spaceMonoBoldData] = await Promise.all([
      fetch(SPACE_MONO_REGULAR_URL).then((res) => res.arrayBuffer()),
      fetch(SPACE_MONO_BOLD_URL).then((res) => res.arrayBuffer()),
    ])

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch listing with transaction info
    const { data: listing, error } = await supabase
      .from('listings')
      .select(`
        id, title, price_wei, price_usdc, categories, category
      `)
      .eq('id', id)
      .single()

    if (error || !listing) {
      return new Response('Listing not found', { status: 404 })
    }

    // Get the transaction for completion info
    const { data: transaction } = await supabase
      .from('transactions')
      .select(`
        completed_at, created_at,
        seller:agents!seller_agent_id(name)
      `)
      .eq('listing_id', id)
      .eq('state', 'RELEASED')
      .order('completed_at', { ascending: false })
      .limit(1)
      .single()

    const priceUsdc = listing.price_usdc
      ? parseFloat(listing.price_usdc).toFixed(2)
      : (parseFloat(listing.price_wei) / 1e6).toFixed(2)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentName = (transaction?.seller as any)?.name || 'Agent'
    let completionTime = ''
    if (transaction?.created_at && transaction?.completed_at) {
      const diffMs = new Date(transaction.completed_at).getTime() - new Date(transaction.created_at).getTime()
      const diffMins = Math.round(diffMs / 60000)
      completionTime = diffMins < 60 ? `${diffMins}m` : `${Math.round(diffMins / 60)}h`
    }

    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            position: 'relative',
          }}
        >
          {/* Background */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'linear-gradient(135deg, #1a1614 0%, #2d2520 30%, #3d2f1f 60%, #1a1614 100%)',
            }}
          />
          {/* Gold accent stripe */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 4,
              background: 'linear-gradient(90deg, transparent, #c9a882, #22c55e, #c9a882, transparent)',
            }}
          />

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              height: '100%',
              padding: '48px 56px',
              position: 'relative',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
              <div style={{ display: 'flex', fontFamily: 'SpaceMonoBold', fontSize: 18, color: '#c9a882', letterSpacing: 2 }}>
                CLAWLANCER
              </div>
              <div
                style={{
                  display: 'flex',
                  padding: '8px 20px',
                  backgroundColor: 'rgba(34,197,94,0.2)',
                  border: '2px solid rgba(34,197,94,0.5)',
                  borderRadius: 4,
                }}
              >
                <div style={{ display: 'flex', fontFamily: 'SpaceMonoBold', fontSize: 16, color: '#22c55e', letterSpacing: 2 }}>
                  COMPLETED
                </div>
              </div>
            </div>

            {/* Title */}
            <div style={{ display: 'flex', fontFamily: 'SpaceMonoBold', fontSize: 36, color: '#e8ddd0', lineHeight: 1.2, marginBottom: 24, maxWidth: '85%' }}>
              {listing.title.length > 50 ? listing.title.slice(0, 50) + '...' : listing.title}
            </div>

            {/* Stats row */}
            <div style={{ display: 'flex', gap: 48, marginBottom: 32 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', fontFamily: 'SpaceMono', fontSize: 14, color: '#6b6560', marginBottom: 4 }}>Amount Earned</div>
                <div style={{ display: 'flex', fontFamily: 'SpaceMonoBold', fontSize: 40, color: '#22c55e' }}>${priceUsdc}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', fontFamily: 'SpaceMono', fontSize: 14, color: '#6b6560', marginBottom: 4 }}>Completed By</div>
                <div style={{ display: 'flex', fontFamily: 'SpaceMonoBold', fontSize: 28, color: '#c9a882' }}>{agentName}</div>
              </div>
              {completionTime && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', fontFamily: 'SpaceMono', fontSize: 14, color: '#6b6560', marginBottom: 4 }}>Time</div>
                  <div style={{ display: 'flex', fontFamily: 'SpaceMonoBold', fontSize: 28, color: '#e8ddd0' }}>{completionTime}</div>
                </div>
              )}
            </div>

            {/* Spacer */}
            <div style={{ display: 'flex', flex: 1 }} />

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', fontFamily: 'SpaceMono', fontSize: 14, color: '#6b6560' }}>
                AI agents completing real work for real money
              </div>
              <div style={{ display: 'flex', fontFamily: 'SpaceMono', fontSize: 14, color: '#6b6560' }}>
                clawlancer.ai
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        fonts: [
          { name: 'SpaceMono', data: spaceMonoRegularData, style: 'normal' as const, weight: 400 as const },
          { name: 'SpaceMonoBold', data: spaceMonoBoldData, style: 'normal' as const, weight: 700 as const },
        ],
      }
    )
  } catch (err) {
    console.error('Card generation error:', err)
    return new Response(`Error generating card: ${err instanceof Error ? err.message : 'unknown'}`, { status: 500 })
  }
}
