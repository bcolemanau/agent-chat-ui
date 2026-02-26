import { NextResponse } from "next/server";
import { getSessionSafe } from "@/auth";

export async function GET(req: Request) {
    try {
        const session = await getSessionSafe();

        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const projectId = searchParams.get("project_id");
        const version1 = searchParams.get("version1");
        const version2 = searchParams.get("version2");
        const version1Source = searchParams.get("version1_source");
        const version2Source = searchParams.get("version2_source");

        if (!projectId || !version1 || !version2) {
            return NextResponse.json(
                { error: "project_id, version1, and version2 are required" },
                { status: 400 }
            );
        }

        const params = new URLSearchParams({
            project_id: projectId,
            version1,
            version2,
        });
        if (version1Source) params.set("version1_source", version1Source);
        if (version2Source) params.set("version2_source", version2Source);

        let backendUrl = process.env.LANGGRAPH_API_URL || "https://reflexion-staging.up.railway.app";
        if (backendUrl.endsWith("/")) backendUrl = backendUrl.slice(0, -1);

        const targetUrl = `${backendUrl}/project/diff?${params.toString()}`;

        // Extract organization context from headers
        const orgContext = req.headers.get("X-Organization-Context");

        const headers: Record<string, string> = {
            "Authorization": `Bearer ${session.user.idToken}`,
            "Content-Type": "application/json",
        };

        if (orgContext) {
            headers["X-Organization-Context"] = orgContext;
        }

        console.log(`[PROXY] Fetching KG diff from ${targetUrl}`);

        const controller = new AbortController();
        const timeoutMs = Number(process.env.PROJECT_DIFF_TIMEOUT_MS) || 60_000;
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const resp = await fetch(targetUrl, {
            headers,
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!resp.ok) {
            const errorText = await resp.text();
            console.error(`[PROXY] Backend error: ${resp.status} - ${errorText}`);
            return NextResponse.json({ error: "Backend error" }, { status: resp.status });
        }

        const data = await resp.json();
        return NextResponse.json(data, {
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            }
        });

    } catch (error: any) {
        const cause = error?.cause;
        const code = cause?.code ?? cause?.errno;
        const isReset = code === "ECONNRESET" || code === -104 || error?.name === "AbortError";

        if (isReset || code === "ECONNREFUSED" || code === "ETIMEDOUT") {
            console.error("[PROXY] KG Diff fetch failed (connection):", code ?? error?.message, error);
            const message =
                error?.name === "AbortError"
                    ? "Backend timeout"
                    : "Backend connection reset or unreachable. Try again.";
            return NextResponse.json({ error: message, code: code ?? "FETCH_FAILED" }, { status: 502 });
        }
        console.error("[PROXY] KG Diff fetch failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
