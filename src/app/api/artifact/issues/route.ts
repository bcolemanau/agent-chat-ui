import { NextResponse } from "next/server";
import { getSessionSafe } from "@/auth";
import { getBackendBaseUrl } from "@/lib/backend-proxy";

/**
 * Proxy to backend GET /artifact/issues (Issue 154 connector).
 * Returns issues for an artifact when a connector (e.g. GitHub Issues) is configured.
 */
export async function GET(req: Request) {
  try {
    const session = await getSessionSafe();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const artifactId = searchParams.get("artifact_id") ?? searchParams.get("node_id");
    const orgId = searchParams.get("org_id");
    const projectId = searchParams.get("project_id");
    const threadId = searchParams.get("thread_id");

    if (!artifactId) {
      return NextResponse.json({ error: "Missing artifact_id or node_id" }, { status: 400 });
    }

    const backendUrl = getBackendBaseUrl();
    const params = new URLSearchParams({ artifact_id: artifactId });
    if (orgId) params.set("org_id", orgId);
    if (projectId) params.set("project_id", projectId);
    if (threadId) params.set("thread_id", threadId);

    const targetUrl = `${backendUrl}/artifact/issues?${params.toString()}`;
    const orgContext = req.headers.get("X-Organization-Context");

    const headers: Record<string, string> = {
      Authorization: `Bearer ${session.user.idToken}`,
      "Content-Type": "application/json",
    };
    if (orgContext) headers["X-Organization-Context"] = orgContext;

    const resp = await fetch(targetUrl, { headers });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("[PROXY] Artifact issues failed:", resp.status, text);
      return NextResponse.json({ error: "Backend error", issues: [], count: 0 }, { status: resp.status });
    }

    const data = (await resp.json()) as { issues?: unknown[]; count?: number };
    return NextResponse.json({
      issues: data.issues ?? [],
      count: data.count ?? (Array.isArray(data.issues) ? data.issues.length : 0),
    });
  } catch (error: unknown) {
    console.error("[PROXY] Artifact issues failed:", error);
    return NextResponse.json(
      { error: "Internal Server Error", issues: [], count: 0 },
      { status: 500 }
    );
  }
}
