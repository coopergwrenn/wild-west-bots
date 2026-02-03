/**
 * Oracle Release Logic
 *
 * Per PRD Section 5 & 11 - Handles auto-release after dispute window
 * All releases are ON-CHAIN and VERIFIABLE via tx_hash
 */

import { createPublicClient, createWalletClient, http, type Hash } from 'viem';
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

export interface ReleaseResult {
  success: boolean;
  txHash?: string;
  alreadyReleased?: boolean;
  error?: string;
}

/**
 * Check if an escrow is ready for auto-release
 * (dispute window passed, not disputed)
 */
export async function isReadyForRelease(escrowId: string): Promise<boolean> {
  const publicClient = getPublicClient();
  const bytes32Id = uuidToBytes32(escrowId);

  try {
    const isReady = await publicClient.readContract({
      address: ESCROW_V2_ADDRESS,
      abi: ESCROW_V2_ABI,
      functionName: 'isAutoReleaseReady',
      args: [bytes32Id],
    });

    return isReady;
  } catch (error) {
    console.error(`Error checking release readiness for ${escrowId}:`, error);
    return false;
  }
}

/**
 * Execute oracle release (auto-release after dispute window)
 * Idempotent - safe to retry
 */
export async function executeRelease(escrowId: string): Promise<ReleaseResult> {
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

    // Already released
    if (escrow.state === EscrowStateV2.RELEASED) {
      return { success: true, alreadyReleased: true };
    }

    // Already refunded - can't release
    if (escrow.state === EscrowStateV2.REFUNDED) {
      return { success: false, error: 'Escrow already refunded' };
    }

    // Check if disputed
    if (escrow.disputed) {
      return { success: false, error: 'Escrow is disputed - use resolveDispute instead' };
    }

    // Check if ready (delivered + dispute window passed)
    const isReady = await isReadyForRelease(escrowId);
    if (!isReady && escrow.state !== EscrowStateV2.FUNDED) {
      // FUNDED can be released early by buyer, DELIVERED needs window check
      return { success: false, error: 'Escrow not ready for release' };
    }

    // Execute release with retry
    const walletClient = getOracleWalletClient();

    const result = await executeWithRetry(
      async () => {
        const hash = await walletClient.writeContract({
          address: ESCROW_V2_ADDRESS,
          abi: ESCROW_V2_ABI,
          functionName: 'release',
          args: [bytes32Id],
        });

        await publicClient.waitForTransactionReceipt({ hash });
        return hash;
      },
      `release(${escrowId})`
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
 * Get all escrows ready for auto-release
 */
export async function getEscrowsReadyForRelease(escrowIds: string[]): Promise<string[]> {
  const ready: string[] = [];

  for (const escrowId of escrowIds) {
    const isReady = await isReadyForRelease(escrowId);
    if (isReady) {
      ready.push(escrowId);
    }
  }

  return ready;
}

/**
 * Batch release multiple escrows
 * Returns results for each escrow
 */
export async function batchRelease(
  escrowIds: string[]
): Promise<Map<string, ReleaseResult>> {
  const results = new Map<string, ReleaseResult>();

  for (const escrowId of escrowIds) {
    const result = await executeRelease(escrowId);
    results.set(escrowId, result);

    // Small delay between transactions to avoid nonce issues
    if (result.success && !result.alreadyReleased) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}
