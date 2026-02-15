import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MAX_HISTORY = 40; // messages to include for context
const MAX_TOKENS = 2048;

/**
 * POST /api/chat/send
 *
 * Sends a message to the user's agent and streams the response.
 * The system prompt comes from the VM's config + user profile data.
 * Chat history is stored in Supabase.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.error("ANTHROPIC_API_KEY not set", { route: "chat/send" });
    return NextResponse.json(
      { error: "Chat is not configured on this environment." },
      { status: 500 }
    );
  }

  let message: string;
  try {
    const body = await req.json();
    message = body.message;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }
  message = message.trim();

  const supabase = getSupabase();

  // Get VM info (for model + system_prompt)
  const { data: vm } = await supabase
    .from("instaclaw_vms")
    .select("id, default_model, system_prompt")
    .eq("assigned_to", session.user.id)
    .single();

  if (!vm) {
    return NextResponse.json(
      { error: "No agent configured yet. Complete setup from your dashboard." },
      { status: 422 }
    );
  }

  // Get user profile for personalization
  const { data: user } = await supabase
    .from("instaclaw_users")
    .select("name, gmail_profile_summary, gmail_insights")
    .eq("id", session.user.id)
    .single();

  // Build system prompt
  const systemPrompt = buildSystemPrompt(
    vm.system_prompt,
    user?.name,
    user?.gmail_profile_summary,
    user?.gmail_insights
  );

  // Get recent chat history
  const { data: history } = await supabase
    .from("instaclaw_chat_messages")
    .select("role, content")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY);

  const messages = [
    ...(history ?? []).reverse(),
    { role: "user", content: message },
  ];

  // Save the user message immediately
  await supabase.from("instaclaw_chat_messages").insert({
    user_id: session.user.id,
    role: "user",
    content: message,
  });

  // Call Anthropic with streaming
  const model = vm.default_model || "claude-haiku-4-5-20251001";

  try {
    const anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages,
        stream: true,
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      logger.error("Anthropic API error in chat", {
        status: anthropicRes.status,
        error: errText.slice(0, 500),
        route: "chat/send",
        userId: session.user.id,
      });
      return NextResponse.json(
        { error: "Your agent encountered an error. Please try again." },
        { status: 502 }
      );
    }

    // Pipe the SSE stream through and accumulate the full response
    // so we can save it to the database when done
    const userId = session.user.id;
    const reader = anthropicRes.body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: "No response stream" }, { status: 502 });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const decoder = new TextDecoder();
        let fullText = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Forward raw SSE bytes to client
            controller.enqueue(value);

            // Parse out text deltas for saving
            const chunk = decoder.decode(value, { stream: true });
            for (const line of chunk.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              try {
                const event = JSON.parse(data);
                if (
                  event.type === "content_block_delta" &&
                  event.delta?.type === "text_delta"
                ) {
                  fullText += event.delta.text;
                }
              } catch {
                // Not valid JSON — skip
              }
            }
          }

          // Save the complete assistant response
          if (fullText.length > 0) {
            getSupabase()
              .from("instaclaw_chat_messages")
              .insert({
                user_id: userId,
                role: "assistant",
                content: fullText,
              })
              .then(({ error }) => {
                if (error) {
                  logger.error("Failed to save assistant message", {
                    error: String(error),
                    route: "chat/send",
                    userId,
                  });
                }
              });
          }
        } catch (err) {
          logger.error("Stream processing error", {
            error: String(err),
            route: "chat/send",
            userId,
          });
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  } catch (err) {
    logger.error("Chat send error", {
      error: String(err),
      route: "chat/send",
      userId: session.user.id,
    });
    return NextResponse.json(
      { error: "Your agent is currently offline. Check your dashboard for status." },
      { status: 502 }
    );
  }
}

/* ─── System Prompt Builder ──────────────────────────────── */

function buildSystemPrompt(
  customPrompt: string | null,
  userName: string | null | undefined,
  profileSummary: string | null | undefined,
  insights: string[] | null | undefined
): string {
  const parts: string[] = [];

  // Base identity
  parts.push(
    "You are an autonomous AI agent running on InstaClaw, a platform that gives each user their own dedicated AI agent on a private VM. " +
    "You help your user with research, writing, monitoring, scheduling tasks, earning money on the Clawlancer marketplace, and anything else they need. " +
    "You are proactive, resourceful, and deeply personalized to your user. " +
    "You can browse the web, search for information, draft emails, analyze data, and complete bounties on the Clawlancer marketplace. " +
    "Respond in a natural, conversational tone. Use markdown formatting when helpful."
  );

  // Custom system prompt from user settings
  if (customPrompt) {
    parts.push(`\n\nCustom instructions from your user:\n${customPrompt}`);
  }

  // User profile context
  if (userName || profileSummary || (insights && insights.length > 0)) {
    parts.push("\n\n## About Your User");
    if (userName) parts.push(`Name: ${userName}`);
    if (profileSummary) parts.push(profileSummary);
    if (insights && insights.length > 0) {
      parts.push("\nQuick Profile:");
      for (const insight of insights) {
        parts.push(`- ${insight}`);
      }
    }
    parts.push(
      "\nUse this context to personalize all interactions. You already know this person — act like it."
    );
  }

  return parts.join("\n");
}
