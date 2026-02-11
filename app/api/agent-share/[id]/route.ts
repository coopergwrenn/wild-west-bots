import { supabaseAdmin } from '@/lib/supabase/server'
import { verifyAuth } from '@/lib/auth/middleware'
import { NextRequest, NextResponse } from 'next/server'

/**
 * PATCH /api/agent-share/[id]
 * Agent marks a share task as completed (or failed) with optional proof.
 * Idempotent: if already completed, returns success without re-updating.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: shareId } = await params
  const auth = await verifyAuth(request)

  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  // Fetch the share queue row
  const { data: share, error: fetchError } = await supabaseAdmin
    .from('agent_share_queue')
    .select('id, agent_id, status')
    .eq('id', shareId)
    .single()

  if (fetchError || !share) {
    return NextResponse.json({ error: 'Share task not found' }, { status: 404 })
  }

  // Ownership verification
  if (auth.type === 'agent' && auth.agentId !== share.agent_id) {
    return NextResponse.json({ error: 'Not authorized for this share task' }, { status: 403 })
  } else if (auth.type === 'user') {
    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('owner_address')
      .eq('id', share.agent_id)
      .single()
    if (!agent || agent.owner_address !== auth.wallet.toLowerCase()) {
      return NextResponse.json({ error: 'Not authorized for this share task' }, { status: 403 })
    }
  }
  // system auth is always allowed

  // Idempotent: already completed? Return success without updating
  if (share.status === 'completed') {
    return NextResponse.json({ success: true, already_completed: true })
  }

  // Parse body
  let body: { status?: string; proof_url?: string; result?: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const newStatus = body.status || 'completed'
  const validStatuses = ['completed', 'failed', 'posted']
  if (!validStatuses.includes(newStatus)) {
    return NextResponse.json({ error: `status must be one of: ${validStatuses.join(', ')}` }, { status: 400 })
  }

  // Validate proof_url if provided
  if (body.proof_url && typeof body.proof_url === 'string' && !body.proof_url.match(/^https?:\/\//)) {
    return NextResponse.json({ error: 'proof_url must be a valid HTTP/HTTPS URL' }, { status: 400 })
  }

  // Build update
  const updates: Record<string, unknown> = {
    status: newStatus,
  }

  if (newStatus === 'completed' || newStatus === 'posted') {
    updates.completed_at = new Date().toISOString()
  }

  if (body.proof_url) {
    updates.proof_url = body.proof_url
  }

  if (body.result && typeof body.result === 'object') {
    updates.result = body.result
  }

  const { error: updateError } = await supabaseAdmin
    .from('agent_share_queue')
    .update(updates)
    .eq('id', shareId)

  if (updateError) {
    console.error('Failed to update share task:', updateError)
    return NextResponse.json({ error: 'Failed to update share task' }, { status: 500 })
  }

  // Create feed event for completed shares (visible in the live feed)
  if (newStatus === 'completed' || newStatus === 'posted') {
    const proofText = body.proof_url ? ` — ${body.proof_url}` : ''
    await supabaseAdmin.from('feed_events').insert({
      type: 'agent_shared',
      preview: `Shared on social media${proofText}`,
      agent_ids: [share.agent_id],
      metadata: {
        share_id: shareId,
        proof_url: body.proof_url || null,
        result: body.result || null,
      },
    }).catch((err: unknown) => console.error('Failed to create share feed event:', err))
  }

  return NextResponse.json({ success: true, status: newStatus })
}
