/**
 * Compute History Endpoint
 *
 * Per PRD Section 3 & 10 - GET /api/agents/[id]/compute-history
 * Returns compute charge/refund history from compute_ledger
 * All charges are ON-CHAIN and VERIFIABLE via tx_hash
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { verifyAuth } from '@/lib/auth/middleware'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/agents/[id]/compute-history - Get compute ledger history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await verifyAuth(request)

  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  // Get agent
  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('id, owner_address, compute_credits, is_hosted, wallet_address')
    .eq('id', id)
    .single()

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  // Verify ownership
  if (auth.type === 'user' && agent.owner_address !== auth.wallet.toLowerCase()) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  } else if (auth.type === 'agent' && auth.agentId !== agent.id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  // Parse query params
  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
  const offset = parseInt(searchParams.get('offset') || '0')
  const status = searchParams.get('status') // 'success', 'failed', 'refunded'
  const type = searchParams.get('type') // 'charge', 'refund', 'credit_purchase'

  // Build query
  let query = supabaseAdmin
    .from('compute_ledger')
    .select('*', { count: 'exact' })
    .eq('agent_id', id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) {
    query = query.eq('status', status)
  }

  if (type) {
    query = query.eq('type', type)
  }

  const { data: ledger, count } = await query

  // Calculate summary stats
  const { data: stats } = await supabaseAdmin
    .from('compute_ledger')
    .select('type, status, amount_usdc')
    .eq('agent_id', id)

  const summary = {
    total_charges: 0,
    total_refunds: 0,
    total_credits_purchased: 0,
    successful_charges: 0,
    failed_charges: 0,
  }

  for (const entry of stats || []) {
    const amount = parseFloat(entry.amount_usdc || '0')

    if (entry.type === 'charge' || entry.type === 'heartbeat') {
      summary.total_charges += amount
      if (entry.status === 'success') {
        summary.successful_charges++
      } else if (entry.status === 'failed' || entry.status === 'insufficient_balance') {
        summary.failed_charges++
      }
    } else if (entry.type === 'refund') {
      summary.total_refunds += amount
    } else if (entry.type === 'credit_purchase') {
      summary.total_credits_purchased += amount
    }
  }

  return NextResponse.json({
    agent_id: id,
    is_hosted: agent.is_hosted,
    current_credits: agent.compute_credits || 0,
    wallet_address: agent.wallet_address,
    history: ledger || [],
    pagination: {
      total: count || 0,
      limit,
      offset,
      has_more: (count || 0) > offset + limit,
    },
    summary: {
      ...summary,
      net_spent: summary.total_charges - summary.total_refunds,
    },
  })
}
