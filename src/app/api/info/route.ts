import { NextRequest, NextResponse } from "next/server";
import { getSessionSafe } from "@/auth";
import { getBackendBaseUrl } from "@/lib/backend-proxy";

/**
 * API route to proxy /info requests to the backend.
 * This allows the frontend to check LangGraph server status.
 */
export async function GET(req: NextRequest) {
  try {
    // Note: /info endpoint doesn't require auth (it's a health check)
    // getSessionSafe returns null when cookie is invalid (e.g. NEXTAUTH_SECRET changed) so we don't throw
    const session = await getSessionSafe();

    const cleanUrl = getBackendBaseUrl();
    const targetUrl = `${cleanUrl}/info`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add auth if available (optional for /info)
    if (session?.user?.idToken) {
      headers["Authorization"] = `Bearer ${session.user.idToken}`;
    }

    // Add API key if available
    const apiKey = process.env.PROXY_API_KEY;
    if (apiKey) {
      headers["X-Api-Key"] = apiKey;
    }

    const resp = await fetch(targetUrl, { 
      headers,
      cache: 'no-store' // Don't cache health checks
    });

    if (!resp.ok) {
      // Clone response before reading to avoid issues
      const clonedResp = resp.clone();
      let errorText = "";
      try {
        // Check if response is JSON
        const contentType = resp.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          errorText = await clonedResp.json();
        } else {
          // If it's HTML (like 404 page), just get status
          const text = await resp.text();
          // Truncate HTML responses to avoid log spam
          errorText = text.length > 200 ? text.substring(0, 200) + "..." : text;
        }
      } catch {
        errorText = `Backend returned ${resp.status} ${resp.statusText}`;
      }
      console.error(`[API] /info backend error: ${resp.status} - ${typeof errorText === 'string' ? errorText : JSON.stringify(errorText)}`);
      return NextResponse.json(
        { error: "Backend error", details: typeof errorText === 'string' ? errorText : JSON.stringify(errorText) },
        { status: resp.status }
      );
    }

    const data = await resp.json();
    return NextResponse.json(data);
  } catch (error: any) {
    const targetUrl = `${getBackendBaseUrl()}/info`;
    const cause = error?.cause?.code ?? error?.code ?? "unknown";
    console.error("[API] /info proxy failed: url=" + targetUrl + " cause=" + cause, error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
