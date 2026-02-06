import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

/**
 * Gateway proxy for all-inclusive VMs.
 *
 * The OpenClaw gateway on each VM calls this endpoint instead of Anthropic
 * directly. This gives us centralized rate limiting per tier:
 *   - Starter: 100 messages/day
 *   - Pro:     500 messages/day
 *   - Power:  2000 messages/day
 *
 * Auth: X-Gateway-Token header (the per-VM token generated at configure time).
 */
export async function POST(req: NextRequest) {
  try {
    // --- Authenticate via gateway token ---
    const gatewayToken = req.headers.get("x-gateway-token");
    if (!gatewayToken) {
      return NextResponse.json(
        { error: "Missing X-Gateway-Token" },
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

    // Only all-inclusive VMs should use the proxy
    if (vm.api_mode !== "all_inclusive") {
      return NextResponse.json(
        { error: "BYOK users should call Anthropic directly" },
        { status: 403 }
      );
    }

    // --- Check daily usage limit ---
    const tier = vm.tier || "starter";

    const { data: limitResult, error: limitError } = await supabase.rpc(
      "instaclaw_check_daily_limit",
      { p_vm_id: vm.id, p_tier: tier }
    );

    if (limitError) {
      console.error("Usage limit check failed:", limitError);
      // Fail open — allow the request but log the error
    } else if (limitResult && !limitResult.allowed) {
      return NextResponse.json(
        {
          type: "error",
          error: {
            type: "rate_limit_error",
            message: `Daily limit reached (${limitResult.count}/${limitResult.limit} messages). Resets at midnight UTC. Upgrade your plan for higher limits.`,
          },
        },
        { status: 429 }
      );
    }

    // --- Proxy to Anthropic ---
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("ANTHROPIC_API_KEY not set for proxy");
      return NextResponse.json(
        { error: "Platform API key not configured" },
        { status: 500 }
      );
    }

    const body = await req.text();

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
    console.error("Gateway proxy error:", err);
    return NextResponse.json(
      { error: "Proxy error" },
      { status: 500 }
    );
  }
}
