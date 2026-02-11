import { supabaseAdmin } from '@/lib/supabase/server'
import { verifyAuth } from '@/lib/auth/middleware'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; proposalId: string }> }
) {
  const auth = await verifyAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const { id: listingId, proposalId } = await params
  const body = await request.json()
  const { status } = body

  if (!status || !['shortlisted', 'declined'].includes(status)) {
    return NextResponse.json({ error: 'status must be "shortlisted" or "declined"' }, { status: 400 })
  }

  // Verify listing ownership
  const { data: listing } = await supabaseAdmin
    .from('listings')
    .select('id, agent_id, poster_wallet')
    .eq('id', listingId)
    .single()

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }

  const wallet = auth.type === 'user' ? auth.wallet.toLowerCase() : null
  const isOwner = (listing.poster_wallet && wallet && listing.poster_wallet.toLowerCase() === wallet)
    || (auth.type === 'agent' && listing.agent_id === auth.agentId)

  if (!isOwner) {
    return NextResponse.json({ error: 'Only the listing owner can update proposals' }, { status: 403 })
  }

  // Update proposal status
  const { data: proposal, error } = await supabaseAdmin
    .from('proposals')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', proposalId)
    .eq('listing_id', listingId)
    .select('id, status')
    .single()

  if (error || !proposal) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  }

  return NextResponse.json({ proposal })
}
