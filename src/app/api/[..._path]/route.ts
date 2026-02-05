import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

// This file acts as a proxy for requests to your LangGraph server.
// We use a custom implementation to ensure the client's JWT token is forwarded correctly.
// Middleware: Automatically injects Google auth token from NextAuth session.

const BACKEND_URL = process.env.LANGGRAPH_API_URL ?? "https://reflexion-staging.up.railway.app";

/** Unbuffered write so Docker/local logs show up (stdout can be buffered when not a TTY). */
function debugLog(msg: string) {
  const line = `[DEBUG] ${msg}\n`;
  process.stdout.write(line);
  process.stderr.write(line);
}

async function proxyRequest(req: NextRequest, method: string) {
  try {
    // Get the path from the request (everything after /api/)
    const path = req.nextUrl.pathname.replace(/^\/api/, "");
    // Debug: always log so we see output on every catch-all request (Docker/local)
    debugLog(`catch-all proxyRequest ${method} ${path}`);

    // Construct backend URL
    const backendUrl = `${BACKEND_URL}${path}${req.nextUrl.search}`;
    
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
    
    // Middleware: Get Google auth token from NextAuth session (skip for public endpoints)
    let sessionToken: string | null = null;
    if (!isPublicEndpoint) {
      try {
        const session = await getServerSession(authOptions);
        if (session?.user?.idToken) {
          sessionToken = session.user.idToken;
          console.log("[PROXY] Middleware: Injected Google auth token from session");
        }
      } catch {
        // Auth is optional for some endpoints
        console.debug("[PROXY] Middleware: No session available");
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
    
    // Create response with backend's response
    const responseBody = await response.text();
    
    return new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json",
        // Forward CORS headers if present
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
