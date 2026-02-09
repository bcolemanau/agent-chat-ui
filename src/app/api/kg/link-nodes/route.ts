import { NextResponse } from "next/server";
import { getSessionSafe } from "@/auth";
import { getBackendBaseUrl } from "@/lib/backend-proxy";

/**
 * Proxy to backend POST /kg/link-nodes (edit mode: create link from artifact to selected node).
 */
export async function POST(req: Request) {
  try {
    const session = await getSessionSafe();
    if (!session?.user?.idToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const sourceId = body?.source_id;
    const targetId = body?.target_id;
    const linkType = body?.link_type ?? "REFERENCES";
    const metadata = body?.metadata ?? undefined;
    const threadId = body?.thread_id ?? undefined;
    const projectId = body?.project_id ?? undefined;

    if (!sourceId || typeof sourceId !== "string" || !sourceId.trim()) {
      return NextResponse.json({ error: "source_id required" }, { status: 400 });
    }
    if (!targetId || typeof targetId !== "string" || !targetId.trim()) {
      return NextResponse.json({ error: "target_id required" }, { status: 400 });
    }

    const backendUrl = getBackendBaseUrl();
    const targetUrl = `${backendUrl}/kg/link-nodes`;

    const orgContext = req.headers.get("X-Organization-Context");
    const headers: Record<string, string> = {
      Authorization: `Bearer ${session.user.idToken}`,
      "Content-Type": "application/json",
    };
    if (orgContext) headers["X-Organization-Context"] = orgContext;

    const payload: Record<string, unknown> = {
      source_id: sourceId.trim(),
      target_id: targetId.trim(),
      link_type: linkType,
    };
    if (metadata != null) payload.metadata = metadata;
    if (threadId != null) payload.thread_id = threadId;
    if (projectId != null) payload.project_id = projectId;

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
    console.error("[PROXY] kg/link-nodes failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
