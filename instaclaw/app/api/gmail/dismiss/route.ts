import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

/**
 * POST /api/gmail/dismiss
 *
 * Marks the Gmail connect popup as dismissed for the authenticated user.
 * The popup won't show again unless the user explicitly navigates to settings.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  await supabase
    .from("instaclaw_users")
    .update({ gmail_popup_dismissed: true })
    .eq("id", session.user.id);

  return NextResponse.json({ ok: true });
}
