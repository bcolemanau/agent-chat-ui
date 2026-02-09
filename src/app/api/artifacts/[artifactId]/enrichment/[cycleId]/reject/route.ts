import { NextResponse } from "next/server";
import { getSessionSafe } from "@/auth";
import { getBackendBaseUrl, getProxyHeaders } from "@/lib/backend-proxy";

/**
 * Enrichment reject: proxy POST to backend /artifacts/{artifactId}/enrichment/{cycleId}/reject.
 * Body: { thread_id?, decision_id? }.
 * Fixes 404 when catch-all did not forward correctly.
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ artifactId: string; cycleId: string }> }
) {
  try {
    const session = await getSessionSafe();
    if (!session?.user?.idToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { artifactId, cycleId } = await context.params;
    const baseUrl = getBackendBaseUrl();
    const targetUrl = `${baseUrl}/artifacts/${encodeURIComponent(artifactId)}/enrichment/${encodeURIComponent(cycleId)}/reject`;

    const headers = getProxyHeaders(session, req);
    const body = await req.text();

    const resp = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: body || undefined,
    });

    const text = await resp.text();
    if (!resp.ok) {
      try {
        const err = JSON.parse(text);
        return NextResponse.json(err, { status: resp.status });
      } catch {
        return NextResponse.json({ error: text || "Backend error" }, { status: resp.status });
      }
    }

    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return NextResponse.json({ error: "Invalid backend response" }, { status: 502 });
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("[PROXY] Enrichment reject failed:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
