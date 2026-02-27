import { NextResponse } from "next/server";
import { getSessionSafe } from "@/auth";
import { getBackendBaseUrl } from "@/lib/backend-proxy";

/**
 * Proxy to backend POST /artifact/draft-from-existing (edit-existing flow).
 * Creates a draft copy of an existing accepted artifact in the KG; returns draft_cache_key and content.
 */
export async function POST(req: Request) {
  try {
    const session = await getSessionSafe();

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const nodeId = body?.node_id;
    const threadId = body?.thread_id ?? null;
    const projectId = body?.project_id ?? null;
    const phaseId = body?.phase_id ?? null;
    const orgId = body?.org_id ?? null;

    if (!nodeId || typeof nodeId !== "string" || !nodeId.trim()) {
      return NextResponse.json({ error: "node_id required" }, { status: 400 });
    }

    const backendUrl = getBackendBaseUrl();
    const targetUrl = `${backendUrl}/artifact/draft-from-existing`;

    const orgContext = req.headers.get("X-Organization-Context");

    const headers: Record<string, string> = {
      Authorization: `Bearer ${session.user.idToken}`,
      "Content-Type": "application/json",
    };

    if (orgContext) {
      headers["X-Organization-Context"] = orgContext;
    }

    const payload: Record<string, unknown> = { node_id: nodeId.trim(), thread_id: threadId };
    if (projectId != null) payload.project_id = projectId;
    if (phaseId != null) payload.phase_id = phaseId;
    if (orgId != null) payload.org_id = orgId;

    const resp = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      const detail = (err as { detail?: string }).detail ?? "Backend error";
      return NextResponse.json({ error: detail }, { status: resp.status });
    }

    const data = await resp.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[PROXY] draft-from-existing failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
