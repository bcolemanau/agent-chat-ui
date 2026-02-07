import { NextResponse } from "next/server";
import { getSessionSafe } from "@/auth";
import { getBackendBaseUrl } from "@/lib/backend-proxy";

/**
 * Proxy to backend GET /kg/nodes-for-picker (edit mode reference picker).
 * Returns accepted, referenceable nodes (id, type, label, snippet) for the project.
 */
export async function GET(req: Request) {
  try {
    const session = await getSessionSafe();
    if (!session?.user?.idToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const threadId = searchParams.get("thread_id") ?? undefined;
    const projectId = searchParams.get("project_id") ?? undefined;
    const artifactType = searchParams.get("artifact_type") ?? undefined;
    const sourceNodeId = searchParams.get("source_node_id") ?? undefined;
    const search = searchParams.get("search") ?? undefined;

    const backendUrl = getBackendBaseUrl();
    const params = new URLSearchParams();
    if (threadId) params.set("thread_id", threadId);
    if (projectId) params.set("project_id", projectId);
    if (artifactType) params.set("artifact_type", artifactType);
    if (sourceNodeId) params.set("source_node_id", sourceNodeId);
    if (search) params.set("search", search);
    const targetUrl = `${backendUrl}/kg/nodes-for-picker${params.toString() ? `?${params.toString()}` : ""}`;

    const orgContext = req.headers.get("X-Organization-Context");
    const headers: Record<string, string> = {
      Authorization: `Bearer ${session.user.idToken}`,
      "Content-Type": "application/json",
    };
    if (orgContext) headers["X-Organization-Context"] = orgContext;

    const resp = await fetch(targetUrl, { headers });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      const detail = (err as { detail?: string }).detail ?? "Backend error";
      return NextResponse.json({ error: detail }, { status: resp.status });
    }

    const data = await resp.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[PROXY] kg/nodes-for-picker failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
