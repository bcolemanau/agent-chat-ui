import { NextResponse } from "next/server";
import { getSessionSafe } from "@/auth";
import { getBackendBaseUrl, getProxyHeaders } from "@/lib/backend-proxy";

export async function GET(req: Request) {
    try {
        const session = await getSessionSafe();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const threadId = searchParams.get("thread_id") || "default";
        const version = searchParams.get("version");
        const versionSource = searchParams.get("version_source");
        const projectId = searchParams.get("project_id");
        const phaseId = searchParams.get("phase_id");
        const orgId = searchParams.get("org_id");
        const params = new URLSearchParams({ thread_id: threadId });
        if (version) params.set("version", version);
        if (versionSource) params.set("version_source", versionSource);
        if (projectId) params.set("project_id", projectId);
        if (phaseId) params.set("phase_id", phaseId);
        if (orgId) params.set("org_id", orgId);
        const baseUrl = getBackendBaseUrl();
        const targetUrl = `${baseUrl}/kg/data?${params.toString()}`;
        const headers = getProxyHeaders(session, req);

        const resp = await fetch(targetUrl, { headers });

        if (!resp.ok) {
            const errorText = await resp.text();
            console.error(`[PROXY] Backend error: ${resp.status} - ${errorText}`);
            return NextResponse.json({ error: "Backend error" }, { status: resp.status });
        }

        const data = await resp.json();
        console.log(`[PROXY] Delivered ${data.nodes?.length} nodes to client`);
        return NextResponse.json(data, {
            headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
        });
    } catch (error: unknown) {
        console.error("[PROXY] KG Data fetch failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
