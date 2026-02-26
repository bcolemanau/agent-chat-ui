import { NextResponse } from "next/server";
import { getSessionSafe } from "@/auth";
import { getBackendBaseUrl } from "@/lib/backend-proxy";

export async function GET(req: Request) {
    try {
        const session = await getSessionSafe();

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
            await resp.text();
            return NextResponse.json({ error: "Backend error" }, { status: resp.status });
        }

        const data = await resp.json();
        // #region agent log
        fetch('http://127.0.0.1:7258/ingest/16055c50-e65a-4462-80f9-391ad899946b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9026f6'},body:JSON.stringify({sessionId:'9026f6',location:'api/artifact/content/route.ts:GET',message:'Backend content response',data:{nodeId,threadId:threadId||'default',phaseIdPassed:!!searchParams.get("phase_id"),contentLength:data?.content?.length??0,hasContent:!!(data?.content&&String(data.content).trim())},hypothesisId:'H1,H2,H3',timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        return NextResponse.json(data);

    } catch (error: any) {
        console.error("[PROXY] Artifact content failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
