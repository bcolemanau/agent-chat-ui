import { NextResponse } from "next/server";
import { getSessionSafe } from "@/auth";
import { getBackendBaseUrl } from "@/lib/backend-proxy";

/** Proxy to backend GET /connectors/available (admin only). Issue 154. */
export async function GET(req: Request) {
  try {
    const session = await getSessionSafe();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const backendUrl = getBackendBaseUrl();
    const orgContext = req.headers.get("X-Organization-Context");
    const headers: Record<string, string> = {
      Authorization: `Bearer ${session.user.idToken}`,
      "Content-Type": "application/json",
    };
    if (orgContext) headers["X-Organization-Context"] = orgContext;

    const resp = await fetch(`${backendUrl}/connectors/available`, { headers });
    if (!resp.ok) {
      const text = await resp.text();
      console.error("[PROXY] Connectors available failed:", resp.status, text);
      return NextResponse.json({ error: "Backend error" }, { status: resp.status });
    }
    const data = await resp.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("[PROXY] Connectors available failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
