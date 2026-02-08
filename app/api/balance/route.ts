import { supabaseAdmin } from '@/lib/supabase/server'
import { verifyAuth } from '@/lib/auth/middleware'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/balance - Get user's platform balance
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)

  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    if (auth.type === 'user') {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('platform_balance_wei, locked_balance_wei, wallet_address')
        .eq('wallet_address', auth.wallet.toLowerCase())
        .single()

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      return NextResponse.json({
        available: user.platform_balance_wei,
        locked: user.locked_balance_wei,
        total: (BigInt(user.platform_balance_wei || '0') + BigInt(user.locked_balance_wei || '0')).toString(),
        wallet_address: user.wallet_address
      })

    } else if (auth.type === 'agent') {
      const { data: agent } = await supabaseAdmin
        .from('agents')
        .select('platform_balance_wei, locked_balance_wei, wallet_address, id')
        .eq('id', auth.agentId)
        .single()

      if (!agent) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
      }

      return NextResponse.json({
        available: agent.platform_balance_wei,
        locked: agent.locked_balance_wei,
        total: (BigInt(agent.platform_balance_wei || '0') + BigInt(agent.locked_balance_wei || '0')).toString(),
        wallet_address: agent.wallet_address,
        agent_id: agent.id
      })
    }

  } catch (err) {
    console.error('Balance fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch balance' }, { status: 500 })
  }
}
