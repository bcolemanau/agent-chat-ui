# GCP / Agent Engine chat (Phase 3)

Chat-only UI using CopilotKit talking to a self-hosted runtime (or, when configured, Vertex Agent Engine AG-UI).

## What’s in place

- **Route:** `/workbench/gcp-chat` (linked in workbench sidebar under “GCP Chat” for admins).
- **Runtime:** Next.js API route `/api/copilotkit` (CopilotKit self-hosted AG-UI backend).
- **Adapter:** `OpenAIAdapter` by default; set `OPENAI_API_KEY` (and optionally `COPILOTKIT_OPENAI_MODEL`, default `gpt-4o-mini`).
- **Workbench context:** `WorkbenchContextToAgent` passes `org_id`, `project_id`, `thread_id` via `useCopilotReadable` when in workbench scope. The AG-UI bridge (Phase 2) will use this for KG-aware chat.

## Env (self-hosted runtime)

| Variable | Purpose |
|---------|--------|
| `OPENAI_API_KEY` | Used by `/api/copilotkit` for chat. |
| `COPILOTKIT_OPENAI_MODEL` | Optional; default `gpt-4o-mini`. |
| `NEXT_PUBLIC_AGENT_ENGINE_AG_UI_URL` | If set, CopilotKit uses this as `runtimeUrl` instead of `/api/copilotkit` (e.g. future Agent Engine AG-UI endpoint). |

**If you get 503 from POST /api/copilotkit:** the route returns 503 when `OPENAI_API_KEY` is missing or empty. In `.env.local` use exactly one assignment, no leading `#`, and the value must be only the key (e.g. `OPENAI_API_KEY=sk-proj-...`). Restart the dev server after changing env.

## Using Copilot Cloud instead

To use Copilot Cloud instead of the self-hosted runtime, use the CopilotKit provider with `publicApiKey` (from [Copilot Cloud](https://cloud.copilotkit.ai/)) and omit `runtimeUrl`, or point `NEXT_PUBLIC_AGENT_ENGINE_AG_UI_URL` at their endpoint if they provide one.

## Lock the agent (single-agent mode)

Per [Step 4: Integrate the Agent](https://docs.copilotkit.ai/langgraph/tutorials/ai-travel-app/step-4-integrate-the-agent), when you have a single agent it's best to **lock** requests to that agent. The GCP Chat layout passes `agent="default"` to the CopilotKit provider.

The API route registers **only** a `default` agent via `BuiltInAgent` (no `serviceAdapter`). That keeps `runtime.agents` synchronous so the client's "runtime sync" sees the agent. If we passed a serviceAdapter, the runtime would replace agents with a Promise and the sync could get an empty list ("Agent 'default' not found"). `BuiltInAgent` handles chat using `OPENAI_API_KEY` and the `ai` SDK.

## Patch: “Agent 'default' not found”

CopilotKit’s GraphQL resolvers can return an empty agents list even when a service adapter is configured ([issue #2869](https://github.com/CopilotKit/CopilotKit/issues/2869)). This repo applies a **pnpm patch** to `@copilotkit/runtime` so that when a service adapter is present, the runtime reports a `default` agent. The patch is in `package.json` under `pnpm.patchedDependencies` and in `patches/`. After `pnpm install`, the patch is applied automatically.

## Phase 4: Using the GCP proxy (Agent Engine forward)

The Reflexion repo’s **gcp_proxy** exposes `POST /api/chat` that forwards to Vertex AI Agent Engine `streamQuery`. This UI can talk to it via a local API route that forwards to the proxy.

**Env (agent-chat-ui `.env.local`):**

| Variable | Purpose |
|----------|--------|
| `GCP_PROXY_CHAT_URL` | **Required for proxy mode.** Proxy root URL (e.g. `https://gcp-proxy-xxx.run.app`). Used by `/api/gcp-proxy-chat`. |
| `NEXT_PUBLIC_GCP_PROXY_CHAT_ENABLED` | Set to `true` to show the proxy chat UI on `/gcp-chat` instead of CopilotKit. |
| `GCP_PROXY_JWT` | Optional. If the proxy requires JWT, set this and the route will send it as `Authorization: Bearer <token>`. |

**Steps:**

1. Deploy the proxy to Cloud Run (see Reflexion `docs/GCP_PROXY_PHASE4.md` and `gcp_proxy/README.md`). Set `AGENT_ENGINE_RESOURCE_NAME` (and optional `JWT_SECRET`) on the proxy.
2. In this repo’s `.env.local` set:
   - `GCP_PROXY_CHAT_URL=https://your-proxy-xxx.run.app`
   - `NEXT_PUBLIC_GCP_PROXY_CHAT_ENABLED=true`
3. Restart the dev server. Open `/gcp-chat` — the page will show the proxy chat (messages → `/api/gcp-proxy-chat` → proxy → Agent Engine).

**Deploy agent-chat-ui to Cloud Run:** See [DEPLOY_CLOUD_RUN.md](DEPLOY_CLOUD_RUN.md). Set `GCP_PROXY_CHAT_URL` and `NEXT_PUBLIC_GCP_PROXY_CHAT_ENABLED=true` (build-time) so the deployed UI uses the proxy.

`NEXT_PUBLIC_AGENT_ENGINE_AG_UI_URL` is reserved for a future AG-UI–compatible endpoint; the Phase 4 proxy uses a simple JSON `message` + stream response.

## Note on Vertex Agent Engine AG-UI

Vertex AI Agent Engine may expose an AG-UI-compatible endpoint in the future. Once that URL is available, set `NEXT_PUBLIC_AGENT_ENGINE_AG_UI_URL` so the GCP Chat page can talk to Agent Engine directly. Until then, chat is served by the self-hosted CopilotKit runtime or by the Phase 4 proxy as above.
