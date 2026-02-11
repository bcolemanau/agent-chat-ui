import { NextResponse } from "next/server";
import { getSessionSafe } from "@/auth";
import { getBackendBaseUrl } from "@/lib/backend-proxy";

/**
 * GET /api/organizations/[orgId]/content
 * Returns organization.md content for the org (epic #85). Proxies to backend GET /auth/organizations/{orgId}/content.
 */
export async function GET(
    req: Request,
    { params }: { params: Promise<{ orgId: string }> }
) {
    try {
        const session = await getSessionSafe();

        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { orgId } = await params;
        const targetUrl = `${getBackendBaseUrl()}/auth/organizations/${encodeURIComponent(orgId)}/content`;

        const resp = await fetch(targetUrl, {
            headers: {
                "Authorization": `Bearer ${session.user.idToken}`,
                "Content-Type": "application/json",
            },
        });

        if (!resp.ok) {
            const errorData = await resp.json().catch(() => ({ detail: resp.statusText }));
            const message = (errorData as { detail?: string }).detail || "Backend error";
            return NextResponse.json({ error: message }, { status: resp.status });
        }

        const data = await resp.json();
        return NextResponse.json(data);
    } catch (error: unknown) {
        console.error("[PROXY] Organization content fetch failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
