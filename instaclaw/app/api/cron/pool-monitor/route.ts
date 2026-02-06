import { NextRequest, NextResponse } from "next/server";
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

const MIN_POOL_SIZE = 2;
const MAX_AUTO_PROVISION = 3;

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();

  // Count ready (unassigned) VMs
  const { count: readyCount } = await supabase
    .from("instaclaw_vms")
    .select("*", { count: "exact", head: true })
    .eq("status", "ready");

  const ready = readyCount ?? 0;

  if (ready >= MIN_POOL_SIZE) {
    return NextResponse.json({
      ready,
      needed: 0,
      provisioned: 0,
      message: `Pool healthy: ${ready} ready VMs`,
    });
  }

  const needed = MIN_POOL_SIZE - ready;
  const toProvision = Math.min(needed, MAX_AUTO_PROVISION);

  console.log(
    `[pool-monitor] Pool low: ${ready} ready, need ${needed}, provisioning ${toProvision}`
  );

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

  let sshKeyId: number;
  let firewallId: number;
  try {
    const ids = await resolveHetznerIds();
    sshKeyId = ids.sshKeyId;
    firewallId = ids.firewallId;
  } catch (err) {
    console.error("[pool-monitor] Failed to resolve Hetzner IDs:", err);
    return NextResponse.json(
      { error: "Failed to resolve Hetzner resource IDs" },
      { status: 500 }
    );
  }

  const provisioned: { name: string; ip: string }[] = [];

  for (let i = 0; i < toProvision; i++) {
    const vmName = formatVmName(startNum + i);

    try {
      const server = await createServer({
        name: vmName,
        sshKeyId,
        firewallId,
      });

      const readyServer = await waitForServer(server.id);
      const ip = readyServer.public_net.ipv4.ip;

      const { error } = await supabase.from("instaclaw_vms").insert({
        ip_address: ip,
        name: vmName,
        hetzner_server_id: String(server.id),
        ssh_port: 22,
        ssh_user: "root",
        status: "provisioning",
        region: HETZNER_DEFAULTS.region,
        server_type: HETZNER_DEFAULTS.serverType,
      });

      if (error) {
        console.error(
          `[pool-monitor] DB insert failed for ${vmName}:`,
          error.message
        );
        continue;
      }

      provisioned.push({ name: vmName, ip });
      console.log(`[pool-monitor] Created ${vmName} at ${ip}`);
    } catch (err) {
      console.error(`[pool-monitor] Failed to provision ${vmName}:`, err);
    }
  }

  return NextResponse.json({
    ready,
    needed,
    provisioned: provisioned.length,
    vms: provisioned,
    note: 'New VMs are in "provisioning" status. Run install-openclaw.sh on each to finalize.',
  });
}
