/**
 * Emergency Recovery Script: Rebuild from Chain
 *
 * Per PRD Section 18 - Emergency Runbook: Database Recovery from Chain
 *
 * Purpose: Rebuild agent transaction history and reputation from on-chain events
 * when database is lost or corrupted.
 *
 * What it does:
 * 1. Scans all EscrowCreated events from V2 contract
 * 2. Scans all EscrowReleased/Refunded/Disputed events
 * 3. Rebuilds transaction records from events
 * 4. Recalculates reputation for all agents
 *
 * Run: npx tsx scripts/rebuild-from-chain.ts [--from-block BLOCK] [--dry-run]
 */

import { createPublicClient, http, parseAbiItem, formatUnits } from 'viem'
import { base } from 'viem/chains'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const ESCROW_V2_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_V2_ADDRESS as `0x${string}`
const DEPLOYMENT_BLOCK = BigInt(25000000) // Approximate deployment block - adjust as needed

// Parse command line args
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const fromBlockArg = args.find(a => a.startsWith('--from-block='))
const fromBlock = fromBlockArg ? BigInt(fromBlockArg.split('=')[1]) : DEPLOYMENT_BLOCK

// Events
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
const ESCROW_DELIVERED_EVENT = parseAbiItem(
  'event EscrowDelivered(bytes32 indexed escrowId, uint256 deliveredAt, bytes32 deliverableHash)'
)

interface EscrowEvent {
  escrowId: string
  buyer: string
  seller: string
  amount: bigint
  deadline: bigint
  disputeWindowHours: bigint
  blockNumber: bigint
  transactionHash: string
}

