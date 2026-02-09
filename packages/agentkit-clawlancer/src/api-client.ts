import { ClawlancerConfig } from "./types";

/**
 * HTTP client for the Clawlancer marketplace API.
 *
 * Handles authentication, request formatting, and error handling
 * for all Clawlancer API endpoints.
 */
export class ClawlancerApiClient {
  private baseUrl: string;
  private apiKey: string | null;
  private agentId: string | null;

  constructor(config: ClawlancerConfig = {}) {
    this.baseUrl = config.baseUrl || "https://clawlancer.ai";
    this.apiKey = config.apiKey || null;
    this.agentId = config.agentId || null;
  }

  /**
   * Set credentials after registration. Called automatically when
   * the register action returns an API key.
   */
  setCredentials(apiKey: string, agentId: string): void {
    this.apiKey = apiKey;
    this.agentId = agentId;
  }

  /**
   * Make an authenticated HTTP request to the Clawlancer API.
   */
  private async request(
    method: string,
    path: string,
    body?: any
  ): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const error = await res
        .json()
        .catch(() => ({ error: res.statusText }));
      throw new Error(
        `Clawlancer API error (${res.status}): ${error.error || res.statusText}`
      );
    }

    return res.json();
  }

  /**
   * Register a new agent on the Clawlancer marketplace.
   */
  async register(data: any): Promise<any> {
    return this.request("POST", "/api/agents/register", data);
  }

  /**
   * Browse available bounties with optional filters.
   */
  async browseBounties(params: Record<string, string>): Promise<any> {
    const qs = new URLSearchParams(params).toString();
    return this.request("GET", `/api/listings?listing_type=BOUNTY&${qs}`);
  }

  /**
   * Claim a bounty to start working on it.
   */
  async claimBounty(bountyId: string): Promise<any> {
    return this.request("POST", `/api/listings/${bountyId}/claim`, {
      agent_id: this.agentId,
    });
  }

  /**
   * Submit completed work for a claimed bounty.
   */
  async deliverWork(
    transactionId: string,
    deliverable: string,
    url?: string
  ): Promise<any> {
    return this.request(
      "POST",
      `/api/transactions/${transactionId}/deliver`,
      {
        deliverable,
        deliverable_url: url,
      }
    );
  }

  /**
   * Get an agent's profile by ID.
   */
  async getAgent(agentId: string): Promise<any> {
    return this.request("GET", `/api/agents/${agentId}`);
  }

  /**
   * Get a listing by ID.
   */
  async getListing(listingId: string): Promise<any> {
    return this.request("GET", `/api/listings/${listingId}`);
  }

  /**
   * Update the authenticated agent's own profile.
   */
  async updateAgent(_agentId: string, data: any): Promise<any> {
    return this.request("PATCH", `/api/agents/me`, data);
  }

  /**
   * Whether the client has API credentials set.
   */
  get isAuthenticated(): boolean {
    return !!this.apiKey;
  }

  /**
   * The currently authenticated agent's ID, or null.
   */
  get currentAgentId(): string | null {
    return this.agentId;
  }
}
