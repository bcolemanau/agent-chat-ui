# PR: Route refactor (org/project in URL), reconnect, Ruff, OTEL removal

**Branch:** `feature/issue-139-kg-lineage-project-bootstrap`

Use this body for **both** PRs (one in agent-chat-ui, one in Reflexion). Each repo has code changes on this branch.

---

## Summary

| Repo | Code changes |
|------|----------------|
| **agent-chat-ui** | Route refactor (org/project in URL), thread_id in project URL, reconnect flow, OTEL removal, error boundary, polling cleanup. **72 files changed.** |
| **Reflexion** | Reconnect re-register when no project found, GET /kg/projects fewer model loads + `thread_id` in response, logging at DEBUG, Ruff lint/format. |

---

## Frontend (agent-chat-ui) — this PR has code changes

### Route refactor (Phase 3)
- **New route tree under `(app)`:** `/org/[orgId]` and `/org/[orgId]/project/[projectId]` for map, decisions, discovery, settings, integrations. Pages under `src/app/(app)/org/...` render the same workbench content as the flat routes; `projectId` in the path is used as the effective thread ID.
- **`useRouteScope()`** (`src/hooks/use-route-scope.ts`): Parses pathname and returns `{ orgId, projectId }` when the path matches `/org/...` or `/org/.../project/...`.
- **Stream provider:** `effectiveThreadId = projectIdFromPath ?? threadId` so when you're on a project URL, the path segment drives the thread (no `?threadId` needed).
- **Shell:** Builds nav links with org/project in the path when scope is present; uses `effectiveThreadId` for workflow and API.
- **Redirects:** Root `(app)/page` redirects to `/org/[org]/map` when org is in localStorage, else `/map`. Flat `/map` (and other flat workbench routes) can redirect to scoped URLs when org is set.
- **Project list → URL:** When you select a project in the sidebar or project switcher, we navigate to `/org/[orgId]/project/[segment]/map` where `segment = project.thread_id ?? project.id`. So the URL uses the real LangGraph thread ID from the project list; frontend and backend stay in sync.

### Reconnect
- Reconnect = **same project** (same KG/decisions from Redis/GitHub), **new thread** only.
- If the current project isn’t in the list (e.g. thread lost): we still call reconnect with `effectiveThreadId`; the backend re-registers that project_id to the new thread so context is preserved.
- On success we call `triggerWorkbenchRefresh()` and show a success toast.

### Other frontend changes
- **OTEL removal:** OpenTelemetry/LangSmith removed (otel-init, otel-client/server, langsmith-config API route, instrumentation import, `@opentelemetry/*` deps).
- **Error boundary:** `removeChild` / NotFoundError (e.g. Radix Select teardown) treated as recoverable; no crash UI.
- **Polling:** Removed polling fallback when SSE updates stream is disconnected (decisions panel, world-map-view).

---

## Backend (Reflexion) — this PR has code changes

### Reconnect (POST /kg/projects/{project_id}/reconnect)
- If no project is found by `id` or by `thread_id`: **re-register** the project with the new thread instead of returning 404. Same project_id keeps the same storage path (KG/decisions from Redis/GitHub).
- Path param may be a thread_id; backend resolves to project id when needed.

### GET /kg/projects (project list)
- **GitHub-storage path:** No per-directory model load; use directory name as display name (avoids N "Model not found" logs on org switch).
- **LangGraph path:** No full model load for display name; use thread metadata/state and fall back to `project_id`. Response now includes **`thread_id`** for each project so the frontend can use it in the URL.
- **projects.json** and **Redis** cache unchanged; when present they are used first.

### Logging
- **project_model:** "Model not found (expected for new projects)" is logged at DEBUG instead of INFO to avoid log flood when switching org.

### Ruff
- **pyproject.toml:** `[tool.ruff]` with `[tool.ruff.lint]` (select/ignore), `[tool.ruff.format]`; optional dev dep `ruff>=0.8.0`.
- **README:** Dev section with `pip install -e ".[dev]"`, `ruff check`, `ruff format` commands.

---

## Testing

- **Routes (agent-chat-ui):** Open `/org/<orgId>/map` and `/org/<orgId>/project/<threadId>/map`; map/decisions/settings load and nav uses scoped links. Selecting a project in the sidebar updates the URL to use that project’s `thread_id`.
- **Reconnect:** With a project open, use "Reconnect to this project" (e.g. after server restart); you get a new thread with the same project (KG/decisions intact). If the project isn’t in the list, reconnect still creates a new thread and re-registers the same project.
- **Backend:** `GET /kg/projects` returns `thread_id` per project; switching org should not flood INFO with "Model not found".
- **Build/lint:** Frontend: `pnpm build`, `pnpm lint`. Backend: `ruff check reflexion_graph tests`, `ruff format reflexion_graph tests` (with `pip install -e ".[dev]"`).

---

## Notes

- `.env` in Reflexion was not committed; keep local.
- Two separate PRs (one per repo), same branch name in both. Paste this body into each PR; the Frontend section applies to agent-chat-ui, the Backend section to Reflexion.
