# Proxy routes summary and correctness review

All UI API routes under `/api/*` either (1) **proxy** to the Reflexion/LangGraph backend (`LANGGRAPH_API_URL`) or (2) are **local-only** (NextAuth, health, LangSmith config, etc.). This doc lists routes and their backend path mapping.

---

## 1. Catch-all proxy (`/api/[..._path]`)

**File:** `src/app/api/[..._path]/route.ts`  
**Behavior:** Strips `/api` or `/api/` from the request path, ensures one leading slash, forwards to `BACKEND_URL + path` with same method and body. Uses `LANGGRAPH_API_URL` (trimmed of trailing slash).

**Path construction (current):**
- `rawPath = pathname.replace(/^\/api\/?/, "")` → e.g. `/api/artifact/link/apply` → `artifact/link/apply`
- `path = rawPath.startsWith("/") ? rawPath : "/" + rawPath` → `/artifact/link/apply`
- `backendUrl = BACKEND_URL + path + search` → no double slash

**Routes that hit the catch-all (no dedicated Next.js route):**

| UI path | Method | Backend path | Backend (proxy_server.py) | OK? |
|--------|--------|--------------|---------------------------|-----|
| /api/artifact/link/apply | POST | /artifact/link/apply | `@app.post("/artifact/link/apply")` | ✓ |
| /api/artifact/link-and-enrich/apply | POST | /artifact/link-and-enrich/apply | `@app.post("/artifact/link-and-enrich/apply")` | ✓ |
| /api/artifact/apply | POST | /artifact/apply | `@app.post("/artifact/apply")` | ✓ |
| /api/hydration/apply | POST | /hydration/apply | `@app.post("/hydration/apply")` | ✓ |
| /api/decisions | GET, POST | /decisions | `@app.get`, `@app.post("/decisions")` | ✓ |
| /api/threads/* | * | /threads/* | (LangGraph, same host) | ✓ |
| /api/auth/* | * | /auth/* | e.g. `/auth/token`, `/auth/organizations`, `/auth/roles`, `/auth/agents`, `/auth/workflows`, `/auth/branding`, etc. | ✓ |
| /api/documents/* | * | /documents/* | `/documents/upload`, `/documents`, `/documents/{id}/download` | ✓ |
| /api/artifacts/upload-folder | POST | /artifacts/upload-folder | `@app.post("/artifacts/upload-folder")` | ✓ |
| /api/openapi.json | GET | /openapi.json | `@app.get("/openapi.json")` | ✓ |
| /api/health | GET | — | **Not catch-all:** see §2 (local-only). | — |
| /api/ok | GET | /ok | `@app.get("/ok")` | ✓ (if no dedicated route) |

**Correctness:** Path and URL construction are correct. Backend receives e.g. `POST /artifact/link/apply` when the UI calls `POST /api/artifact/link/apply`.

---

## 2. Dedicated proxy routes (same backend base URL)

These use `getBackendBaseUrl()` from `@/lib/backend-proxy` (or `LANGGRAPH_API_URL` in one case) and forward to the Reflexion backend. Base URL is normalized (no trailing slash).

| UI route | Method | Backend path | Backend (proxy_server.py) | OK? |
|----------|--------|--------------|---------------------------|-----|
| /api/project/diff | GET | /project/diff | `@app.get("/project/diff")` | ✓ |
| /api/project/history | GET | /project/history | `@app.get("/project/history")` | ✓ |
| /api/project/classification/apply | POST | /project/classification/apply | `@app.post("/project/classification/apply")` | ✓ |
| /api/projects | GET, DELETE | /kg/projects, /kg/projects/{id} | `@app.get("/kg/projects")`, `@app.delete("/kg/projects/{project_id}")` | ✓ |
| /api/projects/[projectId] | PATCH | /kg/projects/{id} | `@app.patch("/kg/projects/{project_id}")` | ✓ |
| /api/kg-data | GET | /kg/data | `@app.get("/kg/data")` | ✓ |
| /api/artifact/content | GET | /artifact/content | `@app.get("/artifact/content")` | ✓ |
| /api/artifact/history | GET | /artifact/history | `@app.get("/artifact/history")` | ✓ |
| /api/artifact/draft-content | GET, POST | /artifact/draft-content | `@app.get`, `@app.post("/artifact/draft-content")` | ✓ |
| /api/artifact/draft-from-existing | POST | /artifact/draft-from-existing | `@app.post("/artifact/draft-from-existing")` | ✓ |
| /api/artifact/revise-from-draft | POST | /artifact/revise-from-draft | `@app.post("/artifact/revise-from-draft")` | ✓ |
| /api/artifacts/[artifactId]/enrichment/[cycleId]/approve | POST | /artifacts/{id}/enrichment/{cycleId}/approve | `@app.post("/artifacts/{artifact_id}/enrichment/{cycle_id}/approve")` | ✓ |
| /api/artifacts/[artifactId]/enrichment/[cycleId]/reject | POST | /artifacts/{id}/enrichment/{cycleId}/reject | `@app.post("/artifacts/.../reject")` | ✓ |
| /api/architecture/diagram/[type] | GET | /architecture/diagram/{type} | `@app.get("/architecture/diagram/{diagram_type}")` | ✓ |
| /api/workflow | GET | /workflow | `@app.get("/workflow")` | ✓ |
| /api/branding | GET | /auth/branding | `@app.get("/auth/branding")` | ✓ |
| /api/info | GET | /info | `@app.get("/info")` | ✓ |

**Note:** `/api/project/diff` uses `process.env.LANGGRAPH_API_URL` directly (with trailing-slash trim); all others use `getBackendBaseUrl()`. Both resolve to the same base URL.

---

## 3. Local-only routes (no backend proxy)

| UI route | Purpose |
|----------|---------|
| /api/health | Next.js app health; returns `{ status: "ok" }`. Does **not** call backend /health. |
| /api/auth/[...nextauth] | NextAuth.js (session, sign-in, etc.). |

---

## 4. Other UI routes (auth, branding, orgs, etc.)

Many under `/api/auth/*`, `/api/branding/*`, `/api/organizations/*` either proxy via **catch-all** to backend `/auth/*`, `/auth/branding/*`, etc., or are implemented as **dedicated** routes that call `getBackendBaseUrl()` + path. Backend paths use `/auth/` prefix (e.g. `/auth/organizations`, `/auth/roles`, `/auth/agents`, `/auth/workflows`, `/auth/branding`, `/auth/branding/{org_id}`). Dedicated `/api/branding` → `/auth/branding` is correct; other `/api/auth/*` paths go through catch-all and become `/auth/*` → correct.

---

## 5. Correctness summary

- **Catch-all:** Path stripping and leading-slash logic are correct. `BACKEND_URL` is trimmed of trailing slashes. No double slash.
- **Dedicated routes:** All use the same base URL (`getBackendBaseUrl()` or `LANGGRAPH_API_URL`) and the backend path matches `proxy_server.py`.
- **Naming:** UI uses `/api/projects` and `/api/kg-data`; backend uses `/kg/projects` and `/kg/data`. Dedicated routes map these explicitly; catch-all is not used for these (so no /kg/projects vs /projects confusion).
- **artifact/link/apply:** No dedicated route; catch-all forwards `POST /api/artifact/link/apply` → `POST /artifact/link/apply`. If 404 persists, the backend at `LANGGRAPH_API_URL` must expose that route (same Reflexion proxy_server or gateway that routes `/artifact/*` to it).

---

## 6. Backend route list (Reflexion proxy_server.py) — quick reference

- **Auth:** /auth/token, /auth/profile, /auth/organizations, /auth/roles, /auth/agents, /auth/agents/{id}, /auth/workflows, /auth/workflows/{id}, /auth/organizations/{org_id}/users, /auth/branding, /auth/branding/{org_id}
- **KG:** /kg/data, /kg/projects, /kg/projects/{project_id}
- **Project:** /project/history, /project/diff, /project/classification/apply
- **Artifact:** /artifact/link/apply, /artifact/apply, /artifact/history, /artifact/content, /artifact/draft-content, /artifact/draft-from-existing, /artifact/revise-from-draft
- **Decisions:** /decisions (GET, POST)
- **Hydration:** /hydration/apply
- **Enrichment:** /artifacts/{id}/enrichment, /artifacts/{id}/enrich, /artifacts/{id}/enrichment/{cycle_id}/approve, /artifacts/{id}/enrichment/{cycle_id}/reject, etc.
- **Other:** /workflow, /architecture/diagram/{type}, /health, /ok, /info, /documents/*, /ui/{assistant_id}, /admin/apply

All of the above are correctly mapped from the UI either via catch-all or dedicated proxy routes.
