# Organization context and API headers (technical debt)

## Contract

- **`X-Organization-Context`**: HTTP header sent by the client to the Next.js API. Value is the **organization ID** (UUID). The backend uses it to scope workflow, projects, connectors, and KG to the correct org (e.g. IoT vs default).
- **When to send it**: For any request that is org-scoped (workflow, projects, thread/project runs, decisions, artifact, kg, connectors). Legacy or non-org routes may omit it.
- **IDs**:
  - **Backend** uses `thread_id`, `project_id`, `customer_id` (snake_case) in query or body. `customer_id` is the org ID; it can also be provided via `X-Organization-Context`.
  - **Frontend** uses `orgId`, `projectId`, `threadId` (camelCase) in route scope and in many API call sites. When calling the backend (via Next.js proxy), we send `thread_id` in URL/body and org via the header.

## Current state (debt)

### Client

- **Source of org context** is duplicated in many places:
  - **Route**: `useRouteScope().orgId` when the user is on `/org/.../project/...`.
  - **localStorage**: `localStorage.getItem("reflexion_org_context")` when not on an org URL (e.g. legacy URL or after navigation).
- **Resolution order** should be: route `orgId` first, then `reflexion_org_context` from localStorage. Only `shell.tsx` (workflow fetch) currently uses this order; most components use only localStorage.
- **Header attachment**: Dozens of call sites manually do `const orgContext = localStorage.getItem("reflexion_org_context"); if (orgContext) headers["X-Organization-Context"] = orgContext;`. There is no single helper or hook that guarantees the header is attached for all org-scoped requests.

### Next.js API routes

- **`getProxyHeaders(session, req)`** in `@/lib/backend-proxy` already forwards `X-Organization-Context` from the incoming `req`. So any route that uses `getProxyHeaders(session, req)` (e.g. `kg-data`, `thread-summary`, `updates/stream`, `workflow` via `proxyBackendGet`) will forward the header **if the client sends it**.
- Some routes build their own headers and manually add `X-Organization-Context`; they could standardize on `getProxyHeaders` for consistency.
- The **catch-all** proxy (`api/[..._path]/route.ts`) forwards all client headers (except `host`), so org context is forwarded for catch-all requests when the client sends it.

### Thread / project ID

- **thread_id**: Sometimes in query (`?thread_id=...`), sometimes in body. Backend expects `thread_id`.
- **project_id / projectId**: Naming and placement vary; backend uses `project_id` where applicable.
- No single documented rule (e.g. “always send `thread_id` when in project context”) is enforced.

## Recommended approach: decorator + hook

Use a **decorator-style wrapper** as the default so the header is injected in one place and call sites can't forget it. Keep the **hook** for reading org/project IDs and for cases that need the value in React (e.g. UI, conditional logic).

### 1. Decorator: `apiFetch()` (preferred for org-scoped requests)

- **Location**: `src/lib/api-fetch.ts`
- **Behavior**: Same signature as `fetch()`. Automatically merges `X-Organization-Context` into the request when the app has set an org context. The value comes from a **ref** kept in sync by `OrgContextRefProvider` (route first, then localStorage; same resolution as the hook).
- **Provider**: `OrgContextRefProvider` in `src/providers/OrgContextRefProvider.tsx` is mounted in the app layout. It updates the ref when route or localStorage changes (and listens for `orgContextChanged` when the org switcher updates localStorage without navigation).
- **Usage**: Use `apiFetch` instead of `fetch` for any org-scoped `/api/*` call. No need to pass headers manually.

```ts
import { apiFetch } from "@/lib/api-fetch";
const res = await apiFetch("/api/workflow");
const res2 = await apiFetch("/api/projects", { method: "GET", headers: { ... } }); // your headers are merged with org header
```

This is a **middleware-like** approach: one central place injects the header for every request that goes through it.

### 2. Hook: `useOrgContext()` (for reading IDs and when you need headers in React)

- **Location**: `src/hooks/use-org-context.ts`
- **Returns**: `{ orgId, projectId, apiHeaders }` — same resolution (route then localStorage). Use when you need `orgId`/`projectId` in the component (e.g. breadcrumbs, redirects) or when building requests that don't go through `apiFetch` (e.g. EventSource, or third-party clients).
- **When to use**: Prefer **`apiFetch`** for normal `/api/*` calls. Use the **hook** when you need the org/project values in JSX or when you can't use `apiFetch` (e.g. outside React, or passing headers into a library).

### 3. API routes (server)

- Prefer **`getProxyHeaders(session, req)`** for any route that proxies to the Reflexion backend, so `X-Organization-Context` is forwarded consistently. No need to manually read the header in each route.

### 4. Migration

- Replace raw `fetch("/api/...")` with `apiFetch("/api/...")` for org-scoped calls so the header is always applied. Call sites that only need the header can stop manually reading localStorage and adding `X-Organization-Context`.
- Keep using `useOrgContext()` where you need `orgId` or `projectId` in the component (e.g. route-aware UI). Optionally document when to send `thread_id` / `project_id` (e.g. thread_id required for stream/summary; project_id when mutating project-scoped resources).
