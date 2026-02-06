/**
 * Agent Reputation Endpoint
 *
 * Per PRD Section 6 (Reputation System):
 * - Returns cached reputation score
 * - Includes breakdown of transactions
 * - Tier determines dispute window
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { calculateFromStats, getTierInfo, getDisputeWindowHours } from '@/lib/reputation/calculate'
import { getOnChainReputation, ERC8004_REPUTATION_REGISTRY } from '@/lib/erc8004/onchain'

// GET /api/agents/[id]/reputation - Get agent's reputation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Get agent with cached reputation
  const { data: agent, error } = await supabaseAdmin
    .from('agents')
    .select(`
      id,
      name,
      wallet_address,
      reputation_score,
      reputation_tier,
      reputation_transactions,
      reputation_success_rate,
      reputation_updated_at,
      erc8004_token_id,
      erc8004_chain
    `)
    .eq('id', id)
    .single()

  if (error || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  // Fetch on-chain reputation in the background (non-blocking for the main response)
  let onchainData: {
    registered: boolean
    token_id?: string
    feedback_count?: number
    contract: string
    chain: string
  } | null = null

  if (agent.erc8004_token_id) {
    try {
      const summary = await getOnChainReputation(agent.erc8004_token_id)
      onchainData = {
        registered: true,
        token_id: agent.erc8004_token_id,
        feedback_count: summary?.count ?? 0,
        contract: ERC8004_REPUTATION_REGISTRY,
        chain: agent.erc8004_chain || 'base',
      }
    } catch {
      onchainData = {
        registered: true,
        token_id: agent.erc8004_token_id,
        contract: ERC8004_REPUTATION_REGISTRY,
        chain: agent.erc8004_chain || 'base',
      }
    }
  } else {
    onchainData = {
      registered: false,
      contract: ERC8004_REPUTATION_REGISTRY,
      chain: 'base',
    }
  }

  // If no cached reputation, calculate from transactions
  if (agent.reputation_score === null || agent.reputation_updated_at === null) {
    // Get transaction stats
    const { data: txData } = await supabaseAdmin
      .from('transactions')
      .select('state, amount_wei, price_wei')
      .eq('seller_agent_id', id)
      .in('state', ['RELEASED', 'REFUNDED', 'DISPUTED'])

    const stats = {
      released_count: txData?.filter((t: { state: string }) => t.state === 'RELEASED').length || 0,
      disputed_count: txData?.filter((t: { state: string }) => t.state === 'DISPUTED').length || 0,
      refunded_count: txData?.filter((t: { state: string }) => t.state === 'REFUNDED').length || 0,
      total_count: txData?.length || 0,
      total_volume_wei: txData?.reduce((sum: bigint, t: { amount_wei?: string; price_wei?: string }) => sum + BigInt(t.amount_wei || t.price_wei || '0'), BigInt(0)).toString() || '0',
    }

    const score = calculateFromStats(stats)
    const tierInfo = getTierInfo(score.tier)
    const disputeWindow = getDisputeWindowHours(score.tier)

    return NextResponse.json({
      agent_id: id,
      agent_name: agent.name,
      wallet_address: agent.wallet_address,
      reputation: {
        score: score.score,
        tier: score.tier,
        tierInfo,
        totalTransactions: score.totalTransactions,
        successRate: score.breakdown.successRate,
        breakdown: score.breakdown,
        disputeWindowHours: disputeWindow,
        cached: false,
        lastUpdated: score.lastUpdated,
      },
      onchain: onchainData,
    })
  }

  // Return cached reputation
  const tier = (agent.reputation_tier || 'NEW') as 'TRUSTED' | 'RELIABLE' | 'STANDARD' | 'NEW' | 'CAUTION'
  const tierInfo = getTierInfo(tier)
  const disputeWindow = getDisputeWindowHours(tier)

  return NextResponse.json({
    agent_id: id,
    agent_name: agent.name,
    wallet_address: agent.wallet_address,
    reputation: {
      score: agent.reputation_score || 0,
      tier,
      tierInfo,
      totalTransactions: agent.reputation_transactions || 0,
      successRate: agent.reputation_success_rate || 0,
      disputeWindowHours: disputeWindow,
      cached: true,
      lastUpdated: agent.reputation_updated_at,
    },
    onchain: onchainData,
  })
}
