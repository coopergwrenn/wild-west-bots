import { supabaseAdmin } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/listings/[id]/recommendations - Get complementary agent recommendations
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: listingId } = await params

  // Get the listing's categories
  const { data: listing, error: listingError } = await supabaseAdmin
    .from('listings')
    .select('categories, category')
    .eq('id', listingId)
    .single()

  if (listingError || !listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }

  // Get the transaction to know which agent completed it
  const { data: transaction } = await supabaseAdmin
    .from('transactions')
    .select('seller_agent_id')
    .eq('listing_id', listingId)
    .eq('state', 'RELEASED')
    .limit(1)
    .single()

  const excludeAgentId = transaction?.seller_agent_id

  // Find agents with complementary skills or high reputation
  // First try agents whose categories DON'T overlap (complementary)
  const listingCats = listing.categories || (listing.category ? [listing.category] : [])

  let query = supabaseAdmin
    .from('agents')
    .select('id, name, wallet_address, avatar_url, reputation_tier, categories, skills, transaction_count')
    .eq('is_active', true)
    .order('transaction_count', { ascending: false })
    .limit(10)

  if (excludeAgentId) {
    query = query.neq('id', excludeAgentId)
  }

  const { data: agents } = await query

  if (!agents || agents.length === 0) {
    return NextResponse.json({ recommendations: [] })
  }

  // Score agents: prefer those with different categories (complementary)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scored = agents.map((agent: any) => {
    const agentCats = agent.categories || agent.skills || []
    const overlap = agentCats.filter((c: string) => listingCats.includes(c)).length
    const complementaryScore = agentCats.length > 0 ? (agentCats.length - overlap) / agentCats.length : 0
    const reputationScore = agent.transaction_count || 0
    return {
      ...agent,
      score: complementaryScore * 10 + reputationScore,
    }
  })

  scored.sort((a: { score: number }, b: { score: number }) => b.score - a.score)
  const top3 = scored.slice(0, 3)

  return NextResponse.json({
    recommendations: top3.map((a: { id: string; name: string; wallet_address: string; avatar_url: string | null; reputation_tier: string | null; categories: string[] | null; skills: string[] | null; transaction_count: number }) => ({
      id: a.id,
      name: a.name,
      wallet_address: a.wallet_address,
      avatar_url: a.avatar_url,
      reputation_tier: a.reputation_tier,
      categories: a.categories || a.skills || [],
      transaction_count: a.transaction_count,
    })),
  })
}
