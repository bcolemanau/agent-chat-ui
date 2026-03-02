# Deploy agent-chat-ui to Cloud Run.
# Prereqs: gcloud CLI, project set. Container Registry API enabled (gcr.io).
# Env: $env:GOOGLE_CLOUD_PROJECT, $env:GCP_PROXY_CHAT_URL (proxy root for /api/chat)
# Build-time: NEXT_PUBLIC_GCP_PROXY_CHAT_ENABLED (default true for GCP proxy chat)
# Runtime: NEXTAUTH_URL (set after first deploy to your Cloud Run URL), NEXTAUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET

$ErrorActionPreference = "Stop"
$RepoRoot = (Get-Item (Split-Path -Parent $PSScriptRoot)).FullName

$ProjectId = $env:GOOGLE_CLOUD_PROJECT
if (-not $ProjectId) {
  $ProjectId = (gcloud config get-value project 2>$null)
}
$Region = if ($env:GOOGLE_CLOUD_LOCATION) { $env:GOOGLE_CLOUD_LOCATION } else { "us-central1" }
$ServiceName = "agent-chat-ui"

if (-not $ProjectId) {
  Write-Host "Set GOOGLE_CLOUD_PROJECT or run: gcloud config set project PROJECT_ID"
  exit 1
}

$ProxyUrl = $env:GCP_PROXY_CHAT_URL
$BuildArg = if ($env:NEXT_PUBLIC_GCP_PROXY_CHAT_ENABLED -eq "false") { "false" } else { "true" }

Write-Host "Deploying agent-chat-ui to Cloud Run: project=$ProjectId region=$Region"
Write-Host "Build arg NEXT_PUBLIC_GCP_PROXY_CHAT_ENABLED=$BuildArg"

Push-Location $RepoRoot
try {
  # Build with Cloud Build (supports build args)
  gcloud builds submit --config=cloudbuild.yaml . `
    --project $ProjectId `
    --substitutions="_NEXT_PUBLIC_GCP_PROXY_CHAT_ENABLED=$BuildArg,_TAG=latest"

  if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed."
    exit 1
  }

  # Runtime env vars (secrets should be set in Cloud Run console or Secret Manager)
  $envVars = "NODE_ENV=production"
  if ($env:NEXTAUTH_URL) { $envVars += ",NEXTAUTH_URL=$env:NEXTAUTH_URL" }
  if ($env:NEXTAUTH_SECRET) { $envVars += ",NEXTAUTH_SECRET=$env:NEXTAUTH_SECRET" }
  if ($env:REFLEXION_JWT_SECRET) { $envVars += ",REFLEXION_JWT_SECRET=$env:REFLEXION_JWT_SECRET" }
  if ($env:AUTH_GOOGLE_ID) { $envVars += ",AUTH_GOOGLE_ID=$env:AUTH_GOOGLE_ID" }
  if ($env:AUTH_GOOGLE_SECRET) { $envVars += ",AUTH_GOOGLE_SECRET=$env:AUTH_GOOGLE_SECRET" }
  if ($ProxyUrl) { $envVars += ",GCP_PROXY_CHAT_URL=$ProxyUrl" }
  if ($env:GCP_PROXY_JWT) { $envVars += ",GCP_PROXY_JWT=$env:GCP_PROXY_JWT" }
  if ($env:NEXT_PUBLIC_API_URL) { $envVars += ",NEXT_PUBLIC_API_URL=$env:NEXT_PUBLIC_API_URL" }
  if ($env:LANGGRAPH_API_URL) { $envVars += ",LANGGRAPH_API_URL=$env:LANGGRAPH_API_URL" }

  $image = "gcr.io/$ProjectId/${ServiceName}:latest"
  gcloud run deploy $ServiceName `
    --image $image `
    --region $Region `
    --project $ProjectId `
    --platform managed `
    --allow-unauthenticated `
    --port 8080 `
    --set-env-vars $envVars

  if ($LASTEXITCODE -eq 0) {
    $Url = (gcloud run services describe $ServiceName --region $Region --project $ProjectId --format="value(status.url)" 2>$null)
    Write-Host ""
    Write-Host "Deployed. UI URL: $Url"
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "1. Add to Google OAuth Authorized redirect URIs: $Url/api/auth/callback/google"
    Write-Host "2. If NEXTAUTH_URL was not set, update the service:"
    Write-Host "   gcloud run services update $ServiceName --region $Region --set-env-vars NEXTAUTH_URL=$Url"
    Write-Host "3. Ensure NEXTAUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET are set (use Secret Manager for production)"
  }
} finally {
  Pop-Location
}
