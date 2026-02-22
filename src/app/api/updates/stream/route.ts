import { NextResponse } from "next/server";
import { getSessionSafe } from "@/auth";
import { getBackendBaseUrl, getProxyHeaders } from "@/lib/backend-proxy";

/**
 * Proxies SSE stream from backend GET /updates/stream?thread_id=...
 * so the browser EventSource (same-origin) gets auth via session cookie and we add Bearer token server-side.
 * When backend returns 503 (Redis disabled), updates are not pushed until the stream is available again.
 */
export async function GET(req: Request) {
    try {
        const session = await getSessionSafe();
        if (!session?.user?.idToken) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const threadId = searchParams.get("thread_id");
        if (!threadId || threadId === "default") {
            return NextResponse.json({ error: "thread_id is required" }, { status: 400 });
        }

        const baseUrl = getBackendBaseUrl();
        const targetUrl = `${baseUrl}/updates/stream?thread_id=${encodeURIComponent(threadId)}`;
        const headers = getProxyHeaders(session, req);

        const resp = await fetch(targetUrl, { headers });
        if (!resp.ok) {
            const text = await resp.text();
            return NextResponse.json(
                { error: resp.status === 503 ? "Updates stream unavailable (Redis required)" : "Backend error" },
                { status: resp.status }
            );
        }

        return new Response(resp.body, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
                "X-Accel-Buffering": "no",
            },
        });
    } catch (error: unknown) {
        console.error("[PROXY] updates/stream failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
