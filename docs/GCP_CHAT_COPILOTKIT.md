# GCP / Agent Engine Chat (Phase 3)

Minimal chat UI that talks to a CopilotKit (AG-UI) backend—either the self-hosted runtime in this app or a future Vertex AI Agent Engine AG-UI endpoint.

## What’s in place

- **Route:** `/workbench/gcp-chat`
- **Runtime:** `POST /api/copilotkit` (CopilotKit self-hosted runtime)
- **Client:** CopilotKit React (`CopilotChat`) with `runtimeUrl` set from env or default `/api/copilotkit`

## Env

| Variable | Purpose |
|----------|--------|
| `OPENAI_API_KEY` | Used by `/api/copilotkit` when using the built-in OpenAIAdapter. |
| `COPILOTKIT_OPENAI_MODEL` | Optional. Default `gpt-4o-mini`. |
| `NEXT_PUBLIC_AGENT_ENGINE_AG_UI_URL` | Optional. If set, CopilotKit uses this as `runtimeUrl` instead of `/api/copilotkit` (e.g. when Vertex Agent Engine exposes an AG-UI endpoint). |

## How to run

1. Set `OPENAI_API_KEY` (for the default self-hosted runtime).
2. Start the app: `pnpm dev`.
3. Open **http://localhost:3000/workbench/gcp-chat**.

## Future: Vertex Agent Engine

When the Reflexion ADK app is deployed to Vertex AI Agent Engine (see Reflexion repo `docs/ADK_DEPLOY_AGENT_ENGINE.md`), you can:

- Use the Agent Engine URL as the AG-UI backend **if** it exposes an AG-UI-compatible endpoint; set `NEXT_PUBLIC_AGENT_ENGINE_AG_UI_URL` to that URL.
- Otherwise, put an AG-UI proxy in front of Agent Engine (Phase 4) and point `NEXT_PUBLIC_AGENT_ENGINE_AG_UI_URL` at the proxy.

No login is required on this page for quick validation.
