# Deploy agent-chat-ui to Cloud Run

## Build notes

The Dockerfile strips `patchedDependencies` (the CopilotKit patch fails on current versions) and adds `@ag-ui/client` override to avoid type mismatches. GCP proxy chat does not use the patch.

## Prerequisites

- gcloud CLI installed and authenticated
- Project set: `gcloud config set project PROJECT_ID` or `GOOGLE_CLOUD_PROJECT`
- APIs enabled: Cloud Build, Cloud Run, Container Registry (or Artifact Registry)

## Environment variables

**Build-time** (baked into the client):

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_GCP_PROXY_CHAT_ENABLED` | Set to `true` (default) to enable GCP proxy chat on `/gcp-chat`. Set to `false` to use CopilotKit instead. |

**Runtime** (set on the Cloud Run service):

| Variable | Purpose |
|----------|---------|
| `NEXTAUTH_URL` | Your deployed URL (e.g. `https://agent-chat-ui-xxx.run.app`). Set after first deploy. |
| `NEXTAUTH_SECRET` | Session signing secret. Generate with `openssl rand -base64 32`. |
| `AUTH_GOOGLE_ID` | Google OAuth client ID. |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret. |
| `GCP_PROXY_CHAT_URL` | Proxy root URL (e.g. `https://gcp-proxy-xxx.run.app`) for GCP Chat → Agent Engine. |
| `GCP_PROXY_JWT` | Optional. If the proxy requires JWT, set this. |
| `LANGGRAPH_API_URL` | Reflexion/LangGraph backend URL for workbench, map, etc. Default: `https://reflexion-staging.up.railway.app`. Set if you use a different backend. |
| `REFLEXION_JWT_SECRET` | Optional. If using backend auth, match the backend. |

## Deploy

**PowerShell:**

```powershell
$env:GOOGLE_CLOUD_PROJECT = "your-project-id"
$env:GCP_PROXY_CHAT_URL = "https://gcp-proxy-xxx.run.app"
$env:NEXTAUTH_SECRET = "your-secret"   # openssl rand -base64 32
$env:AUTH_GOOGLE_ID = "your-client-id"
$env:AUTH_GOOGLE_SECRET = "your-client-secret"
# NEXTAUTH_URL: set after first deploy to your Cloud Run URL
.\scripts\deploy_agent_chat_ui_cloudrun.ps1
```

**Bash:**

```bash
export GOOGLE_CLOUD_PROJECT=your-project-id
export GCP_PROXY_CHAT_URL=https://gcp-proxy-xxx.run.app
export NEXTAUTH_SECRET=your-secret
export AUTH_GOOGLE_ID=your-client-id
export AUTH_GOOGLE_SECRET=your-client-secret
./scripts/deploy_agent_chat_ui_cloudrun.sh
```

## First deploy (chicken-and-egg)

1. Deploy without `NEXTAUTH_URL` (or with a placeholder). The script will output the URL.
2. Add `https://YOUR-URL.run.app/api/auth/callback/google` to Google OAuth **Authorized redirect URIs**.
3. Update the service: `gcloud run services update agent-chat-ui --region us-central1 --set-env-vars NEXTAUTH_URL=https://YOUR-URL.run.app`
4. Restart the service or wait for the next request.

## Production: use Secret Manager

For production, store secrets in Secret Manager and reference them in Cloud Run:

```bash
gcloud run services update agent-chat-ui \
  --region us-central1 \
  --set-secrets=NEXTAUTH_SECRET=nextauth-secret:latest,AUTH_GOOGLE_SECRET=google-secret:latest
```
