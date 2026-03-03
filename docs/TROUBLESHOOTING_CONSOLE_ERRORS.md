# Troubleshooting — Console / API errors

*OpenTelemetry/LangSmith tracing has been removed from the app; the following section is kept for historical reference only.*

~~## 1. LangSmith / OTEL 403~~ *(removed — OTEL no longer used)*

---

## 1a. `/api/kg-data` 400 (Bad Request) — [WorldMapView] Failed to fetch graph data

**Symptom:** `GET /api/kg-data?org_id=reflexion-orchsync:1` returns 400, console shows `[WorldMapView] Fetch error: Error: Failed to fetch graph data`.

**Cause:** The backend requires a scope (phase_id or project_id). When you are at **org level** (no project selected), the UI was sending only `org_id`; the backend’s project branch then had no phase_id/project_id and raised `MissingScopeError` (400).

**Fix (done):**
- **Frontend:** When the map has org scope but no project (`scopeOrgId` set, `scopeProjectId` unset), the UI now also sends `version_source=organization` so the backend uses `org_id` as phase_id.
- **Backend:** GET `/kg/data` now treats `org_id` as a fallback for phase_id when neither `phase_id` nor `project_id` is provided, so org-only requests work even without `version_source=organization`.

---

## 1b. `/api/threads/{id}/state` 400 — "Ambiguous update, specify as_node"

**Symptom:** `PATCH/POST /api/threads/{id}/state` returns 400 with body `{"detail":"Ambiguous update, specify as_node"}` and `[Stream] Failed to update workbench view`.

**Cause:** The LangGraph server requires an `as_node` in the state-update body when it cannot infer which graph node the update belongs to (e.g. after an interrupt or when multiple nodes could apply).

**Fix (done):** The Reflexion proxy, when forwarding a thread state update to LangGraph, now injects `as_node: "supervisor"` in the request body if the client did not send it. This removes the ambiguity so the update is accepted.

---

## 1c. `/api/threads/{id}/state` 409 (Conflict)

**Symptom:** `Failed to load resource: the server responded with a status of 409` when updating thread state (e.g. after applying a decision or syncing state).

**Cause:** The LangGraph backend returns 409 when the state update conflicts with the current version (e.g. concurrent updates, or the client’s view of state is stale).

**Fix:** The app usually retries or refetches state. If 409 persists, avoid rapid repeated state updates; ensure only one writer updates a thread at a time, or use the backend’s recommended concurrency pattern (e.g. conditional update with version).

---

## 2a. `/api/artifact/content` and `/api/artifact/history` 500 (Internal Server Error)

**Symptom:** `GET /api/artifact/content?node_id=ART-requirements_package_md&thread_id=...&project_id=...&org_id=...` or `/api/artifact/history` returns 500, and the NodeDetailPanel shows "Fetch failed: 500 Internal Server Error" or "History fetch failed: 500".

**Cause:** The backend (Reflexion proxy_server) calls `get_artifact_content` / `list_artifact_history`, which can 500 when:
- The artifact node is not in the project KG for the given scope (e.g. wrong or missing `project_id`).
- The project model cannot be loaded (e.g. missing or invalid project, storage/GitHub error).
- `require_phase_id_for_scope` fails when `project_id` is missing (scope required for security).

**Fix:**
- Ensure the request includes a valid `project_id` (and `org_id` when applicable) so the backend can resolve scope.
- Check backend logs for `[HISTORY]` / `get_artifact_content` and the exact exception (e.g. "Artifact node '...' not found in project KG" or "Could not load project model").
- If the node is an accepted artifact (e.g. `ART-requirements_package_md`), ensure the project has that node in its KG (e.g. after apply/hydration). Draft or tool-call IDs have no history and return a hint instead of 500.

---

## 2b. `/api/artifact/link/apply` 404 (Not Found)

**Symptom:** `[ApprovalCard] Error applying artifact link: Error: Not Found` when approving a **link_uploaded_document** decision.

**Cause:** The request is proxied to the backend (`LANGGRAPH_API_URL`). The backend that serves that URL does **not** expose `POST /artifact/link/apply` (Reflexion proxy_server route).

**Fix:**
- Ensure the **same** backend that serves LangGraph (threads, state) also runs the Reflexion proxy routes from `reflexion_graph/proxy_server.py`, including `POST /artifact/link/apply`.
- Or introduce a separate base URL for Reflexion API (e.g. `REFLEXION_API_URL`) and proxy only artifact/project routes to it; keep thread/state on `LANGGRAPH_API_URL`.

**Payload:** The UI sends `decision_id`, `artifact_id`, `artifact_type`, `project_id`, `thread_id`, `trigger_id`. The backend expects all of these (decision_id and artifact_id/artifact_type required).

