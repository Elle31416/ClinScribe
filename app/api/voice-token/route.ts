import { NextResponse } from "next/server";
import { checkRateLimit } from "../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_EXPIRES_SECONDS = 120; // redemption window: how long the browser has to open the socket
const MAX_SESSION_SECONDS = 1800; // ceiling on billed session length
const REQUEST_TIMEOUT_MS = 10_000;
const RATE_LIMIT = { limit: 5, windowMs: 60_000 };

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "local";
}

export async function GET(request: Request) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  const agentId = process.env.AGENT_ID;

  if (!apiKey || !agentId) {
    return NextResponse.json(
      { error: "ASSEMBLYAI_API_KEY or AGENT_ID is missing." },
      { status: 500 },
    );
  }

  const { allowed, retryAfterSeconds } = checkRateLimit(
    clientKey(request),
    RATE_LIMIT.limit,
    RATE_LIMIT.windowMs,
  );

  if (!allowed) {
    return NextResponse.json(
      { error: "Too many sessions started from this address. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
  }

  const url = new URL("https://agents.assemblyai.com/v1/token");
  url.searchParams.set("expires_in_seconds", String(TOKEN_EXPIRES_SECONDS));
  url.searchParams.set("max_session_duration_seconds", String(MAX_SESSION_SECONDS));

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      // Log the upstream body for the operator; do not hand it to the browser.
      console.error(
        `Voice token mint failed (${response.status}): ${await response.text()}`,
      );
      return NextResponse.json(
        { error: "Could not mint a voice token." },
        { status: 502 },
      );
    }

    const { token } = (await response.json()) as { token?: unknown };
    if (typeof token !== "string" || !token) {
      console.error("Voice token response did not contain a token.");
      return NextResponse.json(
        { error: "Voice Agent API returned an unexpected response." },
        { status: 502 },
      );
    }

    // The token is single-use and short lived; the agent id is public config.
    return NextResponse.json(
      { token, agentId },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Voice token request failed:", error);
    return NextResponse.json(
      { error: "Could not reach the Voice Agent API." },
      { status: 502 },
    );
  }
}
