import { NextRequest, NextResponse } from "next/server";
import { validateAdminKey } from "@/lib/security";
import { getSupabase } from "@/lib/supabase";
import {
  createServer,
  waitForServer,
  resolveHetznerIds,
  getNextVmNumber,
  formatVmName,
  HETZNER_DEFAULTS,
} from "@/lib/hetzner";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!validateAdminKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { count } = await req.json();
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

  // Resolve Hetzner resource IDs
  const { sshKeyId, firewallId } = await resolveHetznerIds();

  const results: {
    id: string;
    name: string;
    ip: string;
    hetzner_server_id: number;
    status: string;
  }[] = [];
  const errors: { name: string; error: string }[] = [];

  for (let i = 0; i < count; i++) {
    const vmName = formatVmName(startNum + i);

    try {
      const server = await createServer({
        name: vmName,
        sshKeyId,
        firewallId,
      });

      // Wait for the server to get an IP
      const readyServer = await waitForServer(server.id);
      const ip = readyServer.public_net.ipv4.ip;

      // Insert into Supabase as "provisioning" (install script still needed)
      const { data: vm, error } = await supabase
        .from("instaclaw_vms")
        .insert({
          ip_address: ip,
          name: vmName,
          hetzner_server_id: String(server.id),
          ssh_port: 22,
          ssh_user: "root", // becomes "openclaw" after install-openclaw.sh
          status: "provisioning",
          region: HETZNER_DEFAULTS.region,
          server_type: HETZNER_DEFAULTS.serverType,
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
        ip,
        hetzner_server_id: server.id,
        status: "provisioning",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[provision] Failed to create ${vmName}:`, msg);
      errors.push({ name: vmName, error: msg });
    }
  }

  return NextResponse.json({
    provisioned: results,
    errors: errors.length > 0 ? errors : undefined,
    note: 'VMs are in "provisioning" status. Run scripts/provision-vm.sh or SSH in to run install-openclaw.sh to finalize.',
  });
}
