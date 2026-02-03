/**
 * State Reconciliation Cron
 *
 * Per PRD Section 16 - Syncs on-chain state with database every 6 hours.
 * Detects and corrects mismatches between contract events and local state.
 *
 * Schedule: Every 6 hours (cron: "0 every-6-hours * * *")
 */

import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, parseAbiItem } from 'viem'
import { base } from 'viem/chains'
import { createClient } from '@supabase/supabase-js'
import { sendAlert } from '@/lib/monitoring/alerts'

const ESCROW_V2_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_V2_ADDRESS as `0x${string}`
const MAX_BLOCKS_PER_QUERY = BigInt(10000)

// V2 contract events
const ESCROW_CREATED_EVENT = parseAbiItem(
  'event EscrowCreated(bytes32 indexed escrowId, address indexed buyer, address indexed seller, uint256 amount, uint256 deadline, uint256 disputeWindowHours)'
)
const ESCROW_RELEASED_EVENT = parseAbiItem(
  'event EscrowReleased(bytes32 indexed escrowId, uint256 sellerAmount, uint256 feeAmount)'
)
const ESCROW_REFUNDED_EVENT = parseAbiItem(
  'event EscrowRefunded(bytes32 indexed escrowId, uint256 amount)'
)
const ESCROW_DISPUTED_EVENT = parseAbiItem(
  'event EscrowDisputed(bytes32 indexed escrowId, address disputedBy)'
)

