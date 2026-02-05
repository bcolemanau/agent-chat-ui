import { NextResponse } from "next/server";
import { getSessionSafe } from "@/auth";
import { proxyBackendGet, getBackendBaseUrl, getProxyHeaders } from "@/lib/backend-proxy";

export async function GET(req: Request) {
    const session = await getSessionSafe();
    return proxyBackendGet(req, "/kg/projects", { session, logLabel: "Projects", forwardSearchParams: false });
}

export async function DELETE(req: Request) {
    try {
        const session = await getSessionSafe();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const url = new URL(req.url);
        const projectId = url.searchParams.get("projectId");
        if (!projectId) {
            return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
        }

        const baseUrl = getBackendBaseUrl();
        const targetUrl = `${baseUrl}/kg/projects/${encodeURIComponent(projectId)}`;
        const headers = { ...getProxyHeaders(session, req), "X-User-Email": session.user.email || "guest" };

        const resp = await fetch(targetUrl, { method: "DELETE", headers });

        if (!resp.ok) {
            const errorText = await resp.text();
            console.error(`[PROXY] Backend error (delete project): ${resp.status} - ${errorText}`);
            return NextResponse.json({ error: "Backend error" }, { status: resp.status });
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error("[PROXY] Project delete failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
