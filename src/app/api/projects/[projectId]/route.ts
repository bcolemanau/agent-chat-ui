import { NextResponse } from "next/server";
import { getSessionSafe } from "@/auth";
import { getBackendBaseUrl } from "@/lib/backend-proxy";

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const session = await getSessionSafe();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { projectId } = await params;
        if (!projectId) {
            return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
        }

        const body = await req.json();
        const name = typeof body?.name === "string" ? body.name.trim() : "";
        if (!name) {
            return NextResponse.json({ error: "name is required and cannot be empty" }, { status: 400 });
        }

        const baseUrl = getBackendBaseUrl();
        const targetUrl = `${baseUrl}/kg/projects/${encodeURIComponent(projectId)}`;

        const orgContext = req.headers.get("X-Organization-Context");
        const headers: Record<string, string> = {
            Authorization: `Bearer ${session.user.idToken}`,
            "Content-Type": "application/json",
        };
        if (orgContext) headers["X-Organization-Context"] = orgContext;

        const resp = await fetch(targetUrl, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ name }),
        });

        if (!resp.ok) {
            const errorText = await resp.text();
            console.error(`[PROXY] Backend error (patch project): ${resp.status} - ${errorText}`);
            return NextResponse.json({ error: "Backend error" }, { status: resp.status });
        }

        const data = await resp.json();
        return NextResponse.json(data);
    } catch (error: unknown) {
        console.error("[PROXY] Project patch failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
