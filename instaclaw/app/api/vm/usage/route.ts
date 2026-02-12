import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

const TIER_LIMITS: Record<string, number> = {
  starter: 100,
  pro: 500,
  power: 2000,
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const { data: vm } = await supabase
    .from("instaclaw_vms")
    .select("id, tier, credit_balance")
    .eq("assigned_to", session.user.id)
    .single();

  if (!vm) {
    return NextResponse.json({
      today: 0,
      week: 0,
      month: 0,
      dailyLimit: 100,
      creditBalance: 0,
    });
  }

  try {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    // 7 days ago
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split("T")[0];

    // 30 days ago
    const monthAgo = new Date(now);
    monthAgo.setDate(monthAgo.getDate() - 30);
    const monthAgoStr = monthAgo.toISOString().split("T")[0];

    // Fetch all three ranges in parallel
    const [todayRes, weekRes, monthRes] = await Promise.all([
      supabase
        .from("instaclaw_daily_usage")
        .select("message_count")
        .eq("vm_id", vm.id)
        .eq("usage_date", todayStr)
        .single(),
      supabase
        .from("instaclaw_daily_usage")
        .select("message_count")
        .eq("vm_id", vm.id)
        .gte("usage_date", weekAgoStr),
      supabase
        .from("instaclaw_daily_usage")
        .select("message_count")
        .eq("vm_id", vm.id)
        .gte("usage_date", monthAgoStr),
    ]);

    const today = todayRes.data?.message_count ?? 0;
    const week = (weekRes.data ?? []).reduce(
      (sum: number, row: { message_count: number }) => sum + row.message_count,
      0
    );
    const month = (monthRes.data ?? []).reduce(
      (sum: number, row: { message_count: number }) => sum + row.message_count,
      0
    );

    const tier = vm.tier || "starter";

    return NextResponse.json({
      today,
      week,
      month,
      dailyLimit: TIER_LIMITS[tier] ?? 100,
      creditBalance: vm.credit_balance ?? 0,
    });
  } catch (err) {
    logger.error("Usage stats error", { error: String(err), route: "vm/usage" });
    return NextResponse.json({
      today: 0,
      week: 0,
      month: 0,
      dailyLimit: TIER_LIMITS[vm.tier || "starter"] ?? 100,
      creditBalance: vm.credit_balance ?? 0,
    });
  }
}
