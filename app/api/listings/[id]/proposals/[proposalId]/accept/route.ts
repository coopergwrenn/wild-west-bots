import { supabaseAdmin } from '@/lib/supabase/server'
import { verifyAuth } from '@/lib/auth/middleware'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/listings/[id]/proposals/[proposalId]/accept - Accept a proposal
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; proposalId: string }> }
) {
  const auth = await verifyAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const { id: listingId, proposalId } = await params

  // Get the listing
  const { data: listing, error: listingError } = await supabaseAdmin
    .from('listings')
    .select('id, agent_id, poster_wallet, title, price_wei, currency, is_active, competition_mode')
    .eq('id', listingId)
    .single()

  if (listingError || !listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }

  if (!listing.is_active) {
    return NextResponse.json({ error: 'Listing is no longer active' }, { status: 400 })
  }

  // Verify ownership
  let isOwner = false
  if (auth.type === 'user') {
    if (listing.poster_wallet && listing.poster_wallet.toLowerCase() === auth.wallet.toLowerCase()) {
      isOwner = true
    }
    if (listing.agent_id) {
      const { data: agent } = await supabaseAdmin
        .from('agents')
        .select('owner_address')
        .eq('id', listing.agent_id)
        .single()
      if (agent && agent.owner_address === auth.wallet.toLowerCase()) {
        isOwner = true
      }
    }
  } else if (auth.type === 'agent' && listing.agent_id === auth.agentId) {
    isOwner = true
  }

  if (!isOwner) {
    return NextResponse.json({ error: 'Only the listing owner can accept proposals' }, { status: 403 })
  }

  // Get the proposal
  const { data: proposal, error: proposalError } = await supabaseAdmin
    .from('proposals')
    .select('id, agent_id, proposed_price_wei, status')
    .eq('id', proposalId)
    .eq('listing_id', listingId)
    .single()

  if (proposalError || !proposal) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  }

  if (proposal.status !== 'pending') {
    return NextResponse.json({ error: 'Proposal is no longer pending' }, { status: 400 })
  }

  // Accept this proposal, reject all others
  await supabaseAdmin
    .from('proposals')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', proposalId)

  await supabaseAdmin
    .from('proposals')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('listing_id', listingId)
    .neq('id', proposalId)
    .eq('status', 'pending')

  // Use the proposed price if available, otherwise listing price
  const finalPrice = proposal.proposed_price_wei || listing.price_wei

  // For BOUNTYs: listing poster is BUYER, proposal agent is SELLER
  const buyerAgentId = listing.agent_id
  const sellerAgentId = proposal.agent_id
  const buyerWallet = listing.poster_wallet

  const deadline = new Date()
  deadline.setHours(deadline.getHours() + 24)

  // Create transaction (same as claim flow)
  const { data: txn, error: txnError } = await supabaseAdmin
    .from('transactions')
    .insert({
      buyer_agent_id: buyerAgentId,
      buyer_wallet: buyerWallet,
      seller_agent_id: sellerAgentId,
      listing_id: listingId,
      amount_wei: finalPrice,
      currency: listing.currency || 'USDC',
      description: listing.title,
      state: 'FUNDED',
      deadline: deadline.toISOString(),
    })
    .select('id')
    .single()

  if (txnError || !txn) {
    console.error('Failed to create transaction from proposal:', txnError)
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 })
  }

  // Deactivate listing
  await supabaseAdmin
    .from('listings')
    .update({ is_active: false })
    .eq('id', listingId)

  // Notify the accepted agent
  await supabaseAdmin.from('notifications').insert({
    agent_id: sellerAgentId,
    type: 'proposal_accepted',
    title: 'Your proposal was accepted!',
    message: `Your proposal for "${listing.title}" was accepted. Start working!`,
    metadata: { listing_id: listingId, transaction_id: txn.id },
  }).catch(() => {})

  return NextResponse.json({
    success: true,
    transaction_id: txn.id,
    message: 'Proposal accepted and transaction created',
  })
}
