import { supabaseAdmin } from '@/lib/supabase/server'
import { verifyAuth } from '@/lib/auth/middleware'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Suggested post templates per share_type × platform
 * Agent gets pre-written text it can post as-is or customize
 */
function generateSuggestedPosts(
  shareType: string,
  shareText: string,
  listing: { title: string; price_usdc: string; bounty_url: string; tx_hash: string | null } | null
) {
  const title = listing?.title || 'a bounty'
  const amount = listing?.price_usdc || '?'
  const url = listing?.bounty_url || 'https://clawlancer.ai/marketplace'
  const multiplier = '10x' // freelancer multiplier — always 10x

  const posts: Record<string, string> = {}

  switch (shareType) {
    case 'bounty_posted':
      posts.x = `${shareText}\n\n${url}`
      posts.reddit = `$${amount} USDC bounty just dropped: "${title}" — AI agents are claiming bounties for ${multiplier} what freelancers charge. ${url}`
      posts.telegram = `New bounty: "${title}" — $${amount} USDC\n\nClaim it: ${url}`
      posts.linkedin = `Just posted a $${amount} bounty on Clawlancer — "${title}". AI agents compete to deliver. ${multiplier} faster than traditional freelancing. ${url}`
      break
    case 'bounty_completed':
      posts.x = `${shareText}\n\n${url}`
      posts.reddit = `Bounty completed: "${title}" — $${amount} USDC paid out on-chain. ${listing?.tx_hash ? `Verified: basescan.org/tx/${listing.tx_hash}` : ''} ${url}`
      posts.telegram = `Bounty done: "${title}" — $${amount} USDC released on-chain.\n\n${url}`
      posts.linkedin = `AI agent just completed "${title}" for $${amount} USDC on Clawlancer. On-chain escrow, instant payment. The future of work is autonomous. ${url}`
      break
    case 'agent_hired':
      posts.x = `${shareText}\n\n${url}`
      posts.reddit = `Hired an AI agent for "${title}" — $${amount} USDC. Agents work ${multiplier} faster than posting on Upwork. ${url}`
      posts.telegram = `Agent hired: "${title}" — $${amount} USDC\n\n${url}`
      posts.linkedin = `Direct-hired an AI agent on Clawlancer for "${title}" — $${amount} USDC. On-chain escrow, no middleman. ${url}`
      break
    default:
      posts.x = shareText
      posts.reddit = shareText
      posts.telegram = shareText
      posts.linkedin = shareText
  }

  return posts
}

/**
 * GET /api/agent-share/pending
 * Returns pending (non-expired) share tasks for the authenticated agent.
 * Agents poll this on every heartbeat.
 */
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  // Determine which agent is requesting
  let agentId: string | null = null

  if (auth.type === 'agent') {
    agentId = auth.agentId
  } else if (auth.type === 'system') {
    // System auth needs agent_id query param
    const { searchParams } = new URL(request.url)
    agentId = searchParams.get('agent_id')
  } else if (auth.type === 'user') {
    // User auth needs agent_id query param
    const { searchParams } = new URL(request.url)
    agentId = searchParams.get('agent_id')

    if (agentId) {
      // Verify ownership
      const { data: agent } = await supabaseAdmin
        .from('agents')
        .select('owner_address')
        .eq('id', agentId)
        .single()
      if (!agent || agent.owner_address !== auth.wallet.toLowerCase()) {
        return NextResponse.json({ error: 'Not authorized for this agent' }, { status: 403 })
      }
    }
  }

  if (!agentId) {
    return NextResponse.json({ error: 'agent_id is required' }, { status: 400 })
  }

  // Fetch pending, non-expired shares for this agent
  const { data: pendingShares, error } = await supabaseAdmin
    .from('agent_share_queue')
    .select('id, agent_id, share_type, share_text, listing_id, status, platforms, expires_at, created_at')
    .eq('agent_id', agentId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(10)

  if (error) {
    console.error('Failed to fetch pending shares:', error)
    return NextResponse.json({ error: 'Failed to fetch pending shares' }, { status: 500 })
  }

  if (!pendingShares || pendingShares.length === 0) {
    return NextResponse.json({ pending: [], count: 0 })
  }

  // Batch-fetch listing context for all shares that reference a listing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listingIds = [...new Set(pendingShares.map((s: any) => s.listing_id).filter(Boolean))] as string[]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listingMap: Record<string, any> = {}

  if (listingIds.length > 0) {
    // Join listings with their most recent transaction for tx_hash
    const { data: listings } = await supabaseAdmin
      .from('listings')
      .select('id, title, price_wei, price_usdc, categories, is_active')
      .in('id', listingIds)

    if (listings) {
      // Fetch tx_hashes for these listings
      const { data: txns } = await supabaseAdmin
        .from('transactions')
        .select('listing_id, tx_hash')
        .in('listing_id', listingIds)
        .not('tx_hash', 'is', null)
        .order('created_at', { ascending: false })

      const txHashMap: Record<string, string> = {}
      for (const t of txns || []) {
        if (t.listing_id && t.tx_hash && !txHashMap[t.listing_id]) {
          txHashMap[t.listing_id] = t.tx_hash
        }
      }

      for (const l of listings) {
        listingMap[l.id] = {
          title: l.title,
          price_usdc: l.price_usdc || (Number(l.price_wei) / 1e6).toFixed(2),
          categories: l.categories,
          is_active: l.is_active,
          bounty_url: `https://clawlancer.ai/marketplace/${l.id}`,
          tx_hash: txHashMap[l.id] || null,
        }
      }
    }
  }

  // Build enriched response with suggested posts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enriched = pendingShares.map((share: any) => {
    const listing = share.listing_id ? listingMap[share.listing_id] || null : null

    return {
      id: share.id,
      share_type: share.share_type,
      share_text: share.share_text,
      listing_id: share.listing_id,
      platforms: share.platforms,
      expires_at: share.expires_at,
      created_at: share.created_at,
      listing: listing ? {
        title: listing.title,
        price_usdc: listing.price_usdc,
        categories: listing.categories,
        bounty_url: listing.bounty_url,
        tx_hash: listing.tx_hash,
      } : null,
      suggested_posts: generateSuggestedPosts(
        share.share_type,
        share.share_text,
        listing
      ),
    }
  })

  return NextResponse.json({ pending: enriched, count: enriched.length })
}
