import { NextResponse } from "next/server";
import { getSessionSafe } from "@/auth";
import { getBackendBaseUrl } from "@/lib/backend-proxy";

/**
 * GET /api/auth/packs — List registered packs (Issue 147).
 * Proxies to backend GET /auth/packs for pack selector and org default pack.
 * Returns [{ pack_type_id, name, description, workflow_id }, ...].
 */
export async function GET() {
    try {
        const session = await getSessionSafe();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (!session.user.idToken) {
            return NextResponse.json({ error: "Missing authentication token" }, { status: 401 });
        }

        const targetUrl = `${getBackendBaseUrl()}/auth/packs`;
        const resp = await fetch(targetUrl, {
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.user.idToken}`,
            },
        });

        if (!resp.ok) {
            const cloned = resp.clone();
            let errorText = "";
            try {
                const data = await cloned.json();
                errorText = data.detail || data.error || JSON.stringify(data);
            } catch {
                try {
                    errorText = await resp.text();
                } catch {
                    errorText = `Backend returned ${resp.status} ${resp.statusText}`;
                }
            }
            return NextResponse.json({ error: errorText || "Backend error" }, { status: resp.status });
        }

        const data = await resp.json();
        return NextResponse.json(data);
    } catch (error: unknown) {
        console.error("[PROXY] Auth packs fetch failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
