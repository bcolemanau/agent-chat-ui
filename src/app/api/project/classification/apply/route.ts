import { NextResponse } from "next/server";
import { getSessionSafe } from "@/auth";
import { getBackendBaseUrl } from "@/lib/backend-proxy";

/**
 * Issue 37 Phase 1: Apply classification (Begin Enriching).
 * Proxies POST to backend /project/classification/apply with session auth.
 * Body: { decision_id, trigger_id, project_id?, thread_id?, reasoning?, confidence? }.
 * Returns: { success, active_agent, current_trigger_id, ... }.
 */
export async function POST(req: Request) {
  try {
    const session = await getSessionSafe();

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: {
      decision_id: string;
      trigger_id: string;
      project_id?: string;
      thread_id?: string;
      reasoning?: string;
      confidence?: number;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.decision_id) {
      return NextResponse.json({ error: "decision_id is required" }, { status: 400 });
    }
    if (!body.trigger_id) {
      return NextResponse.json({ error: "trigger_id is required" }, { status: 400 });
    }

    const baseUrl = getBackendBaseUrl();
    const targetUrl = `${baseUrl}/project/classification/apply`;

    const orgContext = req.headers.get("X-Organization-Context");

    const headers: Record<string, string> = {
      Authorization: `Bearer ${session.user.idToken}`,
      "Content-Type": "application/json",
    };

    if (orgContext) {
      headers["X-Organization-Context"] = orgContext;
    }

    const resp = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        decision_id: body.decision_id,
        trigger_id: body.trigger_id,
        project_id: body.project_id ?? undefined,
        thread_id: body.thread_id ?? undefined,
        reasoning: body.reasoning ?? undefined,
        confidence: body.confidence ?? undefined,
      }),
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
      data = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Invalid backend response" }, { status: 502 });
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("[PROXY] Classification apply failed:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
