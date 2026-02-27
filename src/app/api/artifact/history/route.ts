import { NextResponse } from "next/server";
import { getSessionSafe } from "@/auth";
import { getBackendBaseUrl } from "@/lib/backend-proxy";

export async function GET(req: Request) {
    try {
        const session = await getSessionSafe();

        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const nodeId = searchParams.get("node_id");
        const threadId = searchParams.get("thread_id") || "default";
        const projectId = searchParams.get("project_id");
        const phaseId = searchParams.get("phase_id");
        const orgId = searchParams.get("org_id");

        if (!nodeId) {
            return NextResponse.json({ error: "Missing node_id" }, { status: 400 });
        }

        const backendUrl = getBackendBaseUrl();
        const params = new URLSearchParams({ node_id: nodeId, thread_id: threadId });
        if (projectId) params.set("project_id", projectId);
        if (phaseId) params.set("phase_id", phaseId);
        if (orgId) params.set("org_id", orgId);
        const targetUrl = `${backendUrl}/artifact/history?${params.toString()}`;

        const orgContext = req.headers.get("X-Organization-Context");

        const headers: Record<string, string> = {
            "Authorization": `Bearer ${session.user.idToken}`,
            "Content-Type": "application/json",
        };

        if (orgContext) {
            headers["X-Organization-Context"] = orgContext;
        }

        const resp = await fetch(targetUrl, { headers });

        if (!resp.ok) {
            const _errorText = await resp.text();
            return NextResponse.json({ error: "Backend error" }, { status: resp.status });
        }

        const data = await resp.json();
        return NextResponse.json(data);

    } catch (error: any) {
        console.error("[PROXY] Artifact history failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
