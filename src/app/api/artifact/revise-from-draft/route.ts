import { NextResponse } from "next/server";
import { getSessionSafe } from "@/auth";
import { getBackendBaseUrl } from "@/lib/backend-proxy";

/**
 * Proxy to backend POST /artifact/revise-from-draft (Edit with me / M4).
 * Sends current draft content and user instruction; returns revised markdown
 * and backend updates draft in KG when cache_key is provided.
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
    const instruction = typeof body?.instruction === "string" ? body.instruction : "";

    if (!cacheKey || cacheKey === "") {
      return NextResponse.json({ error: "Missing cache_key" }, { status: 400 });
    }
    if (!instruction.trim()) {
      return NextResponse.json({ error: "instruction required" }, { status: 400 });
    }

    const threadId = body?.thread_id ?? null;
    const backendUrl = getBackendBaseUrl();
    const targetUrl = `${backendUrl}/artifact/revise-from-draft`;

    const orgContext = req.headers.get("X-Organization-Context");

    const headers: Record<string, string> = {
      Authorization: `Bearer ${session.user.idToken}`,
      "Content-Type": "application/json",
    };

    if (orgContext) {
      headers["X-Organization-Context"] = orgContext;
    }

    const resp = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        cache_key: cacheKey,
        thread_id: threadId,
        content,
        instruction: instruction.trim(),
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      const detail = (err as { detail?: string }).detail ?? "Backend error";
      return NextResponse.json({ error: detail }, { status: resp.status });
    }

    const data = await resp.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[PROXY] revise-from-draft failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
