import { NextRequest, NextResponse } from "next/server";
import { getSessionSafe } from "@/auth";

// This file acts as a proxy for requests to your LangGraph server.
// We use a custom implementation to ensure the client's JWT token is forwarded correctly.
// Middleware: Automatically injects Google auth token from NextAuth session.

const BACKEND_URL = (process.env.LANGGRAPH_API_URL ?? "https://reflexion-staging.up.railway.app").replace(/\/+$/, "");

/** Last time we logged session size (throttle to ~once per minute). */
let lastSessionSizeLog = 0;
const SESSION_SIZE_LOG_INTERVAL_MS = 60_000;

/** Unbuffered write so Docker/local logs show up (stdout can be buffered when not a TTY). */
function debugLog(msg: string) {
  const line = `[DEBUG] ${msg}\n`;
  process.stdout.write(line);
  process.stderr.write(line);
}

async function proxyRequest(req: NextRequest, method: string) {
  try {
    // Path: everything after /api/ (strip /api so backend gets /artifact/..., /threads/..., etc.)
    const rawPath = req.nextUrl.pathname.replace(/^\/api\/?/, "") || "";
    const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
    // Debug: always log so we see output on every catch-all request (Docker/local)
    debugLog(`catch-all proxyRequest ${method} ${path}`);

    // Construct backend URL (no double slash; getBackendBaseUrl normalizes hostname-only env to https://).
    const baseUrl = getBackendBaseUrl();
    const backendUrl = `${baseUrl}${path}${req.nextUrl.search}`;
    
    // List of endpoints that don't require auth (matches backend proxy_server.py exclusions)
    const publicEndpoints = [
      "/health",
      "/ok",
      "/info",
      "/auth/token",
    ];
    const publicPrefixes = [
      "/static/",
      "/ui/",
    ];
    
    // Check if this endpoint should be excluded from auth
    const isPublicEndpoint = publicEndpoints.includes(path) ||
      publicPrefixes.some(prefix => path.startsWith(prefix)) ||
      method === "OPTIONS"; // OPTIONS preflight requests
    
    // Middleware: Get backend JWT from NextAuth session (skip for public endpoints)
    let sessionToken: string | null = null;
    if (!isPublicEndpoint) {
      const session = await getSessionSafe();
      if (session?.user?.idToken) {
        sessionToken = session.user.idToken;
        console.log("[PROXY] Middleware: Injected JWT from session");
        // Log session size periodically (throttled) to help debug cookie/JWT_SESSION_ERROR
        const authDebug = process.env.NODE_ENV !== "production" || process.env.AUTH_DEBUG === "true";
        if (authDebug && Date.now() - lastSessionSizeLog >= SESSION_SIZE_LOG_INTERVAL_MS) {
          lastSessionSizeLog = Date.now();
          const idTokenBytes = new Blob([sessionToken]).size;
          const sessionJsonBytes = new Blob([JSON.stringify(session)]).size;
          const limit = 4096;
          console.log(
            "[PROXY] session size: idToken=%s bytes, session≈%s bytes, 4KB limit=%s",
            idTokenBytes,
            sessionJsonBytes,
            sessionJsonBytes > limit ? "OVER" : "ok"
          );
        }
      }
    } else {
      console.debug(`[PROXY] Middleware: Skipping auth for public endpoint: ${path}`);
    }
    
    // Get client's auth header (JWT token from session)
    const clientApiKey = req.headers.get("X-Api-Key");
    const clientAuth = req.headers.get("Authorization");
    
    // Prepare headers - forward all headers from client, but prioritize client's auth
    const headers = new Headers();
    
    // Forward all headers from client request
    req.headers.forEach((value, key) => {
      // Skip host header (will be set by fetch)
      if (key.toLowerCase() !== "host") {
        headers.set(key, value);
      }
    });
    
    // Middleware: Inject session token if available (takes precedence over client headers)
    if (sessionToken) {
      headers.set("Authorization", `Bearer ${sessionToken}`);
      headers.set("X-Api-Key", sessionToken); // Also set as X-Api-Key for compatibility
      // Log token last4 when AUTH_DEBUG=true (or in dev) to verify header / compare with backend
      const authDebug = process.env.NODE_ENV !== "production" || process.env.AUTH_DEBUG === "true";
      if (authDebug && sessionToken.length >= 4) {
        console.log("[PROXY] JWT token: len=%s, last4=%s (catch-all proxy)", sessionToken.length, sessionToken.slice(-4));
      }
    } else {
      // Fallback to client's auth headers if no session token
      if (clientApiKey) {
        headers.set("X-Api-Key", clientApiKey);
      }
      if (clientAuth) {
        headers.set("Authorization", clientAuth);
      }
    }
    
    // If no auth at all, use fallback (shouldn't happen in production)
    if (!sessionToken && !clientApiKey && !clientAuth) {
      const fallbackKey = process.env.LANGSMITH_API_KEY;
      if (fallbackKey && fallbackKey !== "remove-me") {
        headers.set("X-Api-Key", fallbackKey);
      }
    }
    
    // Get request body if present
    let body: BodyInit | undefined;
    if (method !== "GET" && method !== "HEAD") {
      try {
        body = await req.text();
      } catch {
        // No body
      }
    }
    
    // Make request to backend
    const response = await fetch(backendUrl, {
      method,
      headers,
      body,
    });

    if (response.status === 404) {
      debugLog(`catch-all backend 404: ${method} ${backendUrl}`);
    }

    // Stream-through: do not buffer streaming responses (e.g. POST /threads/{id}/runs/stream).
    // Buffering with response.text() would wait for the entire LangGraph run to finish before
    // returning, so the UI would appear stuck and time out; piping response.body returns chunks
    // as they arrive so the frontend can show progress and complete when the run ends.
    const contentType = response.headers.get("Content-Type") || "";
    const isStream =
      path.includes("/stream") ||
      contentType.includes("text/event-stream") ||
      contentType.includes("application/x-ndjson");

    if (isStream && response.body != null) {
      const responseHeaders: Record<string, string> = {
        "Content-Type": contentType || "application/json",
      };
      if (response.headers.get("Cache-Control"))
        responseHeaders["Cache-Control"] = response.headers.get("Cache-Control")!;
      if (response.headers.get("Access-Control-Allow-Origin"))
        responseHeaders["Access-Control-Allow-Origin"] = response.headers.get("Access-Control-Allow-Origin")!;
      if (response.headers.get("Access-Control-Allow-Methods"))
        responseHeaders["Access-Control-Allow-Methods"] = response.headers.get("Access-Control-Allow-Methods")!;
      if (response.headers.get("Access-Control-Allow-Headers"))
        responseHeaders["Access-Control-Allow-Headers"] = response.headers.get("Access-Control-Allow-Headers")!;
      return new NextResponse(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    }

    // Non-streaming: buffer and return (original behavior)
    const responseBody = await response.text();
    return new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json",
        ...(response.headers.get("Access-Control-Allow-Origin") && {
          "Access-Control-Allow-Origin": response.headers.get("Access-Control-Allow-Origin")!,
        }),
        ...(response.headers.get("Access-Control-Allow-Methods") && {
          "Access-Control-Allow-Methods": response.headers.get("Access-Control-Allow-Methods")!,
        }),
        ...(response.headers.get("Access-Control-Allow-Headers") && {
          "Access-Control-Allow-Headers": response.headers.get("Access-Control-Allow-Headers")!,
        }),
      },
    });
  } catch (error) {
    console.error("[PROXY] Error proxying request:", error);
    return NextResponse.json(
      { error: "Failed to proxy request", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return proxyRequest(req, "GET");
}

export async function POST(req: NextRequest) {
  return proxyRequest(req, "POST");
}

export async function PUT(req: NextRequest) {
  return proxyRequest(req, "PUT");
}

export async function PATCH(req: NextRequest) {
  return proxyRequest(req, "PATCH");
}

export async function DELETE(req: NextRequest) {
  return proxyRequest(req, "DELETE");
}

export async function OPTIONS(req: NextRequest) {
  return proxyRequest(req, "OPTIONS");
}
