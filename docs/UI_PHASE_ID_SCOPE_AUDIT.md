# UI phase_id / project_id / org_id scope audit

Backend endpoints that require scope use `require_phase_id_for_scope` (or equivalent) and return **400 MISSING_SCOPE** when `project_id` / `phase_id` / `org_id` are missing. This document lists every UI call site and API route that must pass scope so the backend can resolve it.

**Already fixed (in recent commits):**
- `GET /api/kg-data` – proxy forwards scope; world-map-view sends `project_id` + `org_id`
- `GET /api/project/risk-summary` – proxy forwards `project_id`; world-map-view sends it
- `GET /api/artifact/content` – proxy forwards scope; node-detail-panel and concept-brief-diff-view send `project_id` + `org_id`
- **API routes:** artifact/history, draft-content (GET/POST), draft-from-existing – proxy forwards `project_id`, `phase_id`, `org_id`
- **UI:** node-detail-panel (history, nodes-for-picker, link-nodes, draft-from-existing, POST draft-content), concept-brief-diff-view (draft-content), approval-card (draft-content, artifact/apply, project/history), single-proposal-approval-page (artifact/apply, draft-content, decisions)

---

## 1. API routes – scope forwarding (DONE)

| Route | Backend expects | Status |
|-------|-----------------|--------|
| **GET /api/artifact/history** | `project_id` or `phase_id` (query) | Fixed: proxy forwards `project_id`, `phase_id`, `org_id` |
| **GET /api/artifact/draft-content** | `project_id` or `phase_id` (query) | Fixed: proxy forwards `project_id`, `phase_id`, `org_id` |
| **POST /api/artifact/draft-content** | `project_id` / `phase_id` in body | Fixed: proxy forwards from body |
| **POST /api/artifact/draft-from-existing** | `phase_id` or `project_id` in body | Fixed: proxy forwards from body |

---

## 2. Frontend call sites – scope passed (DONE)

### 2.1–2.8 All addressed
- **node-detail-panel.tsx:** artifact history, nodes-for-picker, link-nodes, draft-from-existing, POST draft-content – all pass `scopeProjectId` / `scopeOrgId`.
- **concept-brief-diff-view.tsx:** GET draft-content – passes `project_id`, `org_id` from `useRouteScope()`.
- **approval-card.tsx:** GET draft-content – passes `scopeProjectId`, `scopeOrgId`; POST artifact/apply – passes `project_id`, `org_id`; `fetchLatestKgVersionSha(threadId, projectId)` accepts `projectId` and uses it for `/api/project/history` when provided.
- **single-proposal-approval-page.tsx:** POST artifact/apply – passes `project_id`, `org_id` from `useRouteScope()`; GET draft-content – passes `project_id`, `org_id`; GET decisions – passes `project_id`, `org_id` when on project URL; `loadPending` deps include `scopeProjectId`, `scopeOrgId`.

---

## 3. Call sites that already pass scope (no change)

- **world-map-view.tsx:** `/api/kg-data`, `/api/project/risk-summary`, `/api/project/history`, `/api/decisions`, `/api/project/diff` – use `scopeProjectId` / `scopeOrgId` where needed.
- **decisions-panel.tsx:** `/api/project/history`, `/api/project/diff` – use `projectId` from scope.
- **use-pending-decisions.ts:** `GET /api/decisions` – passes `project_id` and `org_id`.
- **use-processed-decisions.ts:** `GET /api/decisions` – passes `project_id` and `org_id`.
- **node-detail-panel.tsx:** `GET /api/artifact/content`, version dropdown content fetch, `POST /api/artifact/apply` (edit flow) – pass `scopeProjectId` / `scopeOrgId` or `project_id` in body.
- **approval-card.tsx:** `POST /api/decisions` – uses `basePersistExtra` with `org_id` and `project_id`; artifact **edit** apply (line ~681) sends `project_id: projectId`.
- **shell.tsx:** `GET /api/workflow` – passes `project_id` via `effectiveProjectIdForScope`; workflow proxy forwards search params.

---

## 4. Summary table

| # | Location | Endpoint | Status |
|---|----------|----------|--------|
| 1 | API: artifact/history/route.ts | GET /artifact/history | Done |
| 2 | API: artifact/draft-content/route.ts (GET) | GET /artifact/draft-content | Done |
| 3 | API: artifact/draft-content/route.ts (POST) | POST /artifact/draft-content | Done |
| 4 | API: artifact/draft-from-existing/route.ts | POST /artifact/draft-from-existing | Done |
| 5 | node-detail-panel.tsx | GET /api/artifact/history | Done |
| 6 | node-detail-panel.tsx | GET /api/kg/nodes-for-picker | Done |
| 7 | node-detail-panel.tsx | POST /api/kg/link-nodes | Done |
| 8 | node-detail-panel.tsx | POST /api/artifact/draft-from-existing | Done |
| 9 | node-detail-panel.tsx | POST /api/artifact/draft-content | Done |
| 10 | concept-brief-diff-view.tsx | GET /api/artifact/draft-content | Done |
| 11 | approval-card.tsx | GET /api/artifact/draft-content | Done |
| 12 | approval-card.tsx | POST /api/artifact/apply (generate approve) | Done |
| 13 | approval-card.tsx | fetchLatestKgVersionSha → GET /api/project/history | Done (projectId param) |
| 14 | single-proposal-approval-page.tsx | POST /api/artifact/apply + draft-content + decisions | Done |

---

## 5. Backend reference (require_phase_id_for_scope)

Endpoints that use `require_phase_id_for_scope` (or equivalent) in `reflexion_graph/proxy_server.py`:

- GET /kg/data
- GET /project/risk-summary
- GET /artifact/risk-summary
- GET /project/history
- GET /project/diff
- GET /artifact/history
- GET /artifact/content
- GET /artifact/draft-content
- POST /artifact/draft-content
- POST /artifact/draft-from-existing
- POST /artifact/apply
- POST /artifact/revise-from-draft
- GET /kg/nodes-for-picker
- POST /kg/link-nodes
- GET /decisions (org_id + project_id for project scope)
- POST /decisions (same)
- POST /decisions/apply (via body)
- Document upload flows (phase_id required)

Any UI or proxy call to these must supply the expected scope parameters so the backend does not return 400 MISSING_SCOPE.
