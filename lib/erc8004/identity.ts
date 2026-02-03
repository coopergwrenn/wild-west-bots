/**
 * ERC-8004 Identity Helpers
 *
 * Per PRD Section 4 & 11 - Local-first identity storage in ERC-8004 format
 * Stores identity data locally, ready for future on-chain migration
 */

import { createClient } from '@supabase/supabase-js';
import { keccak256, toHex } from 'viem';

// ERC-8004 Identity Schema (local storage format)
export interface ERC8004Identity {
  name: string;
  description: string;
  image: string; // URL to agent card image
  external_url?: string;
  attributes: {
    trait_type: string;
    value: string | number;
  }[];
  properties: {
    wallet_address: string;
    created_at: string;
    updated_at: string;
    category?: string;
    capabilities?: string[];
  };
}

// ERC-8004 Registration status
export interface ERC8004Registration {
  agent_id: string;
  token_id?: string;
  chain: 'local' | 'base' | 'ethereum';
  tx_hash?: string;
  registered_at: string;
  identity: ERC8004Identity;
}

/**
 * Build ERC-8004 compliant identity JSON for an agent
 */
export function buildERC8004Identity(agent: {
  id: string;
  name: string;
  description?: string;
  wallet_address: string;
  category?: string;
  capabilities?: string[];
  created_at: string;
  updated_at?: string;
  reputation_score?: number;
  reputation_tier?: string;
}): ERC8004Identity {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://wildwestbots.com';

  return {
    name: agent.name,
    description: agent.description || `${agent.name} - A Wild West Bot agent`,
    image: `${baseUrl}/api/agents/${agent.id}/card`,
    external_url: `${baseUrl}/agents/${agent.id}`,
    attributes: [
      { trait_type: 'Reputation Score', value: agent.reputation_score || 0 },
      { trait_type: 'Reputation Tier', value: agent.reputation_tier || 'new' },
      { trait_type: 'Category', value: agent.category || 'general' },
    ],
    properties: {
      wallet_address: agent.wallet_address,
      created_at: agent.created_at,
      updated_at: agent.updated_at || agent.created_at,
      category: agent.category,
      capabilities: agent.capabilities || [],
    },
  };
}

/**
 * Generate a deterministic token ID for local storage
 * Uses keccak256 hash of wallet address
 */
export function generateLocalTokenId(walletAddress: string): string {
  const hash = keccak256(toHex(walletAddress.toLowerCase()));
  // Return first 20 characters as a pseudo-token-id
  return hash.slice(0, 42);
}

/**
 * Store ERC-8004 registration in database (local-first)
 */
export async function storeERC8004Registration(
  supabase: ReturnType<typeof createClient>,
  agentId: string,
  identity: ERC8004Identity
): Promise<ERC8004Registration> {
  const tokenId = generateLocalTokenId(identity.properties.wallet_address);

  const registration: ERC8004Registration = {
    agent_id: agentId,
    token_id: tokenId,
    chain: 'local',
    registered_at: new Date().toISOString(),
    identity,
  };

  // Update agent record with ERC-8004 data
  await supabase
    .from('agents')
    .update({
      erc8004_registration: registration.identity,
      erc8004_token_id: tokenId,
      erc8004_registered_at: registration.registered_at,
      erc8004_chain: 'local',
    })
    .eq('id', agentId);

  return registration;
}

/**
 * Get ERC-8004 registration for an agent
 */
export async function getERC8004Registration(
  supabase: ReturnType<typeof createClient>,
  agentId: string
): Promise<ERC8004Registration | null> {
  const { data: agent } = await supabase
    .from('agents')
    .select('id, erc8004_registration, erc8004_token_id, erc8004_registered_at, erc8004_chain, erc8004_tx_hash')
    .eq('id', agentId)
    .single();

  if (!agent || !agent.erc8004_registration) {
    return null;
  }

  return {
    agent_id: agent.id,
    token_id: agent.erc8004_token_id,
    chain: agent.erc8004_chain || 'local',
    tx_hash: agent.erc8004_tx_hash,
    registered_at: agent.erc8004_registered_at,
    identity: agent.erc8004_registration as ERC8004Identity,
  };
}

/**
 * Update ERC-8004 identity (e.g., after reputation changes)
 */
export async function updateERC8004Identity(
  supabase: ReturnType<typeof createClient>,
  agentId: string,
  updates: Partial<ERC8004Identity>
): Promise<void> {
  const { data: agent } = await supabase
    .from('agents')
    .select('erc8004_registration')
    .eq('id', agentId)
    .single();

  if (!agent || !agent.erc8004_registration) {
    throw new Error('Agent has no ERC-8004 registration');
  }

  const currentIdentity = agent.erc8004_registration as ERC8004Identity;
  const updatedIdentity = {
    ...currentIdentity,
    ...updates,
    properties: {
      ...currentIdentity.properties,
      ...(updates.properties || {}),
      updated_at: new Date().toISOString(),
    },
  };

  await supabase
    .from('agents')
    .update({
      erc8004_registration: updatedIdentity,
    })
    .eq('id', agentId);
}

/**
 * Check if agent has ERC-8004 registration
 */
export async function hasERC8004Registration(
  supabase: ReturnType<typeof createClient>,
  agentId: string
): Promise<boolean> {
  const { data: agent } = await supabase
    .from('agents')
    .select('erc8004_registered_at')
    .eq('id', agentId)
    .single();

  return !!agent?.erc8004_registered_at;
}

/**
 * Format identity for API response
 */
export function formatIdentityResponse(registration: ERC8004Registration) {
  return {
    token_id: registration.token_id,
    chain: registration.chain,
    tx_hash: registration.tx_hash,
    registered_at: registration.registered_at,
    metadata: registration.identity,
    migration_status: registration.chain === 'local'
      ? 'pending_migration'
      : 'on_chain',
  };
}
