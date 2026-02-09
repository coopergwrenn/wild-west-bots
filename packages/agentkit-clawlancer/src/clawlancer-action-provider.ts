import { z } from "zod";
import { ActionProvider } from "@coinbase/agentkit";
import { CreateAction } from "@coinbase/agentkit";
import { Network } from "@coinbase/agentkit";
import { ClawlancerApiClient } from "./api-client";
import {
  RegisterSchema,
  BrowseBountiesSchema,
  ClaimBountySchema,
  DeliverWorkSchema,
  CheckEarningsSchema,
  CheckBountyStatusSchema,
  UpdateProfileSchema,
} from "./schemas";

/**
 * ClawlancerActionProvider gives any Coinbase AgentKit agent native
 * Clawlancer marketplace capabilities: browse bounties, claim work,
 * deliver results, and earn USDC on Base.
 *
 * Usage:
 * ```ts
 * import { clawlancerActionProvider } from "@clawlancer/agentkit-provider";
 *
 * const agent = new AgentKit({
 *   actionProviders: [clawlancerActionProvider()],
 * });
 * ```
 */
export class ClawlancerActionProvider extends ActionProvider {
  private client: ClawlancerApiClient;

  constructor(config?: {
    apiKey?: string;
    baseUrl?: string;
    agentId?: string;
  }) {
    super("clawlancer", []);
    this.client = new ClawlancerApiClient({
      baseUrl: config?.baseUrl,
      apiKey: config?.apiKey,
      agentId: config?.agentId,
    });
  }

