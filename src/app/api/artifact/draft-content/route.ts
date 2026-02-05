import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

/**
 * Proxy to backend GET /artifact/draft-content.
 * Returns full concept-brief option content from in-memory cache when artifact_id
 * is not persisted (e.g. GitHub storage off), so "View full draft" shows full content.
 */
export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const cacheKey = searchParams.get("cache_key");
        const optionIndex = searchParams.get("option_index");

        if (!cacheKey || optionIndex === null || optionIndex === "") {
            return NextResponse.json({ error: "Missing cache_key or option_index" }, { status: 400 });
        }

        const optionIndexNum = parseInt(optionIndex, 10);
        if (Number.isNaN(optionIndexNum) || optionIndexNum < 0) {
            return NextResponse.json({ error: "Invalid option_index" }, { status: 400 });
        }

        const threadId = searchParams.get("thread_id");

        const backendUrl = getBackendBaseUrl();

        const params = new URLSearchParams({
            cache_key: cacheKey,
            option_index: String(optionIndexNum),
        });
        if (threadId) params.set("thread_id", threadId);
        const targetUrl = `${backendUrl}/artifact/draft-content?${params.toString()}`;

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
    } catch (error: unknown) {
        console.error("[PROXY] Artifact draft-content failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
