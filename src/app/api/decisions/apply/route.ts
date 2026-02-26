import { NextResponse } from "next/server";
import { getSessionSafe } from "@/auth";
import { getBackendBaseUrl } from "@/lib/backend-proxy";

/**
 * Unified apply for decisions: admin (org/user), project, hydration, enrichment approve/reject.
 * Proxies POST to backend /decisions/apply with session auth.
 * Body: { proposal_type, action?, payload?, artifact_id?, cycle_id?, decision_id?, thread_id?, project_id? }.
 */
export async function POST(req: Request) {
  try {
    const session = await getSessionSafe();

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const proposalType = body.proposal_type;
    if (!proposalType || typeof proposalType !== "string") {
      return NextResponse.json({ error: "proposal_type is required" }, { status: 400 });
    }

    console.info("[decisions/apply] proxy", {
      proposalType,
      thread_id: body.thread_id ?? "(none)",
      project_id: body.project_id ?? "(none)",
      payload_project_id: body.payload?.project_id ?? "(none)",
      payload_thread_id: body.payload?.thread_id ?? "(none)",
      orgContext: orgContext ?? "(none)",
    });

    const baseUrl = getBackendBaseUrl();
    const targetUrl = `${baseUrl}/decisions/apply`;

    const orgContext = req.headers.get("X-Organization-Context");

    console.info("[decisions/apply] POST", {
      proposal_type: proposalType,
      thread_id: body.thread_id,
      project_id: body.project_id ?? body.payload?.project_id,
      org_id: body.org_id ?? body.payload?.org_id,
      orgContext: orgContext ?? "(none)",
    });

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
      body: JSON.stringify(body),
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
    console.error("[PROXY] Decisions apply failed:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