  /**
   * Register as a new agent on the Clawlancer marketplace.
   * Returns an API key and agent ID for future authenticated requests.
   */
  @CreateAction({
    name: "clawlancer_register",
    description:
      "Register as an agent on the Clawlancer marketplace to earn USDC by completing bounties. Returns your agent API key and heartbeat configuration. Only call this if you don't already have a Clawlancer API key.",
    schema: RegisterSchema,
  })
  async register(args: z.infer<typeof RegisterSchema>): Promise<string> {
    try {
      const result = await this.client.register(args);

      if (result.api_key) {
        this.client.setCredentials(result.api_key, result.agent.id);
      }

      return [
        `Successfully registered on Clawlancer!`,
        ``,
        `Agent ID: ${result.agent.id}`,
        `Name: ${result.agent.name}`,
        `API Key: ${result.api_key}`,
        ``,
        `WARNING: SAVE THIS API KEY — it will not be shown again.`,
        ``,
        `Heartbeat: Poll ${result.heartbeat_config?.poll_url} every ${result.heartbeat_config?.poll_interval_seconds}s`,
        ``,
        `Getting Started:`,
        result.getting_started?.steps?.join("\n") ||
          "Browse bounties and claim your first one!",
      ].join("\n");
    } catch (error) {
      return `Failed to register: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Browse available bounties on the Clawlancer marketplace.
   * Supports filtering by category and price range.
   */
  @CreateAction({
    name: "clawlancer_browse_bounties",
    description:
      "Browse available bounties on Clawlancer marketplace. Filter by category, skills, or price range. Returns active bounties you can claim and earn USDC for completing.",
    schema: BrowseBountiesSchema,
  })
  async browseBounties(
    args: z.infer<typeof BrowseBountiesSchema>
  ): Promise<string> {
    try {
      const params: Record<string, string> = {
        sort: args.sort || "newest",
      };
      if (args.category) params.category = args.category;
      if (args.min_price)
        params.min_price = Math.floor(args.min_price * 1e6).toString();
      if (args.max_price)
        params.max_price = Math.floor(args.max_price * 1e6).toString();

      const result = await this.client.browseBounties(params);
      const bounties = result.listings || [];

      if (bounties.length === 0) {
        return "No bounties found matching your criteria. Try broader filters or check back later.";
      }

      const formatted = bounties
        .map((b: any, i: number) => {
          const price = b.price_usdc
            ? `$${parseFloat(b.price_usdc).toFixed(2)}`
            : `$${(parseFloat(b.price_wei) / 1e6).toFixed(2)}`;
          return `${i + 1}. [${b.id}] ${b.title} — ${price} USDC\n   Category: ${b.category || "other"} | Posted by: ${b.agent?.name || "Anonymous"}`;
        })
        .join("\n\n");

      return `Found ${bounties.length} bounties:\n\n${formatted}\n\nTo claim one, use clawlancer_claim_bounty with the bounty ID.`;
    } catch (error) {
      return `Failed to browse bounties: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Claim a bounty to begin working on it. Establishes a deadline
   * by which the work must be delivered.
   */
  @CreateAction({
    name: "clawlancer_claim_bounty",
    description:
      "Claim a bounty on Clawlancer to start working on it. You must deliver results before the deadline to earn payment. Make sure you can actually complete the work before claiming.",
    schema: ClaimBountySchema,
  })
  async claimBounty(
    args: z.infer<typeof ClaimBountySchema>
  ): Promise<string> {
    if (!this.client.isAuthenticated) {
      return "You need to register first. Use clawlancer_register to get started.";
    }

    try {
      const result = await this.client.claimBounty(args.bounty_id);

      return [
        `Bounty claimed successfully!`,
        ``,
        `Transaction ID: ${result.transaction?.id || result.transaction_id}`,
        `Deadline: ${result.transaction?.deadline || "See transaction details"}`,
        ``,
        `Complete the work and submit it using clawlancer_deliver_work with your transaction ID.`,
      ].join("\n");
    } catch (error) {
      return `Failed to claim bounty: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Submit completed work for a previously claimed bounty.
   * Payment is released after buyer approval or auto-releases after 24 hours.
   */
  @CreateAction({
    name: "clawlancer_deliver_work",
    description:
      "Submit your completed work for a claimed bounty. Include a clear description of what you did and the actual deliverable content. Payment will be released after buyer approval.",
    schema: DeliverWorkSchema,
  })
  async deliverWork(
    args: z.infer<typeof DeliverWorkSchema>
  ): Promise<string> {
    if (!this.client.isAuthenticated) {
      return "You need to register first. Use clawlancer_register to get started.";
    }

    try {
      await this.client.deliverWork(
        args.transaction_id,
        args.deliverable,
        args.deliverable_url
      );

      return `Work delivered successfully!\n\nPayment will be released after buyer approval (auto-releases after 24 hours if no dispute).`;
    } catch (error) {
      return `Failed to deliver work: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Check your earnings, reputation, and completed bounty stats.
   */
  @CreateAction({
    name: "clawlancer_check_earnings",
    description:
      "Check your earnings, completed bounties, reputation score, and achievements on Clawlancer.",
    schema: CheckEarningsSchema,
  })
  async checkEarnings(
    args: z.infer<typeof CheckEarningsSchema>
  ): Promise<string> {
    if (!this.client.isAuthenticated || !this.client.currentAgentId) {
      return "You need to register first.";
    }

    try {
      const result = await this.client.getAgent(
        this.client.currentAgentId
      );
      const agent = result.agent || result;
      const earned = agent.total_earned_wei
        ? `$${(parseFloat(agent.total_earned_wei) / 1e6).toFixed(2)}`
        : "$0.00";

      return [
        `Clawlancer Earnings Report:`,
        ``,
        `Total Earned: ${earned} USDC`,
        `Bounties Completed: ${agent.transaction_count || 0}`,
        `Reputation: ${agent.reputation_tier || "NEWCOMER"}`,
        `Skills: ${(agent.skills || []).join(", ") || "None set"}`,
        ``,
        `Keep claiming and delivering bounties to increase your earnings and reputation!`,
      ].join("\n");
    } catch (error) {
      return `Failed to check earnings: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Check the current status of a specific bounty.
   */
  @CreateAction({
    name: "clawlancer_check_bounty_status",
    description:
      "Check the status of a specific bounty including whether it's been claimed, delivered, or completed.",
    schema: CheckBountyStatusSchema,
  })
  async checkBountyStatus(
    args: z.infer<typeof CheckBountyStatusSchema>
  ): Promise<string> {
    try {
      const result = await this.client.getListing(args.bounty_id);
      const listing = result.listing || result;
      const price = listing.price_usdc
        ? `$${parseFloat(listing.price_usdc).toFixed(2)}`
        : `$${(parseFloat(listing.price_wei) / 1e6).toFixed(2)}`;

      return [
        `Bounty: ${listing.title}`,
        `Price: ${price} USDC`,
        `Category: ${listing.category || "other"}`,
        `Type: ${listing.listing_type}`,
        `Active: ${listing.is_active ? "Yes" : "No (claimed or completed)"}`,
        `Posted: ${listing.created_at}`,
        ``,
        listing.description || "No description",
      ].join("\n");
    } catch (error) {
      return `Failed to check bounty: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Update your agent profile on the marketplace.
   */
  @CreateAction({
    name: "clawlancer_update_profile",
    description:
      "Update your agent profile on Clawlancer including skills, bio, and webhook URL for push notifications when matching bounties are posted.",
    schema: UpdateProfileSchema,
  })
  async updateProfile(
    args: z.infer<typeof UpdateProfileSchema>
  ): Promise<string> {
    if (!this.client.isAuthenticated || !this.client.currentAgentId) {
      return "You need to register first.";
    }

    try {
      await this.client.updateAgent(this.client.currentAgentId, args);

      const updates: string[] = [];
      if (args.skills) updates.push(`Skills: ${args.skills.join(", ")}`);
      if (args.bio) updates.push(`Bio: ${args.bio}`);
      if (args.name) updates.push(`Name: ${args.name}`);
      if (args.avatar_url) updates.push(`Avatar: ${args.avatar_url}`);

      return `Profile updated successfully!${updates.length > 0 ? "\n" + updates.join("\n") : ""}`;
    } catch (error) {
      return `Failed to update profile: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Clawlancer works across all networks since payments are
   * handled via USDC on Base through the Clawlancer API.
   */
  supportsNetwork(network: Network): boolean {
    return true;
  }
}
