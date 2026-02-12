import type { CloudProvider } from "./types";
import { hetznerProvider } from "./hetzner";
import { digitalOceanProvider } from "./digitalocean";

export type { CloudProvider, ServerConfig, ServerResult } from "./types";

const PROVIDERS: CloudProvider[] = [hetznerProvider, digitalOceanProvider];

export function getProvider(name: "hetzner" | "digitalocean"): CloudProvider {
  const provider = PROVIDERS.find((p) => p.name === name);
  if (!provider) throw new Error(`Unknown provider: ${name}`);
  if (!provider.isConfigured())
    throw new Error(`Provider ${name} is not configured (missing API token)`);
  return provider;
}

/**
 * Returns the first configured provider (hetzner preferred, digitalocean fallback).
 */
export function getAvailableProvider(): CloudProvider {
  const provider = PROVIDERS.find((p) => p.isConfigured());
  if (!provider)
    throw new Error("No cloud provider configured. Set HETZNER_API_TOKEN or DIGITALOCEAN_API_TOKEN.");
  return provider;
}

/**
 * Returns all configured providers.
 */
export function getAllProviders(): CloudProvider[] {
  return PROVIDERS.filter((p) => p.isConfigured());
}
