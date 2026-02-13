import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

/**
 * POST /api/gmail/disconnect
 *
 * Removes the Gmail connection for the authenticated user.
 * Clears all Gmail-related data from the database.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from("instaclaw_users")
    .update({
      gmail_connected: false,
      gmail_access_token: null,
      gmail_refresh_token: null,
      gmail_insights: null,
      gmail_profile_summary: null,
      gmail_connected_at: null,
    })
    .eq("id", session.user.id);

  if (error) {
    logger.error("Failed to disconnect Gmail", {
      error: String(error),
      userId: session.user.id,
      route: "gmail/disconnect",
    });
    return NextResponse.json(
      { error: "Failed to disconnect Gmail" },
      { status: 500 }
    );
  }

  logger.info("Gmail disconnected", {
    userId: session.user.id,
    route: "gmail/disconnect",
  });

  return NextResponse.json({ ok: true });
}
