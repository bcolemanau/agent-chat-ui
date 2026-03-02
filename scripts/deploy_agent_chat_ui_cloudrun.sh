#!/usr/bin/env bash
# Deploy agent-chat-ui to Cloud Run.
# Prereqs: gcloud CLI, project set. Container Registry API enabled.
# Env: GOOGLE_CLOUD_PROJECT, GCP_PROXY_CHAT_URL, NEXTAUTH_URL, NEXTAUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${GOOGLE_CLOUD_LOCATION:-us-central1}"
SERVICE_NAME="agent-chat-ui"

if [ -z "$PROJECT_ID" ]; then
  echo "Set GOOGLE_CLOUD_PROJECT or run: gcloud config set project PROJECT_ID"
  exit 1
fi

BUILD_ARG="${NEXT_PUBLIC_GCP_PROXY_CHAT_ENABLED:-true}"
echo "Deploying agent-chat-ui to Cloud Run: project=$PROJECT_ID region=$REGION"
echo "Build arg NEXT_PUBLIC_GCP_PROXY_CHAT_ENABLED=$BUILD_ARG"

cd "$REPO_ROOT"

gcloud builds submit --config=cloudbuild.yaml . \
  --project "$PROJECT_ID" \
  --substitutions="_NEXT_PUBLIC_GCP_PROXY_CHAT_ENABLED=$BUILD_ARG,_TAG=latest"

ENV_VARS="NODE_ENV=production"
[ -n "$NEXTAUTH_URL" ] && ENV_VARS="$ENV_VARS,NEXTAUTH_URL=$NEXTAUTH_URL"
[ -n "$NEXTAUTH_SECRET" ] && ENV_VARS="$ENV_VARS,NEXTAUTH_SECRET=$NEXTAUTH_SECRET"
[ -n "$REFLEXION_JWT_SECRET" ] && ENV_VARS="$ENV_VARS,REFLEXION_JWT_SECRET=$REFLEXION_JWT_SECRET"
[ -n "$AUTH_GOOGLE_ID" ] && ENV_VARS="$ENV_VARS,AUTH_GOOGLE_ID=$AUTH_GOOGLE_ID"
[ -n "$AUTH_GOOGLE_SECRET" ] && ENV_VARS="$ENV_VARS,AUTH_GOOGLE_SECRET=$AUTH_GOOGLE_SECRET"
[ -n "$GCP_PROXY_CHAT_URL" ] && ENV_VARS="$ENV_VARS,GCP_PROXY_CHAT_URL=$GCP_PROXY_CHAT_URL"
[ -n "$GCP_PROXY_JWT" ] && ENV_VARS="$ENV_VARS,GCP_PROXY_JWT=$GCP_PROXY_JWT"
[ -n "$NEXT_PUBLIC_API_URL" ] && ENV_VARS="$ENV_VARS,NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL"

gcloud run deploy "$SERVICE_NAME" \
  --image "gcr.io/$PROJECT_ID/$SERVICE_NAME:latest" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars "$ENV_VARS"

URL=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)' 2>/dev/null || true)
echo ""
echo "Deployed. UI URL: $URL"
echo ""
echo "Next steps:"
echo "1. Add to Google OAuth Authorized redirect URIs: $URL/api/auth/callback/google"
echo "2. If NEXTAUTH_URL was not set, update: gcloud run services update $SERVICE_NAME --region $REGION --set-env-vars NEXTAUTH_URL=$URL"
echo "3. Ensure NEXTAUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET are set (use Secret Manager for production)"
