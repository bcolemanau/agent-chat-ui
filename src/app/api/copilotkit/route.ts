
/**
 * CopilotKit runtime endpoint for GCP / Agent Engine chat (Phase 3).
 * Self-hosted AG-UI backend. Set OPENAI_API_KEY for chat.
 *
 * Runtime is lazy-loaded (dynamic import) so the heavy CopilotKit bundle
 * compiles only when /api/copilotkit is first called, not when the page loads.
 */
import { NextRequest } from "next/server";

const model = process.env.COPILOTKIT_OPENAI_MODEL ?? "gpt-4o-mini";

let cachedHandleRequest: ((req: NextRequest) => Promise<Response>) | null = null;

async function getHandleRequest(): Promise<(req: NextRequest) => Promise<Response>> {
  if (cachedHandleRequest) return cachedHandleRequest;
  const [
    { CopilotRuntime, copilotRuntimeNextJSAppRouterEndpoint },
    { BuiltInAgent },
  ] = await Promise.all([
    import("@copilotkit/runtime"),
    import("@copilotkitnext/agent"),
  ]);
  // Do not pass serviceAdapter: when present, the runtime replaces agents with a Promise,
  // and the client's runtime sync (/info or GraphQL) then sees no agents ("Agent 'default' not found").
  // With only agents: { default: BuiltInAgent }, runtime.agents stays synchronous and sync works.
  // BuiltInAgent uses OPENAI_API_KEY for chat. Our pnpm patch adds optional chaining for telemetry.
  const runtime = new CopilotRuntime({
    agents: {
      default: new BuiltInAgent({ model: `openai/${model}` }) as any,
    },
  });
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    endpoint: "/api/copilotkit",
  });
  cachedHandleRequest = (req) => Promise.resolve(handleRequest(req));
  return cachedHandleRequest;
}

export const maxDuration = 60;

export async function GET() {
  return new Response(
    JSON.stringify({ ok: true, message: "CopilotKit runtime; use POST for chat." }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.warn(
      "[CopilotKit] 503: OPENAI_API_KEY is missing or empty. Set it in .env.local (e.g. OPENAI_API_KEY=sk-proj-...) and restart the dev server."
    );
    return new Response(
      JSON.stringify({
        error: "AI_LoadAPIKeyError",
        message:
          "OpenAI API key is missing. Set OPENAI_API_KEY in .env or .env.local and restart the dev server. See docs/GCP_COPILOTKIT_CHAT.md.",
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
  try {
    const handleRequest = await getHandleRequest();
    return await handleRequest(req);
  } catch (err) {
    console.error("[CopilotKit] POST error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({
        error: "CopilotKitRuntimeError",
        message: message || "Runtime request failed. Check server logs.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
