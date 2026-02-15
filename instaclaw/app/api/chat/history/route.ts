import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

const DEFAULT_LIMIT = 50;

/**
 * GET /api/chat/history
 *
 * Returns the user's chat history, ordered by created_at ascending.
 * Supports ?limit=N parameter (default 50, max 200).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = Math.min(
    Math.max(1, parseInt(limitParam ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
    200
  );

  const supabase = getSupabase();

  const { data: messages, error } = await supabase
    .from("instaclaw_chat_messages")
    .select("id, role, content, created_at")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch chat history" },
      { status: 500 }
    );
  }

  // Reverse to get chronological order (we fetched newest-first for the LIMIT to work correctly)
  return NextResponse.json({
    messages: (messages ?? []).reverse(),
  });
}
