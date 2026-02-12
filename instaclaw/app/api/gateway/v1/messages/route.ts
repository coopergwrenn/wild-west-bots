/**
 * Anthropic SDK-compatible endpoint.
 *
 * The Anthropic SDK constructs URLs as `${baseURL}/v1/messages`.
 * When an all-inclusive VM has baseURL = "https://instaclaw.io/api/gateway",
 * requests arrive here. We re-export the proxy handler.
 */
export { POST } from "../../proxy/route";
