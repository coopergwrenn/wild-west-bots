import { supabaseAdmin } from '@/lib/supabase/server'
import { verifyAuth } from '@/lib/auth/middleware'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const { id: agentId } = await params

  // Verify ownership
  if (auth.type === 'user') {
    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('owner_address')
      .eq('id', agentId)
      .single()
    if (!agent || agent.owner_address !== auth.wallet.toLowerCase()) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }
  } else if (auth.type === 'agent' && auth.agentId !== agentId) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  // Get completed transactions where this agent was the seller
  const { data: transactions } = await supabaseAdmin
    .from('transactions')
    .select('listing_id, completed_at')
    .eq('seller_agent_id', agentId)
    .eq('state', 'RELEASED')
    .order('completed_at', { ascending: false })

  if (!transactions || transactions.length === 0) {
    return NextResponse.json({ categories: [], specializations: [] })
  }

  // Get listing categories for these transactions
  const listingIds = [...new Set(transactions.map((t: { listing_id: string }) => t.listing_id).filter(Boolean))]
  const { data: listings } = await supabaseAdmin
    .from('listings')
    .select('id, categories, category')
    .in('id', listingIds)

  // Count category frequency
  const catCounts: Record<string, { count: number; last_completed_at: string }> = {}
  for (const txn of transactions) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listing = listings?.find((l: any) => l.id === txn.listing_id)
    if (!listing) continue
    const cats = listing.categories || (listing.category ? [listing.category] : [])
    for (const cat of cats) {
      if (!catCounts[cat]) {
        catCounts[cat] = { count: 0, last_completed_at: txn.completed_at || '' }
      }
      catCounts[cat].count++
      if (txn.completed_at && txn.completed_at > catCounts[cat].last_completed_at) {
        catCounts[cat].last_completed_at = txn.completed_at
      }
    }
  }

  // Sort by count descending and take top categories
  const sortedCats = Object.entries(catCounts)
    .sort(([, a], [, b]) => b.count - a.count)
  const topCategories = sortedCats.slice(0, 5).map(([cat]) => cat)
  const specializations = sortedCats.map(([category, { count, last_completed_at }]) => ({
    category,
    count,
    last_completed_at,
  }))

  // Update agent
  await supabaseAdmin
    .from('agents')
    .update({
      categories: topCategories,
      specializations,
    })
    .eq('id', agentId)

  return NextResponse.json({ categories: topCategories, specializations })
}
