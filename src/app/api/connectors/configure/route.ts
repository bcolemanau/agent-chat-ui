import { NextResponse } from "next/server";
import { getSessionSafe } from "@/auth";
import { getBackendBaseUrl } from "@/lib/backend-proxy";

/** Proxy to backend POST /connectors/configure (admin only). Issue 154. */
export async function POST(req: Request) {
  try {
    const session = await getSessionSafe();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as {
      org_id: string;
      artifact_id: string;
      project_id?: string;
      type_id: string;
      config: Record<string, unknown>;
    };
    if (!body.org_id || !body.artifact_id || !body.type_id || !body.config) {
      return NextResponse.json(
        { error: "Missing org_id, artifact_id, type_id, or config" },
        { status: 400 }
      );
    }

    const backendUrl = getBackendBaseUrl();
    const orgContext = req.headers.get("X-Organization-Context");
    const headers: Record<string, string> = {
      Authorization: `Bearer ${session.user.idToken}`,
      "Content-Type": "application/json",
    };
    if (orgContext) headers["X-Organization-Context"] = orgContext;

    const resp = await fetch(`${backendUrl}/connectors/configure`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.error("[PROXY] Connectors configure failed:", resp.status, text);
      return NextResponse.json({ error: "Backend error" }, { status: resp.status });
    }
    const data = await resp.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("[PROXY] Connectors configure failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
