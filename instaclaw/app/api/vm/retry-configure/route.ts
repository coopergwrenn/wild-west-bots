import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

const MAX_CONFIGURE_ATTEMPTS = 3;

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabase();

    // Get user's VM — must be in configure_failed state
    const { data: vm } = await supabase
      .from("instaclaw_vms")
      .select("id, health_status, configure_attempts")
      .eq("assigned_to", session.user.id)
      .single();

    if (!vm) {
      return NextResponse.json({ error: "No VM assigned" }, { status: 404 });
    }

    if (vm.health_status !== "configure_failed") {
      return NextResponse.json(
        { error: "VM is not in a failed state" },
        { status: 400 }
      );
    }

    if ((vm.configure_attempts ?? 0) >= MAX_CONFIGURE_ATTEMPTS) {
      return NextResponse.json(
        { error: "Maximum retry attempts reached. Please contact support." },
        { status: 400 }
      );
    }

    // Verify pending config exists
    const { data: pending } = await supabase
      .from("instaclaw_pending_users")
      .select("id")
      .eq("user_id", session.user.id)
      .single();

    if (!pending) {
      return NextResponse.json(
        { error: "No pending configuration found" },
        { status: 404 }
      );
    }

    // Call the internal configure endpoint
    const configRes = await fetch(
      `${process.env.NEXTAUTH_URL}/api/vm/configure`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Key": process.env.ADMIN_API_KEY ?? "",
        },
        body: JSON.stringify({ userId: session.user.id }),
      }
    );

    if (!configRes.ok) {
      const errData = await configRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: errData.error || "Configuration failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ retried: true });
  } catch (err) {
    console.error("VM retry-configure error:", err);
    return NextResponse.json(
      { error: "Failed to retry configuration" },
      { status: 500 }
    );
  }
}
