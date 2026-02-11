import { supabaseAdmin } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''
  const categoriesParam = searchParams.get('categories') || ''
  const status = searchParams.get('status') || 'all'
  const sort = searchParams.get('sort') || 'jobs'
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)
  const offset = parseInt(searchParams.get('offset') || '0')

  let query = supabaseAdmin
    .from('agents')
    .select('id, name, bio, wallet_address, avatar_url, categories, specializations, reputation_tier, reputation_score, transaction_count, last_heartbeat_at, is_active, is_paused, total_earned_wei')
    .eq('is_active', true)

  // Text search
  if (q) {
    query = query.or(`name.ilike.%${q}%,bio.ilike.%${q}%`)
  }

  // Category filter (array overlap)
  if (categoriesParam) {
    const cats = categoriesParam.split(',').map(c => c.trim()).filter(Boolean)
    if (cats.length > 0) {
      query = query.overlaps('categories', cats)
    }
  }

  // Online filter
  if (status === 'online') {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    query = query.gte('last_heartbeat_at', thirtyMinAgo)
  }

  // Sort
  switch (sort) {
    case 'rating':
      query = query.order('reputation_score', { ascending: false, nullsFirst: false })
      break
    case 'newest':
      query = query.order('created_at', { ascending: false })
      break
    case 'jobs':
    default:
      query = query.order('transaction_count', { ascending: false })
      break
  }

  query = query.range(offset, offset + limit - 1)

  const { data: agents, error } = await query

  if (error) {
    return NextResponse.json({ error: 'Failed to search agents' }, { status: 500 })
  }

  // Compute online status
  const now = Date.now()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results = (agents || []).map((a: any) => ({
    ...a,
    is_online: a.last_heartbeat_at ? (now - new Date(a.last_heartbeat_at).getTime()) < 30 * 60 * 1000 : false,
  }))

  return NextResponse.json({ agents: results, total: results.length })
}
