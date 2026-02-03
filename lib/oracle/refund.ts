/**
 * Oracle Refund Logic
 *
 * Per PRD Section 5 & 11 - Handles auto-refund after deadline
 * All refunds are ON-CHAIN and VERIFIABLE via tx_hash
 */

import { createPublicClient, createWalletClient, http } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { ESCROW_V2_ABI, ESCROW_V2_ADDRESS, uuidToBytes32, EscrowStateV2 } from '@/lib/blockchain/escrow-v2';
import { executeWithRetry } from './retry';

const isTestnet = process.env.NEXT_PUBLIC_CHAIN === 'sepolia';
const CHAIN = isTestnet ? baseSepolia : base;

function getPublicClient() {
  return createPublicClient({
    chain: CHAIN,
    transport: http(process.env.ALCHEMY_BASE_URL),
  });
}

function getOracleWalletClient() {
  const privateKey = process.env.ORACLE_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('ORACLE_PRIVATE_KEY not set');
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);

  return createWalletClient({
    account,
    chain: CHAIN,
    transport: http(process.env.ALCHEMY_BASE_URL),
  });
}

export interface RefundResult {
  success: boolean;
  txHash?: string;
  alreadyRefunded?: boolean;
  error?: string;
}

/**
 * Check if an escrow is ready for auto-refund
 * (deadline passed, not delivered)
 */
export async function isReadyForRefund(escrowId: string): Promise<boolean> {
  const publicClient = getPublicClient();
  const bytes32Id = uuidToBytes32(escrowId);

  try {
    const isReady = await publicClient.readContract({
      address: ESCROW_V2_ADDRESS,
      abi: ESCROW_V2_ABI,
      functionName: 'isRefundReady',
      args: [bytes32Id],
    });

    return isReady;
  } catch (error) {
    console.error(`Error checking refund readiness for ${escrowId}:`, error);
    return false;
  }
}

/**
 * Execute oracle refund (auto-refund after deadline)
 * Idempotent - safe to retry
 */
export async function executeRefund(escrowId: string): Promise<RefundResult> {
  const publicClient = getPublicClient();
  const bytes32Id = uuidToBytes32(escrowId);

  try {
    // First check current state (idempotency)
    const escrow = await publicClient.readContract({
      address: ESCROW_V2_ADDRESS,
      abi: ESCROW_V2_ABI,
      functionName: 'getEscrow',
      args: [bytes32Id],
    });

    // Already refunded
    if (escrow.state === EscrowStateV2.REFUNDED) {
      return { success: true, alreadyRefunded: true };
    }

    // Already released - can't refund
    if (escrow.state === EscrowStateV2.RELEASED) {
      return { success: false, error: 'Escrow already released' };
    }

    // If disputed, use resolveDispute instead
    if (escrow.disputed) {
      return { success: false, error: 'Escrow is disputed - use resolveDispute instead' };
    }

    // Check if ready (deadline passed, not delivered)
    const isReady = await isReadyForRefund(escrowId);
    if (!isReady) {
      return { success: false, error: 'Escrow not ready for refund - deadline not passed or already delivered' };
    }

    // Execute refund with retry
    const walletClient = getOracleWalletClient();

    const result = await executeWithRetry(
      async () => {
        const hash = await walletClient.writeContract({
          address: ESCROW_V2_ADDRESS,
          abi: ESCROW_V2_ABI,
          functionName: 'refund',
          args: [bytes32Id],
        });

        await publicClient.waitForTransactionReceipt({ hash });
        return hash;
      },
      `refund(${escrowId})`
    );

    if (result.success) {
      return { success: true, txHash: result.result };
    } else {
      return { success: false, error: result.lastError };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMsg };
  }
}

/**
 * Get all escrows ready for auto-refund
 */
export async function getEscrowsReadyForRefund(escrowIds: string[]): Promise<string[]> {
  const ready: string[] = [];

  for (const escrowId of escrowIds) {
    const isReady = await isReadyForRefund(escrowId);
    if (isReady) {
      ready.push(escrowId);
    }
  }

  return ready;
}

/**
 * Batch refund multiple escrows
 * Returns results for each escrow
 */
export async function batchRefund(
  escrowIds: string[]
): Promise<Map<string, RefundResult>> {
  const results = new Map<string, RefundResult>();

  for (const escrowId of escrowIds) {
    const result = await executeRefund(escrowId);
    results.set(escrowId, result);

    // Small delay between transactions to avoid nonce issues
    if (result.success && !result.alreadyRefunded) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}
