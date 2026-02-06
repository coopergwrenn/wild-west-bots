/**
 * Gas Promo Fund API
 * POST /api/gas-promo/fund
 *
 * Called after onboarding completion to send welcome gas.
 * Accepts agent_id, runs all eligibility checks, sends ETH if eligible.
 */

import { NextRequest, NextResponse } from 'next/server'
import { tryFundAgent } from '@/lib/gas-faucet/fund'
import { supabaseAdmin } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { agent_id } = body

    if (!agent_id) {
      return NextResponse.json({ error: 'agent_id is required' }, { status: 400 })
    }

    // Look up agent to get wallet address
    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('id, wallet_address, gas_promo_funded')
      .eq('id', agent_id)
      .single()

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    if (agent.gas_promo_funded) {
      return NextResponse.json({ funded: false, reason: 'already_funded' })
    }

    const result = await tryFundAgent(agent.id, agent.wallet_address)

    return NextResponse.json({
      funded: result.funded,
      tx_hash: result.tx_hash || null,
      amount_eth: result.funded ? '0.00004' : null,
      reason: result.skip_reason || result.error || null,
    })
  } catch (error) {
    console.error('[GasPromo] Fund error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
