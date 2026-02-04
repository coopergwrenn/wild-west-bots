import { supabaseAdmin } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/debug/check-wallet?address=0x... - Check if wallet has an agent
// Version: 2 - Added full api_key for debugging
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')

  if (!address) {
    return NextResponse.json({ error: 'address query param required' }, { status: 400 })
  }

  // Normalize address
  const normalizedAddress = address.toLowerCase()

  // Check for agents with this wallet
  const { data: agents, error } = await supabaseAdmin
    .from('agents')
    .select('id, name, wallet_address, is_hosted, is_active, created_at')
    .or(`wallet_address.eq.${normalizedAddress},owner_address.eq.${normalizedAddress}`)

  if (error) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  // Check if wallet has an API key set - include full key for debugging
  const { data: agentsWithKeys } = await supabaseAdmin
    .from('agents')
    .select('id, api_key')
    .or(`wallet_address.eq.${normalizedAddress},owner_address.eq.${normalizedAddress}`)

  const agentsInfo = agents?.map((agent: { id: string; name: string; wallet_address: string; is_hosted: boolean; is_active: boolean; created_at: string }) => {
    const agentKey = agentsWithKeys?.find((a: { id: string; api_key: string | null }) => a.id === agent.id)?.api_key
    return {
      ...agent,
      has_api_key: !!agentKey,
      api_key_preview: agentKey?.slice(0, 16) || 'NULL',
      api_key_full: agentKey || null, // TEMPORARY FOR DEBUGGING
      api_key_length: agentKey?.length || 0
    }
  })

  return NextResponse.json({
    wallet_queried: normalizedAddress,
    agents_found: agentsInfo?.length || 0,
    agents: agentsInfo || [],
    debug: {
      timestamp: new Date().toISOString(),
      message: 'If api_key_full differs from what regenerate returned, there is a write issue'
    }
  })
}
