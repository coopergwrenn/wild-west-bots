/**
 * Bounty Claim API (Oracle-Funded Model)
 * POST /api/listings/[id]/claim
 *
 * Allows any agent to claim a bounty listing.
 * Creates a REAL on-chain escrow via WildWestEscrowV2 using the ORACLE WALLET:
 *   1. Verifies buyer has locked platform balance for this bounty
 *   2. Oracle wallet approves USDC → calls createEscrow() on V2 contract
 *   3. Only after on-chain confirmation, debits buyer's locked balance
 *
 * The bounty poster is the BUYER (platform holds their funds). The claimer is the SELLER (delivers work).
 * The ORACLE fronts all on-chain transactions so buyers never need to sign anything.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { verifyAuth } from '@/lib/auth/middleware'
import { notifyListingClaimed, notifyBountyClaimed } from '@/lib/notifications/create'
import { tryFundAgent } from '@/lib/gas-faucet/fund'
import {
  ESCROW_V2_ADDRESS,
  buildCreateEscrowV2Data,
  buildApproveData,
  USDC,
  uuidToBytes32,
} from '@/lib/blockchain/escrow-v2'
import { createPublicClient, createWalletClient, http, erc20Abi } from 'viem'
import { base, baseSepolia } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import type { Address, Hex } from 'viem'

const isTestnet = process.env.NEXT_PUBLIC_CHAIN === 'sepolia'
const CHAIN = isTestnet ? baseSepolia : base

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: listingId } = await params

    // Verify auth
    const auth = await verifyAuth(request)
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    let agent_id: string

    // For agent auth, use the authenticated agent's ID
    if (auth.type === 'agent') {
      agent_id = auth.agentId
    } else {
      // For user auth, agent_id must be in body
      const body = await request.json()
      agent_id = body.agent_id

      if (!agent_id) {
        return NextResponse.json({ error: 'agent_id is required' }, { status: 400 })
      }

      // Verify user owns this agent
      const { data: agentOwner } = await supabaseAdmin
        .from('agents')
        .select('owner_address')
        .eq('id', agent_id)
        .single()

      if (!agentOwner || (auth.type === 'user' && agentOwner.owner_address !== auth.wallet.toLowerCase())) {
        return NextResponse.json({ error: 'Not authorized to claim with this agent' }, { status: 403 })
      }
    }

    // Get the listing
    const { data: listing, error: listingError } = await supabaseAdmin
      .from('listings')
      .select(`
        id, agent_id, poster_wallet, title, description, category, listing_type,
        price_wei, currency, is_active
      `)
      .eq('id', listingId)
      .single()

    if (listingError || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    if (listing.listing_type !== 'BOUNTY') {
      return NextResponse.json({ error: 'This listing is not a bounty' }, { status: 400 })
    }

    if (!listing.is_active) {
      return NextResponse.json({ error: 'This bounty is no longer available' }, { status: 400 })
    }

    if (listing.agent_id === agent_id) {
      return NextResponse.json({ error: 'Cannot claim your own bounty' }, { status: 400 })
    }

    // Get the claiming agent (seller — they will deliver work and receive payment)
    const { data: claimingAgent, error: agentError } = await supabaseAdmin
      .from('agents')
      .select('id, name, wallet_address, is_active, gas_promo_funded')
      .eq('id', agent_id)
      .single()

    if (agentError || !claimingAgent) {
      return NextResponse.json({ error: 'Claiming agent not found' }, { status: 404 })
    }

    if (!claimingAgent.is_active) {
      return NextResponse.json({ error: 'Claiming agent is not active' }, { status: 400 })
    }

    // Get the bounty poster (buyer — they posted the bounty and their funds are locked)
    // Can be either an agent OR a human user
    let buyerWallet: string
    let buyerName: string
    let buyerIsAgent = false
    let buyerLockedBalance: string

    if (listing.agent_id) {
      // Agent-posted bounty
      const { data: buyerAgent, error: buyerError } = await supabaseAdmin
        .from('agents')
        .select('id, name, wallet_address, locked_balance_wei')
        .eq('id', listing.agent_id)
        .single()

      if (buyerError || !buyerAgent) {
        return NextResponse.json({ error: 'Bounty poster agent not found' }, { status: 404 })
      }

      buyerWallet = buyerAgent.wallet_address
      buyerName = buyerAgent.name || 'Agent'
      buyerIsAgent = true
      buyerLockedBalance = buyerAgent.locked_balance_wei || '0'
    } else if (listing.poster_wallet) {
      // Human-posted bounty
      const { data: buyerUser, error: userError } = await supabaseAdmin
        .from('users')
        .select('wallet_address, email, locked_balance_wei')
        .eq('wallet_address', listing.poster_wallet.toLowerCase())
        .single()

      if (userError || !buyerUser) {
        return NextResponse.json({
          error: 'Bounty poster user not found. They need to sign in and deposit USDC first.',
          poster_wallet: listing.poster_wallet,
        }, { status: 404 })
      }

      buyerWallet = buyerUser.wallet_address
      buyerName = buyerUser.email || 'User'
      buyerIsAgent = false
      buyerLockedBalance = buyerUser.locked_balance_wei || '0'
    } else {
      return NextResponse.json({ error: 'Invalid bounty: no poster identified' }, { status: 500 })
    }

    // Verify buyer has locked balance to cover this bounty
    const requiredUsdc = BigInt(listing.price_wei)
    if (BigInt(buyerLockedBalance) < requiredUsdc) {
      return NextResponse.json({
        error: 'Bounty poster has insufficient locked platform balance',
        message: 'The buyer needs to deposit USDC to their platform balance first.',
      }, { status: 402 })
    }

    // --- Oracle wallet setup ---
    const oraclePrivateKey = process.env.ORACLE_PRIVATE_KEY
    if (!oraclePrivateKey) {
      return NextResponse.json({ error: 'Oracle wallet not configured' }, { status: 500 })
    }

    const oracleAccount = privateKeyToAccount(oraclePrivateKey as `0x${string}`)
    const oracleWallet = oracleAccount.address

    const rpcUrl = process.env.ALCHEMY_BASE_URL
    if (!rpcUrl) {
      return NextResponse.json({ error: 'RPC not configured' }, { status: 500 })
    }

    const publicClient = createPublicClient({ chain: CHAIN, transport: http(rpcUrl) })
    const walletClient = createWalletClient({
      account: oracleAccount,
      chain: CHAIN,
      transport: http(rpcUrl)
    })

    // Check oracle USDC balance
    const oracleUsdcBalance = await publicClient.readContract({
      address: USDC as Address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [oracleWallet],
    })

    if (oracleUsdcBalance < requiredUsdc) {
      return NextResponse.json({
        error: 'Oracle wallet has insufficient USDC',
        message: 'Platform wallet needs to be topped up with USDC.',
      }, { status: 500 })
    }

    // Check oracle ETH balance (gas)
    const oracleEthBalance = await publicClient.getBalance({ address: oracleWallet })
    const MIN_GAS_WEI = BigInt(3_000_000_000_000) // ~0.000003 ETH

    if (oracleEthBalance < MIN_GAS_WEI) {
      return NextResponse.json({
        error: 'Oracle wallet has insufficient ETH for gas',
        message: 'Platform wallet needs to be topped up with ETH.',
      }, { status: 500 })
    }

    // --- Create DB record in PENDING state (will update after on-chain success) ---
    const deadlineHours = 168 // 7 days to deliver
    const disputeWindowHours = 24 // 24 hour dispute window
    const deadline = new Date()
    deadline.setHours(deadline.getHours() + deadlineHours)

    const { data: transaction, error: txError } = await supabaseAdmin
      .from('transactions')
      .insert({
        listing_id: listing.id,
        buyer_agent_id: buyerIsAgent ? listing.agent_id : null,
        buyer_wallet: buyerIsAgent ? null : buyerWallet.toLowerCase(),
        seller_agent_id: agent_id,
        amount_wei: listing.price_wei,
        currency: listing.currency,
        state: 'PENDING',
        deadline: deadline.toISOString(),
        dispute_window_hours: disputeWindowHours,
        description: `Bounty: ${listing.title}`,
        listing_title: listing.title,
        oracle_funded: true,
        oracle_wallet: oracleWallet.toLowerCase(),
      })
      .select()
      .single()

    if (txError || !transaction) {
      console.error('Failed to create transaction:', txError)
      return NextResponse.json({ error: 'Failed to claim bounty' }, { status: 500 })
    }

    const escrowId = transaction.id
    const sellerWallet = claimingAgent.wallet_address as Address

    // --- On-chain: Approve USDC + Create V2 Escrow (using oracle wallet) ---
    let createTxHash: string
    try {
      // Step 1: Approve V2 escrow contract to spend oracle's USDC
      const approveCalldata = buildApproveData(ESCROW_V2_ADDRESS, requiredUsdc)

      const approveHash = await walletClient.writeContract({
        address: USDC as Address,
        abi: erc20Abi,
        functionName: 'approve',
        args: [ESCROW_V2_ADDRESS as Address, requiredUsdc]
      })

      console.log('[Claim] Oracle wallet approved USDC:', approveHash)

      // Wait for approve to be confirmed before creating escrow
      await publicClient.waitForTransactionReceipt({ hash: approveHash })

      // Step 2: Create the escrow on-chain (oracle is the on-chain buyer)
      const createCalldata = buildCreateEscrowV2Data(
        escrowId,
        sellerWallet,
        requiredUsdc,
        deadlineHours,
        disputeWindowHours
      )

      const createTx = await walletClient.writeContract({
        address: ESCROW_V2_ADDRESS,
        abi: [
          {
            name: 'createEscrow',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'escrowId', type: 'bytes32' },
              { name: 'seller', type: 'address' },
              { name: 'amount', type: 'uint256' },
              { name: 'deadlineHours', type: 'uint256' },
              { name: 'disputeWindowHours', type: 'uint256' }
            ],
            outputs: []
          }
        ],
        functionName: 'createEscrow',
        args: [
          uuidToBytes32(escrowId) as `0x${string}`,
          sellerWallet,
          requiredUsdc,
          BigInt(deadlineHours),
          BigInt(disputeWindowHours)
        ]
      })

      createTxHash = createTx
      console.log('[Claim] Oracle wallet created escrow:', createTxHash)

      // Wait for confirmation
      await publicClient.waitForTransactionReceipt({ hash: createTxHash as `0x${string}` })
    } catch (onChainError) {
      console.error('On-chain escrow creation failed:', onChainError)
      // Cleanup: delete the PENDING transaction
      await supabaseAdmin.from('transactions').delete().eq('id', transaction.id)
      return NextResponse.json({
        error: 'Failed to create on-chain escrow',
        details: onChainError instanceof Error ? onChainError.message : 'Unknown error',
      }, { status: 500 })
    }

    // --- On-chain succeeded — debit buyer's locked balance and update DB to FUNDED ---
    if (buyerIsAgent) {
      await supabaseAdmin.rpc('debit_locked_agent_balance', {
        p_agent_id: listing.agent_id!,
        p_amount_wei: listing.price_wei
      })

      // Record debit
      await supabaseAdmin.from('platform_transactions').insert({
        agent_id: listing.agent_id,
        type: 'DEBIT',
        amount_wei: listing.price_wei,
        reference_id: transaction.id,
        description: `Escrow created for: ${listing.title}`
      })
    } else {
      await supabaseAdmin.rpc('debit_locked_user_balance', {
        p_wallet_address: buyerWallet.toLowerCase(),
        p_amount_wei: listing.price_wei
      })

      // Record debit
      await supabaseAdmin.from('platform_transactions').insert({
        user_wallet: buyerWallet.toLowerCase(),
        type: 'DEBIT',
        amount_wei: listing.price_wei,
        reference_id: transaction.id,
        description: `Escrow created for: ${listing.title}`
      })
    }

    const { error: updateError } = await supabaseAdmin
      .from('transactions')
      .update({
        state: 'FUNDED',
        escrow_id: escrowId,
        tx_hash: createTxHash,
        contract_version: 2,
      })
      .eq('id', transaction.id)

    if (updateError) {
      console.error('Failed to update transaction after on-chain success:', updateError)
    }

    // Deactivate the bounty so it can't be claimed again
    await supabaseAdmin
      .from('listings')
      .update({ is_active: false })
      .eq('id', listingId)

    // Create feed event
    await supabaseAdmin.from('feed_events').insert({
      type: 'bounty_claimed',
      preview: `${listing.title} claimed`,
      agent_ids: buyerIsAgent ? [agent_id, listing.agent_id] : [agent_id],
      amount_wei: listing.price_wei,
      metadata: {
        listing_title: listing.title,
        transaction_id: transaction.id,
        listing_id: listing.id,
        tx_hash: createTxHash,
      },
    })

    // Notify the bounty poster
    if (buyerIsAgent) {
      await notifyListingClaimed(
        listing.agent_id!,
        claimingAgent.name || 'Agent',
        listing.title,
        listing.price_wei,
        transaction.id,
        listing.id
      ).catch(err => console.error('Failed to send notification:', err))
    } else {
      await notifyBountyClaimed(
        buyerWallet,
        claimingAgent.name || 'Agent',
        listing.title,
        listing.price_wei,
        transaction.id,
        listing.id
      ).catch(err => console.error('Failed to send notification:', err))
    }

    // Gas for agents who skipped /onboard
    if (!claimingAgent.gas_promo_funded && process.env.GAS_PROMO_ENABLED === 'true') {
      tryFundAgent(claimingAgent.id, claimingAgent.wallet_address)
        .catch(err => console.error('Gas funding failed:', err))
    }

    return NextResponse.json({
      success: true,
      transaction_id: transaction.id,
      escrow_id: escrowId,
      escrow_id_bytes32: uuidToBytes32(escrowId),
      tx_hash: createTxHash,
      contract_version: 2,
      amount_wei: listing.price_wei,
      oracle_funded: true,
      message: 'Bounty claimed. USDC locked in escrow on-chain (oracle-funded). Deliver your work to complete the transaction.',
      deadline: deadline.toISOString(),
      basescan_url: `https://basescan.org/tx/${createTxHash}`,
    })
  } catch (error) {
    console.error('Bounty claim error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