---

## 3. `/api/project/classification/apply` 422 (Unprocessable Entity)

**Symptom:** `[ApprovalCard] Error applying classification: Error: [object Object]` or a validation message when approving a **classify_intent** decision.

**Cause:** The backend expects `decision_id` (string) and `trigger_id` (string). If `trigger_id` is missing (e.g. only in `preview_data` and not in `args`), FastAPI returns 422.

**Fix (UI):** The approval card now sends `trigger_id: item.data?.args?.trigger_id ?? item.data?.preview_data?.trigger_id`. Ensure the decision payload stores `trigger_id` in either `args` or `preview_data` so it is sent.

**Fix (backend):** If you want to allow optional trigger in some flows, relax the schema in `ClassificationApplyBody` (e.g. `trigger_id: Optional[str] = None`) and handle missing trigger in the handler.

**Display:** 422 responses with FastAPI validation errors are now formatted so the toast shows field names and messages (e.g. `body.trigger_id: field required`) instead of `[object Object]`.

---

## 4. `/api/project/diff` 500 / 502 — ECONNRESET or fetch failed

**Symptom:** `[PROXY] KG Diff fetch failed: TypeError: fetch failed` with `cause: read ECONNRESET` (errno -104), or the UI shows 500/502 when loading the project diff view.

**Causes:**
- **ECONNRESET:** The backend closed the TCP connection while the proxy was reading (e.g. backend timeout, crash, or idle timeout). Common when the diff request is slow (loading two models + LLM semantic summary).
- **Backend timeout:** The backend takes longer than the proxy timeout (default 60s). The proxy aborts the fetch and returns 502 "Backend timeout".
- **500:** The backend handler threw (e.g. `load_customer_project_model` or `compute_graph_diff` failed).

**Fix:**
- **Proxy (agent-chat-ui):** The diff route now uses a 60s timeout (`PROJECT_DIFF_TIMEOUT_MS` env to override) and returns **502** with a clear message for ECONNRESET, ECONNREFUSED, ETIMEDOUT, or AbortError: "Backend connection reset or unreachable. Try again." or "Backend timeout". The UI can show this and the user can retry.
- **Backend:** Increase request/worker timeouts so long diff requests don’t get killed. Check backend logs for `[DIFF]` and any exception; ensure project models exist and storage (e.g. GitHub) is reachable.

---

## 5. `/api/threads/{id}/state` and `/api/threads/{id}/history` 404 (Not Found)

**Symptom:** Toast: *"Conversation state for this project isn't available (e.g. after a server restart)..."*, or console: `Failed to load resource: 404`, `[Stream] Failed to update workbench view: HTTP 404`, or `SDK Error: HTTP 404`.

**Cause:** The LangGraph backend has no conversation state for this thread (e.g. `?threadId=...`). Common reasons:
- LangGraph server was restarted (in-memory checkpointer loses threads)
- Thread was deleted or never created
- Stale URL from a previous session

**Behaviour:** When state refetch gets 404, the app no longer clears the thread from the URL, so you can still **browse the map and decisions** (they load from the Reflexion backend by project/thread_id). Only the chat/conversation state is missing.

**Fix:**
1. To **keep browsing:** Stay on the page — map and decisions should still load.
2. To **start a new conversation:** Click **"New Project"** in the project switcher, or go to `/workbench/map` without `?threadId=`. The first message will create a new thread.

---

## Summary

| Error | Likely cause | Action |
|-------|----------------|--------|
| kg-data 400 | Missing scope when at org level (only org_id sent) | UI now sends version_source=organization; backend accepts org_id as phase_id fallback. |
| threads/{id}/state 400 "Ambiguous update, specify as_node" | LangGraph needs as_node in state update body | Proxy now injects as_node=supervisor when client omits it. |
| threads/{id}/state or /history 404 | Conversation state missing (restart, deleted, stale URL) | Map/decisions still work; use "New Project" to start a new conversation if needed |
| threads/{id}/state 409 | Concurrent or stale state update | App retries; avoid rapid repeated updates. |
| artifact/content or artifact/history 500 | Node not in project KG, or project scope/load failed | Send valid project_id/org_id; check backend logs and that artifact exists in project. |
| link/apply 404 | Backend does not expose `/artifact/link/apply` | Deploy Reflexion proxy_server routes on the same backend or add a separate Reflexion API URL. |
| classification/apply 422 | Missing `trigger_id` (or other required field) | Ensure decision has `trigger_id` in args or preview_data; UI now falls back to preview_data. |
| project/diff 500/502 | Backend exception, or ECONNRESET/timeout (connection closed or too slow) | Proxy now returns 502 with clear message; increase backend timeout or retry; check backend logs and storage. |
