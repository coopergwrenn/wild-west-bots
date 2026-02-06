import { NextRequest, NextResponse } from "next/server";
import { validateAdminKey } from "@/lib/security";
import { getSupabase } from "@/lib/supabase";
import {
  createServer,
  waitForServer,
  resolveHetznerIds,
  getNextVmNumber,
  formatVmName,
  getImage,
  getSnapshotUserData,
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

  // Resolve Hetzner resource IDs and snapshot config
  const { sshKeyId, firewallId } = await resolveHetznerIds();
  const image = getImage();
  const userData = getSnapshotUserData();
  const isSnapshot = !!process.env.HETZNER_SNAPSHOT_ID;

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
        image,
        sshKeyId,
        firewallId,
        userData,
      });

      // Wait for the server to get an IP
      const readyServer = await waitForServer(server.id);
      const ip = readyServer.public_net.ipv4.ip;

      // Insert into Supabase — snapshot VMs are ready after cloud-init
      const { data: vm, error } = await supabase
        .from("instaclaw_vms")
        .insert({
          ip_address: ip,
          name: vmName,
          hetzner_server_id: String(server.id),
          ssh_port: 22,
          ssh_user: "openclaw",
          status: isSnapshot ? "ready" : "provisioning",
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
        status: isSnapshot ? "ready" : "provisioning",
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
    mode: isSnapshot ? "snapshot" : "fresh",
    note: isSnapshot
      ? "VMs created from snapshot with cloud-init personalization. Status: ready."
      : 'VMs are in "provisioning" status. Run install-openclaw.sh to finalize.',
  });
}
