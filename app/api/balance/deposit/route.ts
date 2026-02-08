import { supabaseAdmin } from '@/lib/supabase/server'
import { verifyAuth } from '@/lib/auth/middleware'
import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, parseUnits } from 'viem'
import { base, baseSepolia } from 'viem/chains'
import { USDC } from '@/lib/blockchain/usdc'

const isTestnet = process.env.NEXT_PUBLIC_CHAIN === 'sepolia'
const CHAIN = isTestnet ? baseSepolia : base
const PLATFORM_DEPOSIT_ADDRESS = process.env.TREASURY_ADDRESS as `0x${string}`

// POST /api/balance/deposit - User deposits USDC to platform balance
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)

  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { tx_hash, amount } = body

    if (!tx_hash || !amount) {
      return NextResponse.json({ error: 'tx_hash and amount are required' }, { status: 400 })
    }

    // Verify the transaction on-chain
    const publicClient = createPublicClient({
      chain: CHAIN,
      transport: http(process.env.ALCHEMY_BASE_URL)
    })

    const receipt = await publicClient.getTransactionReceipt({ hash: tx_hash as `0x${string}` })

    if (!receipt || receipt.status !== 'success') {
      return NextResponse.json({ error: 'Transaction not found or failed' }, { status: 400 })
    }

    // Parse USDC transfer logs to verify amount and recipient
    const transferLog = receipt.logs.find(log =>
      log.address.toLowerCase() === USDC.toLowerCase() &&
      log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' // Transfer event
    )

    if (!transferLog) {
      return NextResponse.json({ error: 'USDC transfer not found in transaction' }, { status: 400 })
    }

    // Decode transfer: topics[2] = to address, data = amount
    const toAddress = '0x' + transferLog.topics[2]?.slice(-40)
    if (toAddress.toLowerCase() !== PLATFORM_DEPOSIT_ADDRESS.toLowerCase()) {
      return NextResponse.json({ error: 'Transfer was not sent to platform deposit address' }, { status: 400 })
    }

    const transferAmount = BigInt(transferLog.data)
    const expectedAmount = parseUnits(amount.toString(), 6)

    if (transferAmount < expectedAmount) {
      return NextResponse.json({
        error: `Transfer amount (${transferAmount.toString()}) is less than expected (${expectedAmount.toString()})`
      }, { status: 400 })
    }

    // Check if this tx_hash was already processed
    const { data: existingDeposit } = await supabaseAdmin
      .from('platform_transactions')
      .select('id')
      .eq('tx_hash', tx_hash)
      .single()

    if (existingDeposit) {
      return NextResponse.json({ error: 'Deposit already processed' }, { status: 400 })
    }

    // Credit the user's platform balance
    if (auth.type === 'user') {
      const { error: updateError } = await supabaseAdmin.rpc('increment_user_balance', {
        p_wallet_address: auth.wallet.toLowerCase(),
        p_amount_wei: transferAmount.toString()
      })

      if (updateError) {
        console.error('Failed to credit user balance:', updateError)
        return NextResponse.json({ error: 'Failed to credit balance' }, { status: 500 })
      }

      // Record deposit transaction
      await supabaseAdmin.from('platform_transactions').insert({
        user_wallet: auth.wallet.toLowerCase(),
        type: 'DEPOSIT',
        amount_wei: transferAmount.toString(),
        tx_hash,
        description: `Deposited ${(Number(transferAmount) / 1e6).toFixed(2)} USDC`
      })

    } else if (auth.type === 'agent') {
      const { error: updateError } = await supabaseAdmin.rpc('increment_agent_balance', {
        p_agent_id: auth.agentId,
        p_amount_wei: transferAmount.toString()
      })

      if (updateError) {
        console.error('Failed to credit agent balance:', updateError)
        return NextResponse.json({ error: 'Failed to credit balance' }, { status: 500 })
      }

      // Record deposit transaction
      await supabaseAdmin.from('platform_transactions').insert({
        agent_id: auth.agentId,
        type: 'DEPOSIT',
        amount_wei: transferAmount.toString(),
        tx_hash,
        description: `Deposited ${(Number(transferAmount) / 1e6).toFixed(2)} USDC`
      })
    }

    return NextResponse.json({
      success: true,
      message: `Deposited ${(Number(transferAmount) / 1e6).toFixed(2)} USDC to platform balance`,
      amount_wei: transferAmount.toString()
    })

  } catch (err) {
    console.error('Deposit error:', err)
    return NextResponse.json({ error: 'Failed to process deposit' }, { status: 500 })
  }
}
