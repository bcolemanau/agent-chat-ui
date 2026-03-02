# Deployment State (reflexion-484608)

**Last updated:** 2025-02-26

## What's Deployed

| Service | Location | URL |
|---------|----------|-----|
| **ADK Agent** | Vertex AI Agent Engine (us-central1) | Resource: `projects/266553745224/locations/us-central1/reasoningEngines/3447060212542865408` |
| **gcp_proxy** | Cloud Run (reflexion-484608, us-central1) | https://gcp-proxy-266553745224.us-central1.run.app |
| **agent-chat-ui** | Cloud Run (reflexion-484608, us-central1) | https://agent-chat-ui-266553745224.us-central1.run.app |

## Flow

```
User → agent-chat-ui /gcp-chat → /api/gcp-proxy-chat → gcp_proxy /api/chat → Vertex Agent Engine streamQuery
```

## Key Config

### gcp_proxy (Cloud Run)
- `AGENT_ENGINE_RESOURCE_NAME=projects/266553745224/locations/us-central1/reasoningEngines/3447060212542865408`
- `GOOGLE_CLOUD_PROJECT=reflexion-484608`
- `GOOGLE_CLOUD_LOCATION=us-central1`
- Service account: `266553745224-compute@developer.gserviceaccount.com` (has `roles/aiplatform.user`)

### agent-chat-ui (Cloud Run)
- `GCP_PROXY_CHAT_URL=https://gcp-proxy-266553745224.us-central1.run.app`
- `NEXT_PUBLIC_GCP_PROXY_CHAT_ENABLED=true` (build-time) enables proxy chat on `/gcp-chat`

### ADK Agent
- `ADK_STAGING_BUCKET=gs://reflexion-484608-adk-staging`
- Deploy: `python scripts/deploy_adk_to_agent_engine.py` (from Reflexion repo)

## Repos

- **Reflexion-issue-154-org-connector-arch**: ADK agent, gcp_proxy, deploy scripts
- **agent-chat-ui-issue-154-org-connector-arch**: Next.js UI, GCP Chat page
