import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { proxyBackendGet } from "@/lib/backend-proxy";

/**
 * Proxy GET /workflow to the backend. In the Reflexion Docker image, proxy and LangGraph
 * run in one container; the same LANGGRAPH_API_URL serves both (proxy_server exposes GET /workflow).
 * Local Docker: LANGGRAPH_API_URL points at the proxy (e.g. http://host.docker.internal:8080).
 * Staging: set LANGGRAPH_API_URL to the Reflexion backend URL (the proxy), not a LangGraph-only port.
 */
export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    return proxyBackendGet(req, "/workflow", { session, logLabel: "Workflow diagram" });
}
