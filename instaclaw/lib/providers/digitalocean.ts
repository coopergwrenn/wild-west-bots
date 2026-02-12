import { logger } from "../logger";
import type { CloudProvider, ServerConfig, ServerResult } from "./types";

const DO_BASE = "https://api.digitalocean.com/v2";

function getToken(): string {
  const token = process.env.DIGITALOCEAN_API_TOKEN;
  if (!token) throw new Error("DIGITALOCEAN_API_TOKEN not set");
  return token;
}

async function doFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${DO_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DigitalOcean API ${res.status}: ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

async function getSSHKeyFingerprint(name: string): Promise<string> {
  const data = await doFetch("/account/keys");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const key = data.ssh_keys.find((k: any) => k.name === name);
  if (!key)
    throw new Error(`SSH key "${name}" not found in DigitalOcean`);
  return key.fingerprint;
}

async function getFirewallId(name: string): Promise<string> {
  const data = await doFetch("/firewalls");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fw = data.firewalls.find((f: any) => f.name === name);
  if (!fw)
    throw new Error(`Firewall "${name}" not found in DigitalOcean`);
  return fw.id;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DO_DEFAULTS = {
  sshKeyName: "instaclaw",
  firewallName: "instaclaw-firewall",
  size: "s-2vcpu-4gb",
  image: "ubuntu-24-04-x64",
  region: "nyc1",
  tag: "instaclaw",
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDropletIPv4(
  droplet: { networks: { v4: { ip_address: string; type: string }[] } }
): string {
  const pub = droplet.networks.v4.find(
    (n: { type: string }) => n.type === "public"
  );
  return pub?.ip_address ?? "";
}

// ---------------------------------------------------------------------------
// CloudProvider implementation
// ---------------------------------------------------------------------------

export const digitalOceanProvider: CloudProvider = {
  name: "digitalocean",

  isConfigured(): boolean {
    return !!process.env.DIGITALOCEAN_API_TOKEN;
  },

  async createServer(config: ServerConfig): Promise<ServerResult> {
    const sshFingerprint = await getSSHKeyFingerprint(DO_DEFAULTS.sshKeyName);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: Record<string, any> = {
      name: config.name,
      region: DO_DEFAULTS.region,
      size: DO_DEFAULTS.size,
      image: DO_DEFAULTS.image,
      ssh_keys: [sshFingerprint],
      tags: [DO_DEFAULTS.tag],
    };

    if (config.userData) {
      body.user_data = config.userData;
    }

    const data = await doFetch("/droplets", {
      method: "POST",
      body: JSON.stringify(body),
    });

    const droplet = data.droplet;

    // Apply firewall via tag (DigitalOcean firewalls attach by tag)
    try {
      const firewallId = await getFirewallId(DO_DEFAULTS.firewallName);
      await doFetch(`/firewalls/${firewallId}/tags`, {
        method: "POST",
        body: JSON.stringify({ tags: [DO_DEFAULTS.tag] }),
      });
    } catch (err) {
      logger.warn("Failed to apply DO firewall (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return {
      providerId: String(droplet.id),
      provider: "digitalocean",
      ip: getDropletIPv4(droplet) || "",
      name: droplet.name,
      region: DO_DEFAULTS.region,
      serverType: DO_DEFAULTS.size,
      status: droplet.status,
    };
  },

  async waitForServer(
    providerId: string,
    timeoutMs = 120_000
  ): Promise<ServerResult> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const data = await doFetch(`/droplets/${providerId}`);
      const droplet = data.droplet;
      const ip = getDropletIPv4(droplet);

      if (droplet.status === "active" && ip) {
        return {
          providerId: String(droplet.id),
          provider: "digitalocean",
          ip,
          name: droplet.name,
          region: DO_DEFAULTS.region,
          serverType: DO_DEFAULTS.size,
          status: droplet.status,
        };
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
    throw new Error(
      `Droplet ${providerId} did not become active within ${timeoutMs / 1000}s`
    );
  },

  async deleteServer(providerId: string): Promise<void> {
    await doFetch(`/droplets/${providerId}`, { method: "DELETE" });
  },
};
