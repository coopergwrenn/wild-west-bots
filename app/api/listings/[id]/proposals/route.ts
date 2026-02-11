import { supabaseAdmin } from '@/lib/supabase/server'
import { verifyAuth } from '@/lib/auth/middleware'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/listings/[id]/proposals - Get all proposals for a listing
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: listingId } = await params

  const { data: proposals, error } = await supabaseAdmin
    .from('proposals')
    .select(`
      id, proposal_text, proposed_price_wei, status, created_at, updated_at,
      agent:agents(id, name, wallet_address, reputation_tier, transaction_count)
    `)
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch proposals:', error)
    return NextResponse.json({ error: 'Failed to fetch proposals' }, { status: 500 })
  }

  return NextResponse.json({ proposals: proposals || [] })
}

// POST /api/listings/[id]/proposals - Submit a proposal
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const { id: listingId } = await params

  try {
    const body = await request.json()
    const { agent_id, proposal_text, proposed_price_wei } = body

    if (!agent_id || !proposal_text) {
      return NextResponse.json({ error: 'agent_id and proposal_text are required' }, { status: 400 })
    }

    // Verify the listing exists, is active, and has competition_mode
    const { data: listing, error: listingError } = await supabaseAdmin
      .from('listings')
      .select('id, is_active, competition_mode, agent_id, poster_wallet')
      .eq('id', listingId)
      .single()

    if (listingError || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    if (!listing.is_active) {
      return NextResponse.json({ error: 'Listing is no longer active' }, { status: 400 })
    }

    if (!listing.competition_mode) {
      return NextResponse.json({ error: 'This listing does not accept proposals (not in competition mode)' }, { status: 400 })
    }

    // Verify agent ownership (unless system auth)
    if (auth.type === 'user') {
      const { data: agent } = await supabaseAdmin
        .from('agents')
        .select('owner_address')
        .eq('id', agent_id)
        .single()
      if (!agent || agent.owner_address !== auth.wallet.toLowerCase()) {
        return NextResponse.json({ error: 'Not authorized to submit proposal for this agent' }, { status: 403 })
      }
    } else if (auth.type === 'agent' && auth.agentId !== agent_id) {
      return NextResponse.json({ error: 'Agent ID mismatch' }, { status: 403 })
    }

    // Don't allow the listing owner to submit a proposal to their own listing
    if (listing.agent_id === agent_id) {
      return NextResponse.json({ error: 'Cannot submit a proposal to your own listing' }, { status: 400 })
    }

    // Insert proposal
    const { data: proposal, error: insertError } = await supabaseAdmin
      .from('proposals')
      .insert({
        listing_id: listingId,
        agent_id,
        proposal_text,
        proposed_price_wei: proposed_price_wei || null,
      })
      .select()
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ error: 'You have already submitted a proposal for this listing' }, { status: 409 })
      }
      console.error('Failed to create proposal:', insertError)
      return NextResponse.json({ error: 'Failed to create proposal' }, { status: 500 })
    }

    // Notify listing owner
    const ownerNotifTarget = listing.agent_id || null
    if (ownerNotifTarget) {
      await supabaseAdmin.from('notifications').insert({
        agent_id: ownerNotifTarget,
        type: 'new_proposal',
        title: 'New proposal received',
        message: `An agent submitted a proposal for your bounty`,
        metadata: { listing_id: listingId, proposal_id: proposal.id },
      }).catch(() => {})
    }

    return NextResponse.json({ proposal })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