interface AgentStats {
  wallet: string
  transactionCount: number
  released: number
  refunded: number
  disputed: number
  totalVolume: bigint
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║     Wild West Bots - Emergency Database Recovery         ║')
  console.log('╚══════════════════════════════════════════════════════════╝')
  console.log('')

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made to database')
    console.log('')
  }

  const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.ALCHEMY_BASE_URL),
  })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  console.log(`Contract: ${ESCROW_V2_ADDRESS}`)
  console.log(`Starting from block: ${fromBlock}`)
  console.log('')

  // Get current block
  const currentBlock = await publicClient.getBlockNumber()
  console.log(`Current block: ${currentBlock}`)
  console.log('')

  // ========== STEP 1: Fetch all events ==========
  console.log('Step 1: Fetching all contract events...')
  console.log('')

  const MAX_BLOCKS = BigInt(50000)
  const allCreated: EscrowEvent[] = []
  const releasedMap = new Map<string, { blockNumber: bigint; txHash: string }>()
  const refundedMap = new Map<string, { blockNumber: bigint; txHash: string }>()
  const disputedMap = new Map<string, { blockNumber: bigint; disputedBy: string }>()
  const deliveredMap = new Map<string, { blockNumber: bigint; deliverableHash: string }>()

  for (let start = fromBlock; start < currentBlock; start += MAX_BLOCKS) {
    const end = start + MAX_BLOCKS > currentBlock ? currentBlock : start + MAX_BLOCKS
    process.stdout.write(`  Scanning blocks ${start} - ${end}...`)

    try {
      const [created, released, refunded, disputed, delivered] = await Promise.all([
        publicClient.getLogs({
          address: ESCROW_V2_ADDRESS,
          event: ESCROW_CREATED_EVENT,
          fromBlock: start,
          toBlock: end,
        }),
        publicClient.getLogs({
          address: ESCROW_V2_ADDRESS,
          event: ESCROW_RELEASED_EVENT,
          fromBlock: start,
          toBlock: end,
        }),
        publicClient.getLogs({
          address: ESCROW_V2_ADDRESS,
          event: ESCROW_REFUNDED_EVENT,
          fromBlock: start,
          toBlock: end,
        }),
        publicClient.getLogs({
          address: ESCROW_V2_ADDRESS,
          event: ESCROW_DISPUTED_EVENT,
          fromBlock: start,
          toBlock: end,
        }),
        publicClient.getLogs({
          address: ESCROW_V2_ADDRESS,
          event: ESCROW_DELIVERED_EVENT,
          fromBlock: start,
          toBlock: end,
        }),
      ])

      for (const e of created) {
        allCreated.push({
          escrowId: e.args.escrowId as string,
          buyer: e.args.buyer as string,
          seller: e.args.seller as string,
          amount: e.args.amount as bigint,
          deadline: e.args.deadline as bigint,
          disputeWindowHours: e.args.disputeWindowHours as bigint,
          blockNumber: e.blockNumber,
          transactionHash: e.transactionHash,
        })
      }

      for (const e of released) {
        releasedMap.set(e.args.escrowId as string, {
          blockNumber: e.blockNumber,
          txHash: e.transactionHash,
        })
      }

      for (const e of refunded) {
        refundedMap.set(e.args.escrowId as string, {
          blockNumber: e.blockNumber,
          txHash: e.transactionHash,
        })
      }

      for (const e of disputed) {
        disputedMap.set(e.args.escrowId as string, {
          blockNumber: e.blockNumber,
          disputedBy: e.args.disputedBy as string,
        })
      }

      for (const e of delivered) {
        deliveredMap.set(e.args.escrowId as string, {
          blockNumber: e.blockNumber,
          deliverableHash: e.args.deliverableHash as string,
        })
      }

      console.log(` found ${created.length} escrows`)
    } catch (err) {
      console.log(` ERROR: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
  }

  console.log('')
  console.log(`  Total escrows found: ${allCreated.length}`)
  console.log(`  Released: ${releasedMap.size}`)
  console.log(`  Refunded: ${refundedMap.size}`)
  console.log(`  Disputed: ${disputedMap.size}`)
  console.log(`  Delivered: ${deliveredMap.size}`)
  console.log('')

  // ========== STEP 2: Rebuild transactions ==========
  console.log('Step 2: Rebuilding transaction records...')
  console.log('')

  let created = 0
  let updated = 0
  let skipped = 0

  for (const escrow of allCreated) {
    // Determine state
    let state = 'FUNDED'
    let releaseTxHash: string | undefined
    let refundTxHash: string | undefined
    let deliverableHash: string | undefined

    const delivered = deliveredMap.get(escrow.escrowId)
    const released = releasedMap.get(escrow.escrowId)
    const refunded = refundedMap.get(escrow.escrowId)
    const disputed = disputedMap.get(escrow.escrowId)

    if (delivered) {
      state = 'DELIVERED'
      deliverableHash = delivered.deliverableHash
    }

    if (released) {
      state = 'RELEASED'
      releaseTxHash = released.txHash
    } else if (refunded) {
      state = 'REFUNDED'
      refundTxHash = refunded.txHash
    } else if (disputed) {
      state = 'DISPUTED'
    }

    // Check if transaction exists
    const { data: existing } = await supabase
      .from('transactions')
      .select('id, state')
      .eq('escrow_id', escrow.escrowId)
      .single()

    if (existing) {
      if (existing.state !== state) {
        if (!dryRun) {
          await supabase
            .from('transactions')
            .update({
              state,
              release_tx_hash: releaseTxHash,
              refund_tx_hash: refundTxHash,
              deliverable_hash: deliverableHash,
              reconciled: true,
              reconciled_at: new Date().toISOString(),
            })
            .eq('id', existing.id)
        }
        updated++
        console.log(`  Updated ${escrow.escrowId.slice(0, 18)}... ${existing.state} -> ${state}`)
      } else {
        skipped++
      }
    } else {
      if (!dryRun) {
        // Find or create buyer/seller agents by wallet
        const { data: buyerAgent } = await supabase
          .from('agents')
          .select('id')
          .eq('wallet_address', escrow.buyer.toLowerCase())
          .single()

        const { data: sellerAgent } = await supabase
          .from('agents')
          .select('id')
          .eq('wallet_address', escrow.seller.toLowerCase())
          .single()

        await supabase.from('transactions').insert({
          escrow_id: escrow.escrowId,
          buyer_agent_id: buyerAgent?.id || null,
          seller_agent_id: sellerAgent?.id || null,
          amount_wei: escrow.amount.toString(),
          currency: 'USDC',
          state,
          contract_version: 2,
          deadline: new Date(Number(escrow.deadline) * 1000).toISOString(),
          dispute_window_hours: Number(escrow.disputeWindowHours),
          escrow_tx_hash: escrow.transactionHash,
          release_tx_hash: releaseTxHash,
          refund_tx_hash: refundTxHash,
          deliverable_hash: deliverableHash,
          reconciled: true,
          reconciled_at: new Date().toISOString(),
          notes: 'Created by rebuild-from-chain recovery script',
        })
      }
      created++
      console.log(`  Created ${escrow.escrowId.slice(0, 18)}... state=${state}`)
    }
  }

  console.log('')
  console.log(`  Created: ${created}`)
  console.log(`  Updated: ${updated}`)
  console.log(`  Skipped (unchanged): ${skipped}`)
  console.log('')

  // ========== STEP 3: Rebuild agent reputation ==========
  console.log('Step 3: Rebuilding agent reputation...')
  console.log('')

  // Collect stats per seller wallet
  const agentStats = new Map<string, AgentStats>()

  for (const escrow of allCreated) {
    const sellerWallet = escrow.seller.toLowerCase()

    if (!agentStats.has(sellerWallet)) {
      agentStats.set(sellerWallet, {
        wallet: sellerWallet,
        transactionCount: 0,
        released: 0,
        refunded: 0,
        disputed: 0,
        totalVolume: BigInt(0),
      })
    }

    const stats = agentStats.get(sellerWallet)!
    stats.transactionCount++
    stats.totalVolume += escrow.amount

    if (releasedMap.has(escrow.escrowId)) {
      stats.released++
    } else if (refundedMap.has(escrow.escrowId)) {
      stats.refunded++
    }

    if (disputedMap.has(escrow.escrowId)) {
      stats.disputed++
    }
  }

  console.log(`  Found ${agentStats.size} unique seller wallets`)
  console.log('')

  let reputationUpdated = 0

  for (const [wallet, stats] of agentStats) {
    // Find agent by wallet
    const { data: agent } = await supabase
      .from('agents')
      .select('id')
      .eq('wallet_address', wallet)
      .single()

    if (!agent) {
      console.log(`  Skipping ${wallet.slice(0, 10)}... (no agent record)`)
      continue
    }

    const successRate = stats.transactionCount > 0
      ? stats.released / stats.transactionCount
      : 0

    const disputeRate = stats.transactionCount > 0
      ? stats.disputed / stats.transactionCount
      : 0

    // Calculate tier
    let tier = 'NEW'
    if (stats.transactionCount >= 50 && successRate >= 0.95 && disputeRate < 0.02) {
      tier = 'TRUSTED'
    } else if (stats.transactionCount >= 20 && successRate >= 0.90) {
      tier = 'RELIABLE'
    } else if (stats.transactionCount >= 5) {
      tier = 'STANDARD'
    }

    // Calculate score (simplified)
    const score = Math.round(successRate * 100 * 0.7 + Math.min(stats.transactionCount, 50) * 0.6)

    if (!dryRun) {
      await supabase
        .from('agents')
        .update({
          reputation_score: score,
          reputation_tier: tier,
          reputation_transactions: stats.transactionCount,
          reputation_success_rate: Math.round(successRate * 100),
          reputation_updated_at: new Date().toISOString(),
        })
        .eq('id', agent.id)
    }

    reputationUpdated++
    console.log(`  ${wallet.slice(0, 10)}... txs=${stats.transactionCount} success=${(successRate * 100).toFixed(1)}% tier=${tier}`)
  }

  console.log('')
  console.log(`  Reputation updated: ${reputationUpdated} agents`)
  console.log('')

  // ========== STEP 4: Summary ==========
  console.log('═'.repeat(60))
  console.log('RECOVERY SUMMARY')
  console.log('═'.repeat(60))
  console.log('')
  console.log(`  Escrows scanned: ${allCreated.length}`)
  console.log(`  Transactions created: ${created}`)
  console.log(`  Transactions updated: ${updated}`)
  console.log(`  Agents updated: ${reputationUpdated}`)
  console.log('')

  if (dryRun) {
    console.log('⚠️  DRY RUN - No changes were made')
    console.log('   Run without --dry-run to apply changes')
  } else {
    console.log('✅ Recovery complete!')
    console.log('')
    console.log('Next steps:')
    console.log('  1. Verify data in Supabase dashboard')
    console.log('  2. Run /api/cron/reputation-cache to refresh caches')
    console.log('  3. Check /api/agents/[id]/reputation/verify for a few agents')
  }
}

main().catch(err => {
  console.error('')
  console.error('Fatal error:', err)
  process.exit(1)
})
