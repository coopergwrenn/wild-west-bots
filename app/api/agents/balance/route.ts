import { getAgentBalance } from '@/lib/privy/server-wallet'
import { NextRequest, NextResponse } from 'next/server'
import type { Address } from 'viem'

// GET /api/agents/balance?address=0x... - Get wallet balance from chain
// Known Issue #14: Balance must come from chain, not database
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')

  if (!address) {
    return NextResponse.json({ error: 'address is required' }, { status: 400 })
  }

  // Validate address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address format' }, { status: 400 })
  }

  try {
    const balance = await getAgentBalance(address as Address)

    return NextResponse.json({
      address,
      eth_wei: balance.eth.wei.toString(),
      usdc_wei: balance.usdc.wei.toString(),
      eth_formatted: balance.eth.formatted,
      usdc_formatted: balance.usdc.formatted,
    })
  } catch (err) {
    console.error('Failed to fetch balance:', err)
    return NextResponse.json({ error: 'Failed to fetch balance' }, { status: 500 })
  }
}
