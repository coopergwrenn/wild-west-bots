import { supabaseAdmin } from '@/lib/supabase/server'
import { verifyAuth, requireAgentAuth } from '@/lib/auth/middleware'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/agents/me - Get the authenticated agent's own profile
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)

  if (!auth) {
    return NextResponse.json(
      { error: 'Authentication failed. Check your API key format (64 hex characters).' },
      { status: 401 }
    )
  }

  if (!requireAgentAuth(auth)) {
    return NextResponse.json(
      {
        error: 'Agent API key required. Use Authorization: Bearer <api_key>',
        auth_type_received: auth.type,
        hint: 'This endpoint requires an agent API key, not a user/Privy token'
      },
      { status: 401 }
    )
  }

  const { data: agent, error } = await supabaseAdmin
    .from('agents')
    .select('*')
    .eq('id', auth.agentId)
    .single()

  if (error || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  // Remove sensitive fields
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { api_key, ...safeAgent } = agent

  // Get agent's wallet balance (USDC on Base)
  // Note: For now just return the agent data, balance can be fetched separately

  // Get recent transactions
  const { data: transactions } = await supabaseAdmin
    .from('transactions')
    .select('id, amount_wei, currency, description, state, created_at, buyer_agent_id, seller_agent_id')
    .or(`buyer_agent_id.eq.${auth.agentId},seller_agent_id.eq.${auth.agentId}`)
    .order('created_at', { ascending: false })
    .limit(10)

  // Get agent's listings
  const { data: listings } = await supabaseAdmin
    .from('listings')
    .select('id, title, price_wei, price_usdc, currency, category, listing_type, is_active, times_purchased')
    .eq('agent_id', auth.agentId)
    .order('created_at', { ascending: false })

  // Get agent's reputation
  const { data: reputation } = await supabaseAdmin
    .from('agent_reputation')
    .select('*')
    .eq('agent_id', auth.agentId)
    .single()

  return NextResponse.json({
    ...safeAgent,
    reputation: reputation || null,
    recent_transactions: transactions || [],
    listings: listings || [],
  })
}

// PATCH /api/agents/me - Update the authenticated agent's profile
export async function PATCH(request: NextRequest) {
  const auth = await verifyAuth(request)

  if (!requireAgentAuth(auth)) {
    return NextResponse.json(
      { error: 'Agent API key required' },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    const { name, is_paused, metadata } = body

    // Build update object with only allowed fields
    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name
    if (is_paused !== undefined) updates.is_paused = is_paused
    if (metadata !== undefined) updates.metadata = metadata

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data: updated, error } = await supabaseAdmin
      .from('agents')
      .update(updates)
      .eq('id', auth.agentId)
      .select()
      .single()

    if (error) {
      console.error('Failed to update agent:', error)
      return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 })
    }

    // Remove sensitive fields
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { api_key, ...safeAgent } = updated

    return NextResponse.json(safeAgent)
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
