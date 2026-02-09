import { supabaseAdmin } from '@/lib/supabase/server'
import { verifyAuth, requireUserAuth } from '@/lib/auth/middleware'
import { createAgentWallet } from '@/lib/privy/server-wallet'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/agents - List agents (public) or user's agents (authenticated)
// Query params:
//   - owner: filter by owner wallet address
//   - keyword: search by name
//   - skill: filter by skill (e.g., ?skill=research)
//   - limit: max results (default 50, max 100)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const owner = searchParams.get('owner')
  const keyword = searchParams.get('keyword')
  const skill = searchParams.get('skill')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)

  let query = supabaseAdmin
    .from('agents')
    .select('id, name, wallet_address, personality, is_hosted, is_active, is_paused, transaction_count, total_earned_wei, total_spent_wei, created_at, bio, skills, avatar_url, reputation_tier')
    .eq('is_active', true)
    .not('name', 'ilike', '%E2E%')  // Filter out E2E test agents
    .not('name', 'ilike', 'TestBot%')  // Filter out test bots
    .order('is_hosted', { ascending: false })  // House bots first
    .order('transaction_count', { ascending: false })  // Then by activity
    .order('created_at', { ascending: false })
    .limit(limit)

  if (owner) {
    query = query.eq('owner_address', owner.toLowerCase())
  }

  if (keyword) {
    // Search both name and bio
    // Sanitize: strip PostgREST filter metacharacters to prevent filter injection
    const safeKeyword = keyword.replace(/[,()]/g, '')
    if (safeKeyword) {
      query = query.or(`name.ilike.%${safeKeyword}%,bio.ilike.%${safeKeyword}%`)
    }
  }

  // Filter by skill (uses PostgreSQL array contains operator)
  if (skill) {
    query = query.contains('skills', [skill.toLowerCase()])
  }

  const { data: agents, error } = await query

  if (error) {
    console.error('Failed to fetch agents:', error)
    return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 })
  }

  // Compute real-time earnings from RELEASED transactions for all returned agents
  const agentIds = (agents || []).map((a: { id: string }) => a.id)
  let earningsMap: Record<string, number> = {}
  if (agentIds.length > 0) {
    const { data: releasedTxns } = await supabaseAdmin
      .from('transactions')
      .select('seller_agent_id, amount_wei')
      .eq('state', 'RELEASED')
      .in('seller_agent_id', agentIds)

    for (const tx of releasedTxns || []) {
      const id = tx.seller_agent_id
      earningsMap[id] = (earningsMap[id] || 0) + parseFloat(String(tx.amount_wei || '0'))
    }
  }

  // Merge computed earnings with agent data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enrichedAgents = (agents || []).map((a: any) => {
    const computed = earningsMap[a.id] || 0
    const stored = parseFloat(String(a.total_earned_wei || '0'))
    return {
      ...a,
      total_earned_wei: String(Math.max(computed, stored)),
    }
  })

  return NextResponse.json({ agents: enrichedAgents })
}

// POST /api/agents - Create hosted agent (Path A) - requires auth
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)

  if (!requireUserAuth(auth)) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { name, personality } = body

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const validPersonalities = ['hustler', 'cautious', 'degen', 'random']
    if (personality && !validPersonalities.includes(personality)) {
      return NextResponse.json(
        { error: `personality must be one of: ${validPersonalities.join(', ')}` },
        { status: 400 }
      )
    }

    // Check rate limit: max 10 agents per user
    const { count } = await supabaseAdmin
      .from('agents')
      .select('*', { count: 'exact', head: true })
      .eq('owner_address', auth.wallet.toLowerCase())
      .eq('is_active', true)

    if (count && count >= 10) {
      return NextResponse.json(
        { error: 'Maximum 10 agents per account' },
        { status: 429 }
      )
    }

    // Create Privy server wallet for hosted agent
    let walletAddress: string
    let privyWalletId: string | null = null

    try {
      const wallet = await createAgentWallet()
      walletAddress = wallet.address
      privyWalletId = wallet.walletId
    } catch (walletError) {
      console.error('Failed to create Privy wallet:', walletError)
      // Fallback to placeholder for development/testing
      walletAddress = `0x${Math.random().toString(16).slice(2, 42).padEnd(40, '0')}`
    }

    const { data: agent, error } = await supabaseAdmin
      .from('agents')
      .insert({
        name,
        wallet_address: walletAddress,
        owner_address: auth.wallet.toLowerCase(),
        is_hosted: true,
        personality: personality || 'random',
        privy_wallet_id: privyWalletId,
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to create agent:', error)
      return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 })
    }

    // Trigger immediate first heartbeat (Known Issue #13)
    // Fire-and-forget — don't wait for it
    if (process.env.NEXT_PUBLIC_APP_URL) {
      fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/cron/agent-heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.CRON_SECRET}`,
        },
        body: JSON.stringify({ agent_id: agent.id, immediate: true }),
      }).catch((err) => console.error('Failed to trigger immediate heartbeat:', err))
    }

    return NextResponse.json({
      id: agent.id,
      name: agent.name,
      wallet_address: agent.wallet_address,
      personality: agent.personality,
      privy_wallet_id: privyWalletId ? '[created]' : null,
      created_at: agent.created_at,
    })
  } catch (error) {
    console.error('Create agent error:', error)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
