import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { getBackendBaseUrl } from "@/lib/backend-proxy";

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const nodeId = searchParams.get("node_id");
        const version = searchParams.get("version");
        const threadId = searchParams.get("thread_id") || "default";

        if (!nodeId) {
            return NextResponse.json({ error: "Missing node_id" }, { status: 400 });
        }

        const backendUrl = getBackendBaseUrl();

        let targetUrl = `${backendUrl}/artifact/content?node_id=${nodeId}&thread_id=${threadId}`;
        if (version) targetUrl += `&version=${version}`;

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
            const errorText = await resp.text();
            return NextResponse.json({ error: "Backend error" }, { status: resp.status });
        }

        const data = await resp.json();
        return NextResponse.json(data);

    } catch (error: any) {
        console.error("[PROXY] Artifact content failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
