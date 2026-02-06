const HETZNER_BASE = "https://api.hetzner.cloud/v1";

function getToken(): string {
  const token = process.env.HETZNER_API_TOKEN;
  if (!token) throw new Error("HETZNER_API_TOKEN not set");
  return token;
}

async function hetznerFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${HETZNER_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Hetzner API ${res.status}: ${body}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export async function getSSHKeyId(name: string): Promise<number> {
  const data = await hetznerFetch("/ssh_keys");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const key = data.ssh_keys.find((k: any) => k.name === name);
  if (!key) throw new Error(`SSH key "${name}" not found in Hetzner`);
  return key.id;
}

export async function getFirewallId(name: string): Promise<number> {
  const data = await hetznerFetch("/firewalls");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fw = data.firewalls.find((f: any) => f.name === name);
  if (!fw) throw new Error(`Firewall "${name}" not found in Hetzner`);
  return fw.id;
}

// ---------------------------------------------------------------------------
// Server management
// ---------------------------------------------------------------------------

export interface HetznerServer {
  id: number;
  name: string;
  status: string;
  public_net: {
    ipv4: { ip: string };
  };
}

interface CreateServerOptions {
  name: string;
  serverType?: string;
  image?: string;
  location?: string;
  sshKeyId: number;
  firewallId: number;
}

export async function createServer(
  opts: CreateServerOptions
): Promise<HetznerServer> {
  const data = await hetznerFetch("/servers", {
    method: "POST",
    body: JSON.stringify({
      name: opts.name,
      server_type: opts.serverType ?? "cpx21",
      image: opts.image ?? "ubuntu-24.04",
      location: opts.location ?? "ash",
      ssh_keys: [opts.sshKeyId],
      firewalls: [{ firewall: opts.firewallId }],
    }),
  });
  return data.server;
}

export async function waitForServer(
  serverId: number,
  timeoutMs = 120_000
): Promise<HetznerServer> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const data = await hetznerFetch(`/servers/${serverId}`);
    if (data.server.status === "running") return data.server;
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(
    `Server ${serverId} did not become ready within ${timeoutMs / 1000}s`
  );
}

export async function deleteServer(serverId: number): Promise<void> {
  await hetznerFetch(`/servers/${serverId}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const HETZNER_DEFAULTS = {
  sshKeyName: "instaclaw-deploy",
  firewallName: "instaclaw-firewall",
  serverType: "cpx21",
  image: "ubuntu-24.04",
  location: "ash",
  region: "us-east",
} as const;

/**
 * Resolve SSH key ID and firewall ID from Hetzner by name.
 * Caches nothing — call once per request batch.
 */
export async function resolveHetznerIds() {
  const [sshKeyId, firewallId] = await Promise.all([
    getSSHKeyId(HETZNER_DEFAULTS.sshKeyName),
    getFirewallId(HETZNER_DEFAULTS.firewallName),
  ]);
  return { sshKeyId, firewallId };
}

/**
 * Get the next VM name based on existing names in Supabase.
 * Returns the numeric suffix to start from.
 */
export function getNextVmNumber(
  existingNames: (string | null)[],
  offset = 0
): number {
  let maxNum = 0;
  for (const name of existingNames) {
    const match = name?.match(/instaclaw-vm-(\d+)/);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
  }
  return maxNum + 1 + offset;
}

export function formatVmName(num: number): string {
  return `instaclaw-vm-${String(num).padStart(2, "0")}`;
}
