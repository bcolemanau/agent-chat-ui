/**
 * Forwards chat to the Phase 4 GCP proxy (Vertex Agent Engine).
 * Set GCP_PROXY_CHAT_URL in env (e.g. https://gcp-proxy-xxx.run.app). Optional: GCP_PROXY_JWT for proxy auth.
 */
import { NextRequest } from "next/server";

const PROXY_URL = process.env.GCP_PROXY_CHAT_URL?.trim();
const PROXY_JWT = process.env.GCP_PROXY_JWT?.trim();

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!PROXY_URL) {
    return new Response(
      JSON.stringify({
        detail:
          "GCP proxy not configured. Set GCP_PROXY_CHAT_URL to the proxy root URL.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const url = `${PROXY_URL.replace(/\/$/, "")}/api/chat`;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ detail: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const auth = req.headers.get("Authorization");
  if (auth) {
    headers["Authorization"] = auth;
  } else if (PROXY_JWT) {
    headers["Authorization"] = `Bearer ${PROXY_JWT}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(115000),
  });

  if (!res.ok && !res.body) {
    const text = await res.text();
    return new Response(
      JSON.stringify({ detail: text || res.statusText }),
      { status: res.status, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(res.body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/json",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
