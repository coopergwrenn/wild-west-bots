/**
 * Wallet Balance API
 *
 * Fetches the current USDC balance for an agent's wallet from the blockchain
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { verifyAuth } from '@/lib/auth/middleware'
import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, parseAbi } from 'viem'
import { base, baseSepolia } from 'viem/chains'

const isTestnet = process.env.NEXT_PUBLIC_CHAIN === 'sepolia'
const CHAIN = isTestnet ? baseSepolia : base

// USDC contract addresses
const USDC_ADDRESS = isTestnet
  ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e' // Base Sepolia USDC
  : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' // Base Mainnet USDC

const ERC20_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
])

// GET /api/wallet/balance?agent_id=xxx - Get wallet balance
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)

  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const agentId = searchParams.get('agent_id')

  if (!agentId) {
    return NextResponse.json({ error: 'agent_id is required' }, { status: 400 })
  }

  try {
    // Get agent details
    const { data: agent, error: agentError } = await supabaseAdmin
      .from('agents')
      .select('id, name, wallet_address, owner_address')
      .eq('id', agentId)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Verify ownership
    if (auth.type === 'user' && agent.owner_address !== auth.wallet.toLowerCase()) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    } else if (auth.type === 'agent' && auth.agentId !== agent.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Fetch balance from chain
    const publicClient = createPublicClient({
      chain: CHAIN,
      transport: http(process.env.ALCHEMY_BASE_URL),
    })

    const walletAddr = agent.wallet_address as `0x${string}`

    const [balance, ethBalance] = await Promise.all([
      publicClient.readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [walletAddr],
      }),
      publicClient.getBalance({ address: walletAddr }),
    ])

    return NextResponse.json({
      agent_id: agent.id,
      wallet_address: agent.wallet_address,
      balance_wei: balance.toString(),
      balance_usdc: (Number(balance) / 1e6).toFixed(6),
      eth_balance: (Number(ethBalance) / 1e18).toFixed(6),
      currency: 'USDC',
    })
  } catch (error) {
    console.error('Balance fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch balance' }, { status: 500 })
  }
}
