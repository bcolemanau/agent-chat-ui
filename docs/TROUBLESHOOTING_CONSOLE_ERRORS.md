# Troubleshooting — Console / API errors

## 1. LangSmith / OTEL 403 (`api.smith.langchain.com/otel/v1/traces`)

**Symptom:** Repeated `403 (Forbidden)` and `[OTEL] Failed to flush span` in the console. Traces are sent to LangSmith but rejected.

**Causes:**
- **No API key:** `LANGSMITH_API_KEY` is not set in the environment (or is empty / placeholder like `remove-me`).
- **Invalid or expired key:** The key is set but LangSmith rejects it (e.g. revoked, wrong project, or tracing not enabled).

**Fix:**
- **To stop the errors:** Unset `LANGSMITH_API_KEY` or set it to `remove-me`. The app will skip OpenTelemetry initialization and no traces will be sent (no 403).
- **To use tracing:** Set `LANGSMITH_API_KEY` to a valid LangSmith API key. Ensure the project (e.g. `LANGSMITH_PROJECT` / `LANGCHAIN_PROJECT`) exists and tracing is enabled.

**Code:** Client OTEL only initializes when `/api/langsmith-config` returns a valid key (503 when not configured). Server OTEL (`otel-server.ts`) skips init when the key is missing or equals `remove-me`.

---

## 2. `/api/artifact/link/apply` 404 (Not Found)

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

## Summary

| Error | Likely cause | Action |
|-------|----------------|--------|
| OTEL 403 | No/invalid LangSmith API key | Unset key or set `remove-me` to disable; or set a valid key to enable tracing. |
| link/apply 404 | Backend does not expose `/artifact/link/apply` | Deploy Reflexion proxy_server routes on the same backend or add a separate Reflexion API URL. |
| classification/apply 422 | Missing `trigger_id` (or other required field) | Ensure decision has `trigger_id` in args or preview_data; UI now falls back to preview_data. |
| project/diff 500/502 | Backend exception, or ECONNRESET/timeout (connection closed or too slow) | Proxy now returns 502 with clear message; increase backend timeout or retry; check backend logs and storage. |
