import { supabaseAdmin } from '@/lib/supabase/server'
import { runAgentHeartbeatCycle } from '@/lib/agents/runner'
import { NextRequest, NextResponse } from 'next/server'

// Known house bot IDs — used for filtering instead of treasury address
const HOUSE_BOT_IDS = [
  'a67d7b98-7a5d-42e1-8c15-38e5745bd789', // Dusty Pete
  'bbd8f6e2-96ca-4fe0-b432-8fe60d181ebb', // Sheriff Claude
  '0d458eb0-2325-4130-95cb-e4f5d43def9f', // Tumbleweed
  'c0916187-07c7-4cde-88c4-8de7fdbb59cc', // Cactus Jack
  'cf90cd61-0e0e-42d0-ab06-d333064b2323', // Snake Oil Sally
]

// POST /api/cron/agent-heartbeat - Run heartbeat for agents
// Called by Vercel cron or triggered immediately on agent creation
// Known Issue #6: Individual heartbeats, not batch (avoid Vercel timeout)
export async function POST(request: NextRequest) {
  // Verify cron/system secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` &&
      authHeader !== `Bearer ${process.env.AGENT_RUNNER_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let agentId: string | null = null
  let isImmediate = false
  let agentType: 'house' | 'user' | 'all' = 'all'

  try {
    const body = await request.json()
    agentId = body.agent_id || null
    isImmediate = body.immediate || false
  } catch {
    // Check query params for cron-style calls
    const { searchParams } = new URL(request.url)
    agentType = (searchParams.get('type') as 'house' | 'user' | 'all') || 'all'
  }

  // KILL SWITCH: Check if house bots are disabled
  if (agentType === 'house' && process.env.HOUSE_BOTS_ACTIVE === 'false') {
    return NextResponse.json({
      message: 'House bots disabled via HOUSE_BOTS_ACTIVE=false',
      processed: 0,
      skipped: true,
    })
  }

  // If specific agent requested, run just that one
  if (agentId) {
    const result = await runAgentHeartbeat(agentId, isImmediate)
    return NextResponse.json(result)
  }

  // Otherwise, get list of active hosted agents to process
  let query = supabaseAdmin
    .from('agents')
    .select('id, name, owner_address')
    .eq('is_active', true)
    .eq('is_hosted', true)
    .limit(50)

  // Filter by type: house bots by ID list, user agents by exclusion
  if (agentType === 'house') {
    query = query.in('id', HOUSE_BOT_IDS)
  } else if (agentType === 'user') {
    // User agents = hosted but not in the house bot list
    for (const id of HOUSE_BOT_IDS) {
      query = query.neq('id', id)
    }
  }

  const { data: agents, error } = await query

  if (error) {
    console.error('Failed to fetch agents for heartbeat:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  if (!agents || agents.length === 0) {
    return NextResponse.json({ message: 'No agents to process', processed: 0 })
  }

  // STAGGER HOUSE BOTS: Only pick 1-2 random bots per cycle instead of all
  let agentsToProcess = agents
  if (agentType === 'house' && agents.length > 1) {
    // Randomly pick 1-2 house bots to act this cycle
    const shuffled = [...agents].sort(() => Math.random() - 0.5)
    const count = Math.random() > 0.5 ? 2 : 1 // 50% chance of 1 or 2 bots
    agentsToProcess = shuffled.slice(0, count)
    console.log(`[House Bots] Selected ${agentsToProcess.length} of ${agents.length} bots:`,
      agentsToProcess.map((a: { name: string }) => a.name).join(', '))
  }

  // Cooldown: skip house bots that ran within the last 25 minutes to prevent feed spam
  if (agentType === 'house') {
    const cooldownCutoff = new Date(Date.now() - 25 * 60 * 1000).toISOString()
    const { data: recentLogs } = await supabaseAdmin
      .from('agent_logs')
      .select('agent_id')
      .in('agent_id', agentsToProcess.map((a: { id: string }) => a.id))
      .gte('heartbeat_at', cooldownCutoff)
      .not('action_chosen', 'cs', '{"type":"skip"}')

    const recentlyRanIds = new Set((recentLogs || []).map((l: { agent_id: string }) => l.agent_id))
    const before = agentsToProcess.length
    agentsToProcess = agentsToProcess.filter((a: { id: string }) => !recentlyRanIds.has(a.id))
    if (before > agentsToProcess.length) {
      console.log(`[House Bots] Cooldown: skipped ${before - agentsToProcess.length} bots that ran recently`)
    }
    if (agentsToProcess.length === 0) {
      return NextResponse.json({ message: 'All selected bots on cooldown', processed: 0 })
    }
  }

  // Process agents with jittered timing to avoid thundering herd
  const results: { id: string; name: string; success: boolean; action?: string; error?: string }[] = []

  for (const agent of agentsToProcess) {
    // Add random delay between agents (0-2s for house bots, 0-500ms for users)
    const maxDelay = agentType === 'house' ? 2000 : 500
    await new Promise(resolve => setTimeout(resolve, Math.random() * maxDelay))

    try {
      const isHouseBotRun = agentType === 'house'
      const result = await runAgentHeartbeat(agent.id, false, isHouseBotRun)
      results.push({
        id: agent.id,
        name: agent.name,
        success: true,
        action: result.action,
      })
    } catch (err) {
      console.error(`Heartbeat failed for agent ${agent.id}:`, err)
      results.push({
        id: agent.id,
        name: agent.name,
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  const successful = results.filter(r => r.success).length

  return NextResponse.json({
    message: `Processed ${results.length} agents`,
    processed: results.length,
    successful,
    failed: results.length - successful,
    results,
  })
}

// Also support GET for Vercel cron
export async function GET(request: NextRequest) {
  return POST(request)
}

// Run heartbeat for a single agent using the full agent runner
async function runAgentHeartbeat(agentId: string, isImmediate: boolean, isHouseBot: boolean = false) {
  // Use the full agent runner with Claude API
  const result = await runAgentHeartbeatCycle(agentId, isImmediate, isHouseBot)

  return {
    agent_id: agentId,
    action: result.action,
    reason: result.reason || result.error,
    latency_ms: result.latency_ms,
    success: result.success,
    skipped: result.skipped,
  }
}
