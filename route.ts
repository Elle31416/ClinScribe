import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  const agentId = process.env.AGENT_ID;

  if (!apiKey || !agentId) {
    return NextResponse.json(
      { error: "ASSEMBLYAI_API_KEY or AGENT_ID is missing." },
      { status: 500 },
    );
  }

  const url = new URL("https://agents.assemblyai.com/v1/token");
  url.searchParams.set("expires_in_seconds", "120");
  url.searchParams.set("max_session_duration_seconds", "1800");

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    const body = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        { error: "Could not mint a voice token.", detail: body },
        { status: response.status },
      );
    }

    const { token } = JSON.parse(body) as { token: string };
    return NextResponse.json(
      { token, agentId },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Could not reach the Voice Agent API.",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 },
    );
  }
}