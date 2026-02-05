/**
 * Withdraw Funds API
 *
 * Allows agents to withdraw USDC from their managed wallet to an external address
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { verifyAuth } from '@/lib/auth/middleware'
import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, createWalletClient, http, encodeFunctionData, parseAbi } from 'viem'
import { base, baseSepolia } from 'viem/chains'
import { signAgentTransaction } from '@/lib/privy/server-wallet'
import { notifyWithdrawalCompleted } from '@/lib/notifications/create'

const isTestnet = process.env.NEXT_PUBLIC_CHAIN === 'sepolia'
const CHAIN = isTestnet ? baseSepolia : base

// USDC contract addresses
const USDC_ADDRESS = isTestnet
  ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e' // Base Sepolia USDC
  : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' // Base Mainnet USDC

const ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
])

// POST /api/wallet/withdraw - Withdraw USDC from managed wallet
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)

  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { agent_id, destination_address, amount_wei } = body

    // Validate inputs
    if (!agent_id || !destination_address || !amount_wei) {
      return NextResponse.json({
        error: 'agent_id, destination_address, and amount_wei are required'
      }, { status: 400 })
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(destination_address)) {
      return NextResponse.json({ error: 'Invalid destination address' }, { status: 400 })
    }

    // Validate amount
    const amount = BigInt(amount_wei)
    if (amount <= BigInt(0)) {
      return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 })
    }

    // Get agent details
    const { data: agent, error: agentError } = await supabaseAdmin
      .from('agents')
      .select('id, name, wallet_address, owner_address, privy_wallet_id, is_hosted')
      .eq('id', agent_id)
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

    // Only hosted agents with Privy wallets can withdraw
    if (!agent.is_hosted || !agent.privy_wallet_id) {
      return NextResponse.json({
        error: 'Withdrawal only available for hosted agents with managed wallets'
      }, { status: 400 })
    }

    // Check balance on chain
    const publicClient = createPublicClient({
      chain: CHAIN,
      transport: http(process.env.ALCHEMY_BASE_URL),
    })

    const balance = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [agent.wallet_address as `0x${string}`],
    })

    if (balance < amount) {
      return NextResponse.json({
        error: 'Insufficient balance',
        balance: balance.toString(),
        requested: amount_wei
      }, { status: 400 })
    }

    // Create withdrawal record
    const { data: withdrawal, error: insertError } = await supabaseAdmin
      .from('withdrawals')
      .insert({
        agent_id: agent.id,
        from_wallet: agent.wallet_address,
        to_wallet: destination_address,
        amount_wei: amount_wei,
        currency: 'USDC',
        status: 'PENDING',
      })
      .select()
      .single()

    if (insertError) {
      console.error('Failed to create withdrawal record:', insertError)
      return NextResponse.json({ error: 'Failed to initiate withdrawal' }, { status: 500 })
    }

    // Execute transfer via Privy
    try {
      const calldata = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [destination_address as `0x${string}`, amount],
      })

      const result = await signAgentTransaction(
        agent.privy_wallet_id,
        USDC_ADDRESS,
        calldata
      )

      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: result.hash as `0x${string}`,
      })

      // Update withdrawal record
      await supabaseAdmin
        .from('withdrawals')
        .update({
          tx_hash: result.hash,
          status: receipt.status === 'success' ? 'COMPLETED' : 'FAILED',
          completed_at: new Date().toISOString(),
        })
        .eq('id', withdrawal.id)

      if (receipt.status === 'success') {
        // Send notification
        await notifyWithdrawalCompleted(
          agent.id,
          amount_wei,
          destination_address,
          result.hash
        )

        return NextResponse.json({
          success: true,
          withdrawal_id: withdrawal.id,
          tx_hash: result.hash,
          amount: amount_wei,
          destination: destination_address,
        })
      } else {
        return NextResponse.json({
          error: 'Transaction failed on chain',
          tx_hash: result.hash,
        }, { status: 500 })
      }
    } catch (txError) {
      console.error('Withdrawal transaction error:', txError)

      // Update withdrawal record with error
      await supabaseAdmin
        .from('withdrawals')
        .update({
          status: 'FAILED',
          error_message: txError instanceof Error ? txError.message : 'Unknown error',
          completed_at: new Date().toISOString(),
        })
        .eq('id', withdrawal.id)

      return NextResponse.json({
        error: 'Withdrawal failed',
        details: txError instanceof Error ? txError.message : 'Unknown error',
      }, { status: 500 })
    }
  } catch (error) {
    console.error('Withdraw error:', error)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
