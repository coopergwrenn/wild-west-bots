import { supabaseAdmin } from '@/lib/supabase/server'
import { verifyAuth } from '@/lib/auth/middleware'
import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, createWalletClient, http } from 'viem'
import { base, baseSepolia } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { USDC, USDC_ABI } from '@/lib/blockchain/usdc'

const isTestnet = process.env.NEXT_PUBLIC_CHAIN === 'sepolia'
const CHAIN = isTestnet ? baseSepolia : base

// POST /api/balance/withdraw - User withdraws USDC from platform balance to their wallet
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)

  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { amount, to_address } = body

    if (!amount || !to_address) {
      return NextResponse.json({ error: 'amount and to_address are required' }, { status: 400 })
    }

    const amountWei = BigInt(Math.floor(amount * 1e6))

    // Get user's available balance
    let availableBalance: string | null = null
    let userWallet: string | null = null
    let agentId: string | null = null

    if (auth.type === 'user') {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('platform_balance_wei, wallet_address')
        .eq('wallet_address', auth.wallet.toLowerCase())
        .single()

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      availableBalance = user.platform_balance_wei
      userWallet = user.wallet_address
    } else if (auth.type === 'agent') {
      const { data: agent } = await supabaseAdmin
        .from('agents')
        .select('platform_balance_wei, id')
        .eq('id', auth.agentId)
        .single()

      if (!agent) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
      }

      availableBalance = agent.platform_balance_wei
      agentId = agent.id
    }

    if (!availableBalance || BigInt(availableBalance) < amountWei) {
      return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 })
    }

    // Use treasury wallet to send USDC (since deposits go to treasury)
    const account = privateKeyToAccount(process.env.TREASURY_PRIVATE_KEY as `0x${string}`)
    const walletClient = createWalletClient({
      account,
      chain: CHAIN,
      transport: http(process.env.ALCHEMY_BASE_URL)
    })

    const publicClient = createPublicClient({
      chain: CHAIN,
      transport: http(process.env.ALCHEMY_BASE_URL)
    })

    // Send USDC to user's wallet
    const txHash = await walletClient.writeContract({
      address: USDC as `0x${string}`,
      abi: USDC_ABI,
      functionName: 'transfer',
      args: [to_address as `0x${string}`, amountWei]
    })

    // Wait for confirmation
    await publicClient.waitForTransactionReceipt({ hash: txHash })

    // Debit user's platform balance
    if (auth.type === 'user') {
      await supabaseAdmin.rpc('increment_user_balance', {
        p_wallet_address: userWallet!,
        p_amount_wei: -amountWei.toString()
      })

      // Record withdrawal
      await supabaseAdmin.from('platform_transactions').insert({
        user_wallet: userWallet,
        type: 'WITHDRAWAL',
        amount_wei: amountWei.toString(),
        tx_hash: txHash,
        description: `Withdrew ${(Number(amountWei) / 1e6).toFixed(2)} USDC to ${to_address.slice(0, 6)}...${to_address.slice(-4)}`
      })
    } else if (auth.type === 'agent') {
      await supabaseAdmin.rpc('increment_agent_balance', {
        p_agent_id: agentId!,
        p_amount_wei: -amountWei.toString()
      })

      // Record withdrawal
      await supabaseAdmin.from('platform_transactions').insert({
        agent_id: agentId,
        type: 'WITHDRAWAL',
        amount_wei: amountWei.toString(),
        tx_hash: txHash,
        description: `Withdrew ${(Number(amountWei) / 1e6).toFixed(2)} USDC to ${to_address.slice(0, 6)}...${to_address.slice(-4)}`
      })
    }

    return NextResponse.json({
      success: true,
      message: `Withdrew ${(Number(amountWei) / 1e6).toFixed(2)} USDC`,
      tx_hash: txHash,
      amount_wei: amountWei.toString()
    })

  } catch (err) {
    console.error('Withdrawal error:', err)
    return NextResponse.json({ error: 'Failed to process withdrawal' }, { status: 500 })
  }
}
