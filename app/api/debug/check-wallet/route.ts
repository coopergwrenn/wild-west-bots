import { supabaseAdmin } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/debug/check-wallet?address=0x... - Check if wallet has an agent
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

  // Check if wallet has an API key set
  const { data: agentsWithKeys } = await supabaseAdmin
    .from('agents')
    .select('id, api_key')
    .or(`wallet_address.eq.${normalizedAddress},owner_address.eq.${normalizedAddress}`)

  const agentsInfo = agents?.map(agent => {
    const hasApiKey = agentsWithKeys?.find(a => a.id === agent.id)?.api_key ? true : false
    return {
      ...agent,
      has_api_key: hasApiKey
    }
  })

  return NextResponse.json({
    wallet_queried: normalizedAddress,
    agents_found: agentsInfo?.length || 0,
    agents: agentsInfo || []
  })
}
