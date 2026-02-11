import { supabaseAdmin } from '@/lib/supabase/server'
import { verifyAuth } from '@/lib/auth/middleware'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const body = await request.json()
  const { agent_id, share_type, share_text, listing_id } = body

  if (!agent_id || !share_type || !share_text) {
    return NextResponse.json({ error: 'agent_id, share_type, and share_text are required' }, { status: 400 })
  }

  // Verify the user owns the agent
  if (auth.type === 'user') {
    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('owner_address')
      .eq('id', agent_id)
      .single()
    if (!agent || agent.owner_address !== auth.wallet.toLowerCase()) {
      return NextResponse.json({ error: 'Not authorized for this agent' }, { status: 403 })
    }
  }

  const { error } = await supabaseAdmin
    .from('agent_share_queue')
    .insert({
      agent_id,
      share_type,
      share_text,
      listing_id: listing_id || null,
      status: 'pending',
    })

  if (error) {
    return NextResponse.json({ error: 'Failed to queue share' }, { status: 500 })
  }

  return NextResponse.json({ success: true, queued: true })
}
