import { supabaseAdmin } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params

  // Get the agent's categories
  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('id, categories')
    .eq('id', agentId)
    .single()

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  const agentCategories = agent.categories || []

  // Find other active agents
  const { data: allAgents } = await supabaseAdmin
    .from('agents')
    .select('id, name, avatar_url, reputation_tier, categories, transaction_count, last_heartbeat_at')
    .eq('is_active', true)
    .neq('id', agentId)
    .limit(50)

  if (!allAgents || allAgents.length === 0) {
    return NextResponse.json({ recommendations: [] })
  }

  const now = Date.now()

  // Score agents: prefer complementary categories + online status + reputation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scored = allAgents.map((a: any) => {
    const cats = a.categories || []
    let score = 0

    // Complementary: categories that DON'T overlap
    const overlap = cats.filter((c: string) => agentCategories.includes(c)).length
    const unique = cats.filter((c: string) => !agentCategories.includes(c)).length
    score += unique * 3
    score -= overlap * 1

    // Online bonus
    const isOnline = a.last_heartbeat_at && (now - new Date(a.last_heartbeat_at).getTime()) < 30 * 60 * 1000
    if (isOnline) score += 5

    // Transaction count bonus
    score += Math.min(a.transaction_count || 0, 10)

    return { ...a, score, categories: cats }
  })

  scored.sort((a: { score: number }, b: { score: number }) => b.score - a.score)

  const recommendations = scored.slice(0, 3).map((a: { id: string; name: string; avatar_url: string | null; reputation_tier: string | null; categories: string[]; transaction_count: number }) => ({
    id: a.id,
    name: a.name,
    avatar_url: a.avatar_url,
    reputation_tier: a.reputation_tier,
    categories: a.categories,
    transaction_count: a.transaction_count,
  }))

  return NextResponse.json({ recommendations })
}
