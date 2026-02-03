/**
 * Credits Purchase Endpoint
 *
 * Per PRD Section 3 (Agent-Paid Compute) - Path B Credit Purchases
 * External agents purchase compute credits by sending USDC to treasury
 * We verify the transfer ON-CHAIN before crediting the account
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { verifyAuth } from '@/lib/auth/middleware'
import { NextRequest, NextResponse } from 'next/server'
import { verifyUSDCTransfer, formatUSDC, parseUSDC } from '@/lib/blockchain/usdc'

const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS!

// POST /api/agents/[id]/credits/purchase - Verify USDC transfer and credit account
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await verifyAuth(request)

  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { tx_hash, amount } = body

    if (!tx_hash) {
      return NextResponse.json({ error: 'tx_hash is required' }, { status: 400 })
    }

    if (!amount || parseFloat(amount) <= 0) {
      return NextResponse.json({ error: 'amount must be positive' }, { status: 400 })
    }

    // Get agent
    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('id, owner_address, compute_credits, is_hosted')
      .eq('id', id)
      .single()

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Hosted agents don't need credits (they pay per-transaction)
    if (agent.is_hosted) {
      return NextResponse.json({
        error: 'Hosted agents do not use compute credits - USDC is charged per transaction'
      }, { status: 400 })
    }

    // Verify ownership
    if (auth.type === 'user' && agent.owner_address !== auth.wallet.toLowerCase()) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    } else if (auth.type === 'agent' && auth.agentId !== agent.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Check if tx_hash already claimed
    const { data: existingClaim } = await supabaseAdmin
      .from('credit_purchases')
      .select('id')
      .eq('tx_hash', tx_hash)
      .single()

    if (existingClaim) {
      return NextResponse.json({
        error: 'This transaction has already been claimed',
        tx_hash,
      }, { status: 400 })
    }

    // Verify the USDC transfer ON-CHAIN
    const expectedAmount = parseUSDC(amount)
    const verification = await verifyUSDCTransfer(tx_hash, TREASURY_ADDRESS, expectedAmount)

    if (!verification.valid) {
      return NextResponse.json({
        error: 'Transaction verification failed',
        details: verification.error,
        expected_to: TREASURY_ADDRESS,
        expected_amount: amount,
      }, { status: 400 })
    }

    // Credit amount is what was actually transferred
    const creditAmount = parseFloat(formatUSDC(verification.actualAmount!))

    // Record the purchase
    await supabaseAdmin
      .from('credit_purchases')
      .insert({
        agent_id: id,
        tx_hash,
        amount_usdc: creditAmount,
        from_address: verification.from,
        to_address: verification.actualTo,
        verified_at: new Date().toISOString(),
      })

    // Update agent credits
    const newBalance = (agent.compute_credits || 0) + creditAmount

    await supabaseAdmin
      .from('agents')
      .update({
        compute_credits: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    // Log to compute ledger
    await supabaseAdmin
      .from('compute_ledger')
      .insert({
        agent_id: id,
        type: 'credit_purchase',
        amount_usdc: creditAmount.toString(),
        balance_before: (agent.compute_credits || 0).toString(),
        balance_after: newBalance.toString(),
        tx_hash,
        status: 'success',
      })

    return NextResponse.json({
      success: true,
      credited_amount: creditAmount,
      new_balance: newBalance,
      tx_hash,
      verified_from: verification.from,
      message: `Successfully credited ${creditAmount} USDC to compute credits`,
    })
  } catch (err) {
    console.error('Credit purchase error:', err)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

// GET /api/agents/[id]/credits/purchase - Get purchase history
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
    .select('id, owner_address, compute_credits')
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

  // Get purchase history
  const { data: purchases } = await supabaseAdmin
    .from('credit_purchases')
    .select('*')
    .eq('agent_id', id)
    .order('verified_at', { ascending: false })
    .limit(50)

  return NextResponse.json({
    agent_id: id,
    current_balance: agent.compute_credits || 0,
    purchases: purchases || [],
    total_purchased: (purchases || []).reduce((sum: number, p: { amount_usdc?: number }) => sum + (p.amount_usdc || 0), 0),
  })
}
