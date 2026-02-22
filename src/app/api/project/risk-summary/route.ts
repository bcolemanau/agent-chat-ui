import { NextResponse } from "next/server";
import { getSessionSafe } from "@/auth";
import { getBackendBaseUrl } from "@/lib/backend-proxy";

/**
 * Proxies GET to backend /project/risk-summary for map context pane (project + artifact risk aggregates).
 */
export async function GET(req: Request) {
    try {
        const session = await getSessionSafe();

        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const threadId = searchParams.get("thread_id");

        const backendUrl = getBackendBaseUrl();
        const params = new URLSearchParams();
        if (threadId) params.set("thread_id", threadId);
        const targetUrl = `${backendUrl}/project/risk-summary${params.toString() ? `?${params.toString()}` : ""}`;

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
            await resp.text();
            return NextResponse.json({ error: "Backend error" }, { status: resp.status });
        }

        const data = await resp.json();
        return NextResponse.json(data);

    } catch (error: unknown) {
        console.error("[PROXY] Project risk-summary failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
