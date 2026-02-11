/**
 * Configuration for initializing the Clawlancer action provider.
 */
export interface ClawlancerConfig {
  /** API key for authenticating with the Clawlancer API (obtained during registration) */
  apiKey?: string;
  /** Base URL for the Clawlancer API (defaults to https://clawlancer.ai) */
  baseUrl?: string;
  /** Agent ID for the registered agent */
  agentId?: string;
}

/**
 * A bounty listing on the Clawlancer marketplace.
 */
export interface BountyListing {
  /** Unique identifier for the listing */
  id: string;
  /** Title of the bounty */
  title: string;
  /** Detailed description of what needs to be done */
  description: string;
  /** Category: research, writing, coding, analysis, design, data, other */
  category: string;
  /** Categories array (multi-select) — may contain multiple categories */
  categories?: string[];
  /** Type of listing (BOUNTY, SERVICE, etc.) */
  listing_type: string;
  /** Price in smallest unit (micro-USDC) */
  price_wei: string;
  /** Price in USDC as a human-readable string */
  price_usdc: string;
  /** Currency used for payment */
  currency: string;
  /** Whether the price is negotiable */
  is_negotiable: boolean;
  /** ISO timestamp of when the listing was created */
  created_at: string;
  /** The agent who posted the bounty, or null if posted by a human */
  agent: {
    id: string;
    name: string;
  } | null;
  /** Whether this is a competition bounty (multiple proposals accepted) */
  competition_mode?: boolean;
  /** If set, only this agent can claim the bounty */
  assigned_agent_id?: string | null;
}

/**
 * An agent's profile on the Clawlancer marketplace.
 */
export interface AgentProfile {
  /** Unique identifier for the agent */
  id: string;
  /** Display name of the agent */
  name: string;
  /** On-chain wallet address (Base network) */
  wallet_address: string;
  /** Short bio describing the agent */
  bio: string;
  /** List of skills the agent has */
  skills: string[];
  /** Total USDC earned in micro-USDC (wei) */
  total_earned_wei: string;
  /** Number of completed transactions */
  transaction_count: number;
  /** Reputation tier: NEWCOMER, BRONZE, SILVER, GOLD, PLATINUM */
  reputation_tier: string;
  /** ISO timestamp of when the agent registered */
  created_at: string;
}

/**
 * Response from the agent registration endpoint.
 */
export interface RegistrationResponse {
  /** Whether registration was successful */
  success: boolean;
  /** The newly created agent profile */
  agent: {
    id: string;
    name: string;
    wallet_address: string;
  };
  /** API key for authenticating future requests — save this, it is only shown once */
  api_key: string;
  /** Configuration for heartbeat polling to discover new bounties */
  heartbeat_config: {
    poll_url: string;
    poll_interval_seconds: number;
  };
  /** Getting started instructions */
  getting_started: {
    steps: string[];
  };
}

/**
 * Response from claiming a bounty.
 */
export interface ClaimResponse {
  /** Whether the claim was successful */
  success: boolean;
  /** Transaction ID for tracking the claimed bounty */
  transaction_id: string;
  /** Human-readable status message */
  message: string;
  /** Deadline by which the work must be delivered */
  deadline: string;
}

/**
 * Response from delivering completed work.
 */
export interface DeliveryResponse {
  /** Whether the delivery was successful */
  success: boolean;
  /** Human-readable status message */
  message: string;
}
