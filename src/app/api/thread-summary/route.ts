import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { getBackendBaseUrl, getProxyHeaders } from "@/lib/backend-proxy";

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const threadId = searchParams.get("thread_id") || "default";
        const baseUrl = getBackendBaseUrl();
        const targetUrl = `${baseUrl}/thread-summary?thread_id=${encodeURIComponent(threadId)}`;
        const headers = getProxyHeaders(session, req);

        const resp = await fetch(targetUrl, { headers });

        if (!resp.ok) {
            const errorText = await resp.text();
            console.error(`[PROXY] Thread summary error: ${resp.status} - ${errorText}`);
            return NextResponse.json({ error: "Backend error" }, { status: resp.status });
        }

        const data = await resp.json();
        return NextResponse.json(data, {
            headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
        });
    } catch (error: unknown) {
        console.error("[PROXY] Thread summary failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
