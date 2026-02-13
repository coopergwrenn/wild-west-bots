import { NextResponse } from "next/server";
import { verifyHQAuth } from "@/lib/hq-auth";
import { getSupabase } from "@/lib/supabase";
import { TIER_DISPLAY, type Tier, type ApiMode } from "@/lib/stripe";

const VM_MONTHLY_COST: Record<string, number> = {
  hetzner: 9,
  digitalocean: 24,
  linode: 24,
};

export async function GET() {
  if (!(await verifyHQAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getSupabase();
    const { data: vms, error } = await supabase
      .from("instaclaw_vms")
      .select("id, provider, server_type, status, assigned_to, tier, api_mode, created_at");

    if (error) throw new Error(error.message);

    const vmList = vms ?? [];

    // --- Provider breakdown ---
    const EMPTY_COUNTS = { vmCount: 0, assignedCount: 0, readyCount: 0, provisioningCount: 0 };
    const providerMap = new Map<
      string,
      { vmCount: number; assignedCount: number; readyCount: number; provisioningCount: number }
    >();

    // Seed all known providers so they always appear
    for (const name of Object.keys(VM_MONTHLY_COST)) {
      providerMap.set(name, { ...EMPTY_COUNTS });
    }

    for (const vm of vmList) {
      const p = vm.provider ?? "hetzner";
      if (!providerMap.has(p)) {
        providerMap.set(p, { ...EMPTY_COUNTS });
      }
      const entry = providerMap.get(p)!;
      entry.vmCount++;
      if (vm.status === "assigned") entry.assignedCount++;
      else if (vm.status === "ready") entry.readyCount++;
      else if (vm.status === "provisioning") entry.provisioningCount++;
    }

    const providers = Array.from(providerMap.entries()).map(([name, counts]) => ({
      name,
      ...counts,
      monthlyCost: counts.vmCount * (VM_MONTHLY_COST[name] ?? 0),
    }));

    // --- Tier breakdown ---
    const tierMap = new Map<string, { count: number; revenuePerVm: number; totalRevenue: number }>();

    for (const vm of vmList) {
      if (vm.status !== "assigned" || !vm.tier) continue;

      const tier = vm.tier as Tier;
      const apiMode = (vm.api_mode ?? "all_inclusive") as ApiMode;
      const tierInfo = TIER_DISPLAY[tier];
      if (!tierInfo) continue;

      const price = apiMode === "byok" ? tierInfo.byok : tierInfo.allInclusive;
      const key = `${tier}_${apiMode}`;

      if (!tierMap.has(key)) {
        tierMap.set(key, { count: 0, revenuePerVm: price, totalRevenue: 0 });
      }
      const entry = tierMap.get(key)!;
      entry.count++;
      entry.totalRevenue += price;
    }

    const tiers = Array.from(tierMap.entries()).map(([key, data]) => {
      const [tier, apiMode] = key.split("_") as [string, string];
      const tierInfo = TIER_DISPLAY[tier as Tier];
      return {
        tier: tierInfo?.name ?? tier,
        apiMode,
        ...data,
      };
    });

    // --- Totals ---
    const totalVms = vmList.length;
    const assignedVms = vmList.filter((v) => v.status === "assigned").length;
    const availableVms = vmList.filter((v) => v.status === "ready").length;
    const monthlyInfraCost = providers.reduce((sum, p) => sum + p.monthlyCost, 0);
    const monthlyRevenue = tiers.reduce((sum, t) => sum + t.totalRevenue, 0);
    const grossMargin = monthlyRevenue - monthlyInfraCost;
    const marginPercent = monthlyRevenue > 0 ? (grossMargin / monthlyRevenue) * 100 : 0;

    // --- VM list for detail table ---
    const vmDetails = vmList.map((vm) => {
      const provider = vm.provider ?? "hetzner";
      const cost = VM_MONTHLY_COST[provider] ?? 0;
      return {
        id: vm.id,
        provider,
        serverType: vm.server_type,
        status: vm.status,
        tier: vm.tier,
        apiMode: vm.api_mode,
        createdAt: vm.created_at,
        monthlyCost: cost,
      };
    });

    return NextResponse.json({
      providers,
      tiers,
      totals: {
        totalVms,
        assignedVms,
        availableVms,
        monthlyInfraCost,
        monthlyRevenue,
        grossMargin,
        marginPercent,
      },
      vms: vmDetails,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