interface ReconciliationResult {
  escrowId: string
  dbState: string
  chainState: string
  action: 'updated' | 'mismatch' | 'ok'
  error?: string
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.ALCHEMY_BASE_URL),
  })

  // Log run start
  const { data: runRecord } = await supabase
    .from('oracle_runs')
    .insert({
      run_type: 'reconciliation',
      started_at: new Date().toISOString(),
    })
    .select()
    .single()

  const results: ReconciliationResult[] = []
  let mismatches = 0
  let updated = 0

  try {
    // Get current block
    const currentBlock = await publicClient.getBlockNumber()

    // Get last reconciliation checkpoint
    const { data: checkpoint } = await supabase
      .from('reconciliation_checkpoints')
      .select('last_block')
      .eq('contract_address', ESCROW_V2_ADDRESS)
      .single()

    const fromBlock = checkpoint?.last_block
      ? BigInt(checkpoint.last_block)
      : currentBlock - BigInt(50000) // Default: last ~2 days

    // Query in chunks to avoid RPC limits
    let processedToBlock = fromBlock

    for (let startBlock = fromBlock; startBlock < currentBlock; startBlock += MAX_BLOCKS_PER_QUERY) {
      const endBlock = startBlock + MAX_BLOCKS_PER_QUERY > currentBlock
        ? currentBlock
        : startBlock + MAX_BLOCKS_PER_QUERY

      // Fetch all event types
      const [createdEvents, releasedEvents, refundedEvents, disputedEvents] = await Promise.all([
        publicClient.getLogs({
          address: ESCROW_V2_ADDRESS,
          event: ESCROW_CREATED_EVENT,
          fromBlock: startBlock,
          toBlock: endBlock,
        }),
        publicClient.getLogs({
          address: ESCROW_V2_ADDRESS,
          event: ESCROW_RELEASED_EVENT,
          fromBlock: startBlock,
          toBlock: endBlock,
        }),
        publicClient.getLogs({
          address: ESCROW_V2_ADDRESS,
          event: ESCROW_REFUNDED_EVENT,
          fromBlock: startBlock,
          toBlock: endBlock,
        }),
        publicClient.getLogs({
          address: ESCROW_V2_ADDRESS,
          event: ESCROW_DISPUTED_EVENT,
          fromBlock: startBlock,
          toBlock: endBlock,
        }),
      ])

      // Build maps for quick lookup
      const releasedMap = new Map(releasedEvents.map(e => [e.args.escrowId, e]))
      const refundedMap = new Map(refundedEvents.map(e => [e.args.escrowId, e]))
      const disputedMap = new Map(disputedEvents.map(e => [e.args.escrowId, e]))

      // Process each escrow
      for (const event of createdEvents) {
        const escrowId = event.args.escrowId as `0x${string}`

        // Determine on-chain state
        let chainState = 'FUNDED'
        if (releasedMap.has(escrowId)) {
          chainState = 'RELEASED'
        } else if (refundedMap.has(escrowId)) {
          chainState = 'REFUNDED'
        } else if (disputedMap.has(escrowId)) {
          chainState = 'DISPUTED'
        }

        // Get DB state
        const { data: tx } = await supabase
          .from('transactions')
          .select('id, state, escrow_id')
          .eq('escrow_id', escrowId)
          .single()

        if (!tx) {
          // Transaction exists on-chain but not in DB - create it
          const { error: insertError } = await supabase.from('transactions').insert({
            escrow_id: escrowId,
            state: chainState,
            contract_version: 2,
            reconciled: true,
            reconciled_at: new Date().toISOString(),
            notes: 'Created by reconciliation from on-chain event',
          })

          if (insertError) {
            results.push({
              escrowId,
              dbState: 'MISSING',
              chainState,
              action: 'mismatch',
              error: insertError.message,
            })
            mismatches++
          } else {
            results.push({
              escrowId,
              dbState: 'MISSING',
              chainState,
              action: 'updated',
            })
            updated++
          }
          continue
        }

        // Compare states
        if (tx.state !== chainState) {
          // State mismatch - update DB to match chain
          const { error: updateError } = await supabase
            .from('transactions')
            .update({
              state: chainState,
              reconciled: true,
              reconciled_at: new Date().toISOString(),
              notes: `Reconciled: ${tx.state} -> ${chainState}`,
            })
            .eq('id', tx.id)

          if (updateError) {
            results.push({
              escrowId,
              dbState: tx.state,
              chainState,
              action: 'mismatch',
              error: updateError.message,
            })
            mismatches++
          } else {
            results.push({
              escrowId,
              dbState: tx.state,
              chainState,
              action: 'updated',
            })
            updated++
          }
        } else {
          results.push({
            escrowId,
            dbState: tx.state,
            chainState,
            action: 'ok',
          })
        }
      }

      processedToBlock = endBlock
    }

    // Update checkpoint
    await supabase
      .from('reconciliation_checkpoints')
      .upsert({
        contract_address: ESCROW_V2_ADDRESS,
        last_block: processedToBlock.toString(),
        updated_at: new Date().toISOString(),
      })

    // Update run record
    await supabase
      .from('oracle_runs')
      .update({
        completed_at: new Date().toISOString(),
        processed_count: results.length,
        success_count: updated + results.filter(r => r.action === 'ok').length,
        failure_count: mismatches,
        metadata: {
          from_block: fromBlock.toString(),
          to_block: processedToBlock.toString(),
          duration_ms: Date.now() - startTime,
          updated,
          mismatches,
        },
      })
      .eq('id', runRecord?.id)

    // Alert if significant mismatches
    if (mismatches > 10) {
      await sendAlert('error', `Reconciliation found ${mismatches} mismatches`, {
        mismatches,
        updated,
        fromBlock: fromBlock.toString(),
        toBlock: processedToBlock.toString(),
      })
    } else if (mismatches > 0) {
      await sendAlert('warning', `Reconciliation: ${mismatches} mismatches, ${updated} updated`, {
        mismatches,
        updated,
      })
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      updated,
      mismatches,
      fromBlock: fromBlock.toString(),
      toBlock: processedToBlock.toString(),
      duration_ms: Date.now() - startTime,
    })

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'

    await sendAlert('error', 'Reconciliation cron failed', { error: errorMsg })

    await supabase
      .from('oracle_runs')
      .update({
        completed_at: new Date().toISOString(),
        failure_count: 1,
        metadata: { error: errorMsg },
      })
      .eq('id', runRecord?.id)

    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}

// Also support GET for manual triggering via browser
export async function GET(request: NextRequest) {
  return POST(request)
}
