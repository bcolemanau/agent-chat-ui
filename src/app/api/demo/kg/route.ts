import { NextResponse } from "next/server";
import { getSessionSafe } from "@/auth";
import { getBackendBaseUrl, getProxyHeaders } from "@/lib/backend-proxy";

/**
 * Demo KG: base NPD (no auth) or project KG (with auth when phase_id provided).
 * - No query params or no session → GET /kg/data/base (public base NPD for hero demo).
 * - phase_id (and optional thread_id, project_id, org_id) + valid session → GET /kg/data with auth (same as map).
 * So when opening /demo?phase_id=... from a project, the demo shows that project's KG.
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const phaseId = searchParams.get("phase_id");
        const threadId = searchParams.get("thread_id") ?? "default";
        const projectId = searchParams.get("project_id");
        const orgId = searchParams.get("org_id");

        const baseUrl = getBackendBaseUrl();

        // Prefer project-scoped KG when phase_id is present and user is logged in
        if (phaseId) {
            const session = await getSessionSafe();
            if (session?.user?.idToken) {
                const params = new URLSearchParams({ thread_id: threadId, phase_id: phaseId });
                if (projectId) params.set("project_id", projectId);
                if (orgId) params.set("org_id", orgId);
                const targetUrl = `${baseUrl}/kg/data?${params.toString()}`;
                const headers = getProxyHeaders(session, req);
                const resp = await fetch(targetUrl, { headers });
                if (resp.ok) {
                    const data = await resp.json();
                    return NextResponse.json(data, {
                        headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
                    });
                }
                console.error(`[PROXY] Demo KG (project) error: ${resp.status} - ${await resp.text()}`);
                // Fall through to base NPD on project fetch failure
            }
        }

        // Public base NPD for hero demo (no auth)
        const targetUrl = `${baseUrl}/kg/data/base`;
        const resp = await fetch(targetUrl, {
            headers: { "Content-Type": "application/json" },
            next: { revalidate: 60 },
        });

        if (!resp.ok) {
            const errorText = await resp.text();
            console.error(`[PROXY] Demo KG (base) error: ${resp.status} - ${errorText}`);
            return NextResponse.json({ error: "Backend error" }, { status: resp.status });
        }

        const data = (await resp.json()) as { nodes?: unknown[]; links?: unknown[]; metadata?: Record<string, unknown> };
        return NextResponse.json(data, {
            headers: {
                "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
            },
        });
    } catch (error: unknown) {
        console.error("[PROXY] Demo KG fetch failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
