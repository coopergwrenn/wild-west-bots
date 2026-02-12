import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { sendAdminAlertEmail } from "@/lib/email";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

/** Estimated cost per message unit in dollars (haiku-equivalent). */
const COST_PER_UNIT = 0.004;

/**
 * Global daily spend cap in dollars. If total platform-wide usage exceeds
 * this threshold, only starter-tier (haiku) requests are allowed through.
 * Configurable via DAILY_SPEND_CAP_DOLLARS env var.
 */
const DAILY_SPEND_CAP =
  parseFloat(process.env.DAILY_SPEND_CAP_DOLLARS ?? "100");

/** Track whether we've already sent a circuit-breaker alert today. */
let circuitBreakerAlertDate = "";

/** Extract the model family from a full model id (e.g. "claude-sonnet-4-5-..." → "sonnet"). */
function modelFamily(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes("opus")) return "opus";
  if (lower.includes("sonnet")) return "sonnet";
  if (lower.includes("haiku")) return "haiku";
  return "unknown";
}

/**
 * Build a valid Anthropic Messages API response containing a friendly text
 * message. OpenClaw treats this as a normal assistant reply, so the user
 * sees a natural chat message instead of a raw error.
 */
function friendlyAssistantResponse(text: string, model: string) {
  return NextResponse.json(
    {
      id: "msg_limit_" + Date.now(),
      type: "message",
      role: "assistant",
      content: [{ type: "text", text }],
      model,
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
    { status: 200 }
  );
}

/**
 * Gateway proxy for all-inclusive VMs.
 *
 * The OpenClaw gateway on each VM calls this endpoint instead of Anthropic
 * directly. This gives us centralized rate limiting per tier:
 *   - Starter: 100 units/day
 *   - Pro:     500 units/day
 *   - Power:  2000 units/day
 *
 * All tiers have access to all models. Cost weights handle fairness:
 * Haiku=1, Sonnet=3, Opus=15 (reflects Anthropic pricing).
 *
 * Auth: x-api-key header (gateway token, sent by Anthropic SDK on VMs).
 */
export async function POST(req: NextRequest) {
  try {
    // --- Authenticate via gateway token ---
    // Accept from x-gateway-token (legacy) or x-api-key (Anthropic SDK compat)
    const gatewayToken =
      req.headers.get("x-gateway-token") || req.headers.get("x-api-key");
    if (!gatewayToken) {
      return NextResponse.json(
        { error: "Missing authentication" },
        { status: 401 }
      );
    }

    const supabase = getSupabase();

    const { data: vm } = await supabase
      .from("instaclaw_vms")
      .select("id, gateway_token, api_mode, tier, default_model")
      .eq("gateway_token", gatewayToken)
      .single();

    if (!vm) {
      return NextResponse.json(
        { error: "Invalid gateway token" },
        { status: 401 }
      );
    }

    // --- Reject VMs with no api_mode set (misconfigured) ---
    if (!vm.api_mode) {
      logger.error("VM has null api_mode — blocking request", {
        route: "gateway/proxy",
        vmId: vm.id,
      });
      return NextResponse.json(
        {
          type: "error",
          error: {
            type: "forbidden",
            message:
              "Your instance is not fully configured. Please contact support or retry setup at instaclaw.io.",
          },
        },
        { status: 403 }
      );
    }

    // Only all-inclusive VMs should use the proxy
    if (vm.api_mode !== "all_inclusive") {
      return NextResponse.json(
        { error: "BYOK users should call Anthropic directly" },
        { status: 403 }
      );
    }

    // --- Fail-safe: if tier is null, default to starter (100/day) ---
    const tier = vm.tier || "starter";
    if (!vm.tier) {
      logger.warn("VM has null tier — defaulting to starter", {
        route: "gateway/proxy",
        vmId: vm.id,
      });
    }

    // --- Parse request body to extract model ---
    const body = await req.text();
    let requestedModel: string;
    try {
      const parsed = JSON.parse(body);
      requestedModel = parsed.model || vm.default_model || "claude-haiku-4-5-20251001";
    } catch {
      requestedModel = vm.default_model || "claude-haiku-4-5-20251001";
    }

    // --- Global daily spend circuit breaker ---
    const todayStr = new Date().toISOString().split("T")[0];
    const { data: totalUsageRows } = await supabase
      .from("instaclaw_daily_usage")
      .select("message_count")
      .eq("usage_date", todayStr);

    const totalUnitsToday = (totalUsageRows ?? []).reduce(
      (sum: number, row: { message_count: number }) => sum + row.message_count,
      0
    );
    const estimatedSpend = totalUnitsToday * COST_PER_UNIT;

    if (estimatedSpend >= DAILY_SPEND_CAP && tier !== "starter") {
      logger.error("Circuit breaker tripped — daily spend cap exceeded", {
        route: "gateway/proxy",
        estimatedSpend,
        cap: DAILY_SPEND_CAP,
        totalUnits: totalUnitsToday,
        vmId: vm.id,
        tier,
      });

      // Send alert email once per day
      if (circuitBreakerAlertDate !== todayStr) {
        circuitBreakerAlertDate = todayStr;
        sendAdminAlertEmail(
          "Circuit Breaker Tripped — Daily Spend Cap Exceeded",
          `Estimated daily API spend: $${estimatedSpend.toFixed(2)}\nCap: $${DAILY_SPEND_CAP}\nTotal units today: ${totalUnitsToday}\n\nAll non-starter requests are being paused. Starter (Haiku) requests still allowed.\n\nAdjust via DAILY_SPEND_CAP_DOLLARS env var.`
        ).catch(() => {});
      }

      return friendlyAssistantResponse(
        "Hey! The platform is at capacity for today. Service resets at midnight UTC. In the meantime, you can switch to Haiku for basic tasks — just ask me to \"use Haiku\" and I'll switch models.\n\nSorry about the wait!",
        requestedModel
      );
    }

    // --- Check daily usage limit (with model cost weights) ---
    const { data: limitResult, error: limitError } = await supabase.rpc(
      "instaclaw_check_daily_limit",
      { p_vm_id: vm.id, p_tier: tier, p_model: requestedModel }
    );

    if (limitError) {
      logger.error("Usage limit check failed", { error: String(limitError), route: "gateway/proxy", vmId: vm.id });
      return NextResponse.json(
        {
          type: "error",
          error: {
            type: "rate_limit_error",
            message: "Usage check temporarily unavailable. Please retry in a moment.",
          },
        },
        { status: 503 }
      );
    }

    if (limitResult && !limitResult.allowed) {
      return friendlyAssistantResponse(
        `Hey! You've hit your daily limit for today (${limitResult.count}/${limitResult.limit} units used). 😊\n\nYour limit resets at midnight UTC, but if you want to keep going right now, grab a credit pack — they kick in instantly and never expire:\n\n• 50 units — $5\n• 200 units — $15\n• 500 units — $30\n\n[Top up here →](https://instaclaw.io/dashboard?buy=credits)\n\n(Tip: Haiku uses 1 unit per message, Sonnet uses 3, and Opus uses 15 — switching models stretches your units further!)`,
        requestedModel
      );
    }

    // --- Proxy to Anthropic ---
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      logger.error("ANTHROPIC_API_KEY not set for proxy", { route: "gateway/proxy" });
      return NextResponse.json(
        { error: "Platform API key not configured" },
        { status: 500 }
      );
    }

    const anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": req.headers.get("anthropic-version") || "2023-06-01",
      },
      body,
    });

    // Stream the response back to the VM gateway
    return new NextResponse(anthropicRes.body, {
      status: anthropicRes.status,
      headers: {
        "content-type": anthropicRes.headers.get("content-type") || "application/json",
      },
    });
  } catch (err) {
    logger.error("Gateway proxy error", { error: String(err), route: "gateway/proxy" });
    return NextResponse.json(
      { error: "Proxy error" },
      { status: 500 }
    );
  }
}
