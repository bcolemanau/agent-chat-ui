import { NextResponse } from "next/server";

const DEFAULT_BACKEND = "https://reflexion-staging.up.railway.app";

/**
 * Backend base URL (no trailing slash). Used by API routes that proxy to the Reflexion backend.
 */
export function getBackendBaseUrl(): string {
    const url = process.env.LANGGRAPH_API_URL || DEFAULT_BACKEND;
    return url.endsWith("/") ? url.slice(0, -1) : url;
}

/**
 * Headers for proxied requests: Authorization (Bearer session), Content-Type, and optional X-Organization-Context.
 */
export function getProxyHeaders(
    session: { user: { idToken?: string | null } },
    req: Request
): Record<string, string> {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${session.user.idToken}`,
        "Content-Type": "application/json",
    };
    const orgContext = req.headers.get("X-Organization-Context");
    if (orgContext) headers["X-Organization-Context"] = orgContext;
    return headers;
}

export type ProxyGetOptions = {
    session: { user: { idToken?: string | null } } | null;
    /** Label for log messages (e.g. "Workflow diagram") */
    logLabel?: string;
    /** If true, forward request URL search params to the backend path. Default true. */
    forwardSearchParams?: boolean;
};

/**
 * Proxy GET to the backend: require session, build URL (path + optional query), fetch, return JSON or error response.
 */
export async function proxyBackendGet(
    req: Request,
    backendPath: string,
    options: ProxyGetOptions
): Promise<NextResponse> {
    const { session, logLabel = "Backend", forwardSearchParams = true } = options;
    if (!session?.user?.idToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const baseUrl = getBackendBaseUrl();
    const query = forwardSearchParams ? new URL(req.url).searchParams.toString() : "";
    const targetUrl = query ? `${baseUrl}${backendPath}?${query}` : `${baseUrl}${backendPath}`;
    const headers = getProxyHeaders(session, req);

    try {
        const resp = await fetch(targetUrl, { headers });
        if (!resp.ok) {
            const errorText = await resp.text();
            console.error(`[PROXY] ${logLabel} error: ${resp.status} - ${errorText}`);
            return NextResponse.json({ error: "Backend error" }, { status: resp.status });
        }
        const data = await resp.json();
        return NextResponse.json(data);
    } catch (error: unknown) {
        console.error(`[PROXY] ${logLabel} fetch failed:`, error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
