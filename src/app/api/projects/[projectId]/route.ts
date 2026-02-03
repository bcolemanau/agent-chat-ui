import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
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

        const backendUrl = process.env.LANGGRAPH_API_URL || "https://reflexion-staging.up.railway.app";
        const baseUrl = backendUrl.endsWith("/") ? backendUrl.slice(0, -1) : backendUrl;
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
            let body: { error?: string; detail?: string };
            try {
                body = JSON.parse(errorText);
            } catch {
                body = {};
            }
            const status = resp.status === 404 ? 404 : resp.status === 403 ? 403 : resp.status === 409 ? 409 : 502;
            const message = resp.status === 404 ? "Project not found" : (body.detail || body.error || "Backend error");
            return NextResponse.json({ error: message, detail: body.detail }, { status });
        }

        const data = await resp.json();
        return NextResponse.json(data);
    } catch (error: unknown) {
        console.error("[PROXY] Project rename failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
