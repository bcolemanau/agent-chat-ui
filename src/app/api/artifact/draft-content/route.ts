import { NextResponse } from "next/server";
import { getSessionSafe } from "@/auth";
import { getBackendBaseUrl } from "@/lib/backend-proxy";

/**
 * Proxy to backend GET /artifact/draft-content.
 * Returns full concept-brief option content from in-memory cache when artifact_id
 * is not persisted (e.g. GitHub storage off), so "View full draft" shows full content.
 */
export async function GET(req: Request) {
    try {
        const session = await getSessionSafe();

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
        const projectId = searchParams.get("project_id");
        const phaseId = searchParams.get("phase_id");
        const orgId = searchParams.get("org_id");

        const backendUrl = getBackendBaseUrl();

        const params = new URLSearchParams({
            cache_key: cacheKey,
            option_index: String(optionIndexNum),
        });
        if (threadId) params.set("thread_id", threadId);
        if (projectId) params.set("project_id", projectId);
        if (phaseId) params.set("phase_id", phaseId);
        if (orgId) params.set("org_id", orgId);
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
    } catch (error) {
        console.error("[PROXY] draft-content fetch failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

/**
 * Proxy to backend POST /artifact/draft-content (UX Brief M2).
 * Updates draft content (markdown) for concept brief in KG when user edits in the proposal view.
 */
export async function POST(req: Request) {
    try {
        const session = await getSessionSafe();

        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const cacheKey = body?.cache_key;
        const content = typeof body?.content === "string" ? body.content : "";

        if (!cacheKey || cacheKey === "") {
            return NextResponse.json({ error: "Missing cache_key" }, { status: 400 });
        }

        const threadId = body?.thread_id ?? null;
        const projectId = body?.project_id ?? null;
        const phaseId = body?.phase_id ?? null;
        const orgId = body?.org_id ?? null;
        const backendUrl = getBackendBaseUrl();
        const targetUrl = `${backendUrl}/artifact/draft-content`;

        const orgContext = req.headers.get("X-Organization-Context");

        const headers: Record<string, string> = {
            Authorization: `Bearer ${session.user.idToken}`,
            "Content-Type": "application/json",
        };

        if (orgContext) {
            headers["X-Organization-Context"] = orgContext;
        }

        const payload: Record<string, unknown> = { cache_key: cacheKey, thread_id: threadId, content };
        if (projectId != null) payload.project_id = projectId;
        if (phaseId != null) payload.phase_id = phaseId;
        if (orgId != null) payload.org_id = orgId;

        const resp = await fetch(targetUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
        });

        if (!resp.ok) {
            const _errorText = await resp.text();
            return NextResponse.json({ error: "Backend error" }, { status: resp.status });
        }

        const data = await resp.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error("[PROXY] draft-content POST failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
