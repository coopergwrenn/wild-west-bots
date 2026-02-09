import { supabaseAdmin } from '@/lib/supabase/server'
import { verifyAuth } from '@/lib/auth/middleware'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/agents/[id] - Get agent details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: agent, error } = await supabaseAdmin
    .from('agents')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  // Remove sensitive fields
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { api_key, bankr_api_key, xmtp_private_key_encrypted, ...safeAgent } = agent

  // Get recent transactions
  const { data: transactions } = await supabaseAdmin
    .from('transactions')
    .select('id, amount_wei, currency, description, state, created_at')
    .or(`buyer_agent_id.eq.${id},seller_agent_id.eq.${id}`)
    .order('created_at', { ascending: false })
    .limit(10)

  // Get agent's listings
  const { data: listings } = await supabaseAdmin
    .from('listings')
    .select('id, title, price_wei, currency, category, is_active')
    .eq('agent_id', id)
    .order('created_at', { ascending: false })
    .limit(10)

  // Compute real-time earnings from RELEASED transactions (as seller)
  const { data: sellerTxns } = await supabaseAdmin
    .from('transactions')
    .select('amount_wei')
    .eq('seller_agent_id', id)
    .eq('state', 'RELEASED')

  const computedEarnings = (sellerTxns || []).reduce(
    (sum: number, t: { amount_wei: number | string }) => sum + parseFloat(String(t.amount_wei || '0')),
    0
  )

  // Compute real-time spending from transactions (as buyer)
  const { data: buyerTxns } = await supabaseAdmin
    .from('transactions')
    .select('amount_wei, state')
    .eq('buyer_agent_id', id)

  const computedSpent = (buyerTxns || []).reduce(
    (sum: number, t: { amount_wei: number | string; state: string }) =>
      t.state === 'RELEASED' || t.state === 'DELIVERED' || t.state === 'PENDING'
        ? sum + parseFloat(String(t.amount_wei || '0'))
        : sum,
    0
  )

  // Use higher of computed vs stored values (in case either is stale)
  const realEarnings = Math.max(computedEarnings, parseFloat(String(safeAgent.total_earned_wei || '0')))
  const realSpent = Math.max(computedSpent, parseFloat(String(safeAgent.total_spent_wei || '0')))

  return NextResponse.json({
    ...safeAgent,
    total_earned_wei: String(realEarnings),
    total_spent_wei: String(realSpent),
    recent_transactions: transactions || [],
    listings: listings || [],
  })
}

// PATCH /api/agents/[id] - Update agent (pause/unpause)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await verifyAuth(request)

  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  // Get agent to check ownership
  const { data: agentData } = await supabaseAdmin
    .from('agents')
    .select('owner_address')
    .eq('id', id)
    .single()

  if (!agentData) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  // Check ownership (unless system auth)
  if (auth.type === 'user' && agentData.owner_address !== auth.wallet.toLowerCase()) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { is_paused, bio, skills, avatar_url } = body

    // Build update object with only allowed fields
    const updates: Record<string, unknown> = {}
    if (is_paused !== undefined) updates.is_paused = is_paused

    // Profile fields (added in migration 013)
    if (bio !== undefined) {
      if (typeof bio === 'string' && bio.length > 500) {
        return NextResponse.json({ error: 'Bio must be 500 characters or less' }, { status: 400 })
      }
      updates.bio = bio
    }
    if (skills !== undefined) {
      if (!Array.isArray(skills) || !skills.every(s => typeof s === 'string')) {
        return NextResponse.json({ error: 'Skills must be an array of strings' }, { status: 400 })
      }
      updates.skills = skills.map((s: string) => s.toLowerCase().trim()).filter(Boolean)
    }
    if (avatar_url !== undefined) {
      if (avatar_url && typeof avatar_url === 'string' && !avatar_url.match(/^https?:\/\//)) {
        return NextResponse.json({ error: 'Avatar URL must be a valid HTTP/HTTPS URL' }, { status: 400 })
      }
      updates.avatar_url = avatar_url || null
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data: updated, error } = await supabaseAdmin
      .from('agents')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 })
    }

    // Remove sensitive fields
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { api_key, bankr_api_key: _bak, xmtp_private_key_encrypted: _xpke, ...safeAgent } = updated

    return NextResponse.json(safeAgent)
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
