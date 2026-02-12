import { NextRequest, NextResponse } from "next/server";
import { validateAdminKey } from "@/lib/security";
import { getSupabase } from "@/lib/supabase";
import {
  getNextVmNumber,
  formatVmName,
  getSnapshotUserData,
  HETZNER_DEFAULTS,
} from "@/lib/hetzner";
import {
  getProvider,
  getAvailableProvider,
} from "@/lib/providers";
import type { CloudProvider } from "@/lib/providers";
import { logger } from "@/lib/logger";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!validateAdminKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { count, provider: requestedProvider } = await req.json();
  if (!count || typeof count !== "number" || count < 1 || count > 10) {
    return NextResponse.json(
      { error: "count must be a number between 1 and 10" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  // Get existing VM names for numbering
  const { data: existingVms } = await supabase
    .from("instaclaw_vms")
    .select("name")
    .order("created_at", { ascending: false })
    .limit(200);

  const existingNames = (existingVms ?? []).map(
    (v: { name: string | null }) => v.name
  );
  const startNum = getNextVmNumber(existingNames);

  // Resolve provider
  let provider: CloudProvider;
  try {
    provider = requestedProvider
      ? getProvider(requestedProvider)
      : getAvailableProvider();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Provider unavailable" },
      { status: 400 }
    );
  }

  const isSnapshot =
    provider.name === "hetzner" && !!process.env.HETZNER_SNAPSHOT_ID;

  const results: {
    id: string;
    name: string;
    ip: string;
    provider_server_id: string;
    provider: string;
    status: string;
  }[] = [];
  const errors: { name: string; error: string }[] = [];

  for (let i = 0; i < count; i++) {
    const vmName = formatVmName(startNum + i);

    try {
      const created = await provider.createServer({ name: vmName });

      // Wait for IP
      const ready = await provider.waitForServer(created.providerId);

      // Insert into Supabase
      const vmStatus = isSnapshot ? "ready" : "provisioning";
      const { data: vm, error } = await supabase
        .from("instaclaw_vms")
        .insert({
          ip_address: ready.ip,
          name: vmName,
          provider_server_id: ready.providerId,
          provider: provider.name,
          ssh_port: 22,
          ssh_user: "openclaw",
          status: vmStatus,
          region: ready.region,
          server_type: ready.serverType,
        })
        .select()
        .single();

      if (error) {
        errors.push({ name: vmName, error: error.message });
        continue;
      }

      results.push({
        id: vm.id,
        name: vmName,
        ip: ready.ip,
        provider_server_id: ready.providerId,
        provider: provider.name,
        status: vmStatus,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      logger.error("Failed to create VM", { error: msg, route: "admin/provision", vmName, provider: provider.name });

      // Auto-fallback: if Hetzner fails with limit error and DO is available, try DO
      if (
        provider.name === "hetzner" &&
        msg.includes("limit") &&
        !requestedProvider
      ) {
        try {
          const fallback = getProvider("digitalocean");
          logger.info("Falling back to DigitalOcean", { route: "admin/provision", vmName });

          const created = await fallback.createServer({ name: vmName });
          const ready = await fallback.waitForServer(created.providerId);

          const { data: vm, error } = await supabase
            .from("instaclaw_vms")
            .insert({
              ip_address: ready.ip,
              name: vmName,
              provider_server_id: ready.providerId,
              provider: "digitalocean",
              ssh_port: 22,
              ssh_user: "openclaw",
              status: "provisioning",
              region: ready.region,
              server_type: ready.serverType,
            })
            .select()
            .single();

          if (!error && vm) {
            results.push({
              id: vm.id,
              name: vmName,
              ip: ready.ip,
              provider_server_id: ready.providerId,
              provider: "digitalocean",
              status: "provisioning",
            });
            // Switch provider for remaining iterations
            provider = fallback;
            continue;
          }
        } catch (fallbackErr) {
          logger.error("DO fallback also failed", {
            error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
            route: "admin/provision",
            vmName,
          });
        }
      }

      errors.push({ name: vmName, error: msg });
    }
  }

  return NextResponse.json({
    provisioned: results,
    errors: errors.length > 0 ? errors : undefined,
    provider: provider.name,
    mode: isSnapshot ? "snapshot" : "fresh",
    note: isSnapshot
      ? "VMs created from snapshot with cloud-init personalization. Status: ready."
      : 'VMs are in "provisioning" status. Cloud-init is installing OpenClaw — the cloud-init-poll cron will flip to "ready" when done.',
  });
}
