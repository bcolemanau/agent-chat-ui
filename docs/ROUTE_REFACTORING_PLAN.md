# Route Refactoring Plan: UI and API to Match Product Surface

This plan refactors UI routes and API routes so they align with the product intent in [PRODUCT_SURFACE_SUMMARY.md](./PRODUCT_SURFACE_SUMMARY.md) and the core/cleanup in [ROUTE_SURFACE_CORE_AND_CLEANUP.md](./ROUTE_SURFACE_CORE_AND_CLEANUP.md). Design principle: **parity of capability** between web UI and API (Design principle 2 in the product summary).

---

## 1. Target model (from product summary)

| Level        | Contains                                                                 | Settings                                                                 |
|-------------|---------------------------------------------------------------------------|---------------------------------------------------------------------------|
| **Organization** | KG Map, Artifacts, Decisions, Discovery; defines NPD Type, Agents, Workflows, Templates, Integrations | Identity/Role, NPD Type, Agents, Workflows, Artifact/Decision Templates, Integrations, Evaluations |
| **Project**      | KG Map, Artifacts, Decisions, Discovery; selects from org options        | Select from Org options, Identity/Role, Integrations, Evaluations        |
| **User**         | Contained within cross-functional teams                                  | Profile, preferences                                                      |

**Core (6):** Map, Artifacts, Decisions (Org + Project), Discovery (Org + Project), Integrations, Settings.

**Flow:** Discovery + KG Map → Artifacts → Decisions at each level; Org Decisions + Discovery + KG Map → Project Artifacts → Project Decisions → Integrations → Cross-functional teams.

---

## 2. Current state (brief)

### 2.1 UI routes (agent-chat-ui)

**After Phase 1 refactor (cleanup + integrations):**

- **Canonical paths:** Still **flat**; no org/project in path. Project is represented by **opaque `threadId`** in query (`?threadId=...`). Org is in context only (localStorage `reflexion_org_context`, header `X-Organization-Context`).
- **Pages:** `/map`, `/decisions`, `/discovery`, `/settings`, `/integrations`; redirects from `/backlog`, `/hydration`, `/concept-brief`, `/requirements`, `/ux-brief`. Duplicate trees under `(app)/` and `workbench/` (workbench redirects to flat path).
- **Sidebar:** Map (with Artifacts as view), Decisions, Integrations, Discovery, Settings. No explicit Org vs Project in URL.

**Target (Phase 3):** Replace opaque `threadId` with path-based scope: `/org/[orgId]` and `/org/[orgId]/project/[projectId]` so organization and project are visible and shareable in the URL.

### 2.2 API (Next.js proxy + Reflexion backend)

- **Proxy:** Next.js catch-all `/api/[...path]` forwards to backend; dedicated Next.js routes for some (e.g. `/api/projects`, `/api/organizations`, `/api/decisions` proxy to backend).
- **Backend:** Project-scoped by `thread_id`/`project_id`; org by `X-Organization-Context` or `org_id` in path. No `/integrations` product-level surface; no consistent `/auth/organizations/{id}/integrations` or `/auth/organizations/{id}/settings` pattern. Decisions/artifact/thread APIs are project-centric.

---

## 3. UI route refactoring

### 3.1 Scope in the URL (optional but recommended)

To support **Org** and **Project** explicitly and match the product model:

| Option | Pattern | Pros | Cons |
|--------|---------|------|------|
| **A** | Keep flat; scope from context (threadId + org header/localStorage) | No URL churn, simpler | Org-level views (Map, Decisions, Discovery, Settings) not clearly “org” in URL |
| **B** | `/org/[orgId]` and `/org/[orgId]/project/[projectId]` (or `.../p/[projectId]`) | Clear org vs project; shareable links; future-proof | Larger change; need org/project resolvers and nav |
| **C** | `/org` and `/project` with scope in query or context (e.g. `?org=...&project=...`) | Smaller URL change | Still somewhat implicit |

**Recommendation:** Start with **Option A** (current) for Phase 1; introduce **Option B** in a later phase when we add true org-level Map/Decisions/Discovery and org switcher. Document the intended eventual pattern so new routes stay consistent.

### 3.2 Core routes (keep / align)

| Intent | Current route | Action | Notes |
|--------|----------------|--------|------|
| **Map** (KG + artifact graph) | `/map` | Keep | Single view; `?view=artifacts` for artifact topology. Same capability at Org and Project (context determines scope). |
| **Artifacts** | `/map?view=artifacts` (+ artifact pane) | Keep | Browse, view, edit, versions, enrichment as artifact action. |
| **Decisions** | `/decisions` | Keep | List + approve/reject for all types (link, enrichment, project config complete, artifact proposals). Support **org** and **project** scope via context (and later via URL if Option B). |
| **Discovery** | `/discovery` | Keep | Explore beyond grounding, bring back in. Support org and project scope. |
| **Integrations** | (none at root) | **Add** | **Root `/integrations`**: product-level (available types, dogfood). |
| **Settings** | `/settings` | Extend | **Settings at 3 levels:** User, Org, Project. Use tabs or nested routes: e.g. `/settings` (user), `/settings/org` or scope selector for Org, `/settings/project` for Project. |

### 3.3 Cleanup (fold or move)

| Current route | Action | Target |
|---------------|--------|--------|
| `/hydration` | Remove as top-level route | Decisions (approve “project configuration complete for now”) + optional enrichment view under Map/Artifacts. Redirect `/hydration` → `/decisions` or `/map`. |
| `/concept-brief` | Remove as route | Decisions + generic artifact approval (open from decisions list; deep link `/decisions?decisionId=...`). |
| `/requirements` | Remove as route | Same as concept-brief. |
| `/ux-brief` | Remove as route | Same as concept-brief. |
| `/backlog` | Move under Integrations | Redirect `/backlog` → `/integrations` or to a “Project Management” view (sync projects/issues) under Settings → Integrations or a dedicated view that reads integration config. |

### 3.4 Sidebar and nav

- **Core nav:** Map, Artifacts (sub or view), Decisions, Discovery, **Integrations**, Settings.
- **Scope:** When we have org vs project in context/URL, show scope indicator or switcher (e.g. “Org: Acme” / “Project: Alpha”) and optionally different nav emphasis for org vs project (same route names, scope from context).
- **Remove from main nav:** Smart Backlog as top-level (link from Integrations or Settings → Integrations). Hydration, Concept Brief, Requirements, UX Brief (removed as routes).

### 3.5 Workbench view sync (backend)

Backend today can set `workbench_view` (map, decisions, discovery, settings, backlog, hydration). Align with refactor:

- Remove `hydration` as a view target; map to `decisions` when “project configuration complete for now” is the intent.
- Map `backlog` to `integrations` or a sub-view (e.g. “project_management” under integrations).
- Keep `map`, `decisions`, `discovery`, `settings`; add `integrations` if backend drives nav.

---

## 4. API route refactoring

### 4.1 Principles

- **Scoping:** Support **user**, **org**, and **project** explicitly. Prefer path-based scope where it helps: e.g. `/auth/organizations/{org_id}/...`, `/kg/projects/{project_id}/...` (already partly in place).
- **Parity:** Any capability exposed in the UI should be callable via the API with equivalent scope (Design principle 2).
- **Integrations:** (1) **Product-level:** e.g. `GET /integrations` (or `/auth/integrations`) for available types and product config. (2) **Per-level:** Integrations config under “Settings” at each level (see below).

### 4.2 Product-level Integrations

| Method | Path | Purpose |
|--------|------|--------|
| GET | `/integrations` or `/auth/integrations` | List integration types and product-level config (e.g. Product_GitHub dogfood). |

Backend: add if missing; Next.js can proxy via existing catch-all or add a dedicated route that proxies to backend.

### 4.3 Settings at User, Org, Project

- **User:** Already implied by `/auth/profile`. Add or document: `GET/PATCH /auth/profile` (or `/auth/user/settings`) for profile and preferences.
- **Org:** Use existing `/auth/organizations/{org_id}` and extend with settings sections (NPD Type, Agents, Workflows, Artifact/Decision Templates, Branding, Admin, Integrations). Optionally: `GET/PUT /auth/organizations/{org_id}/settings` or keep under `PUT /auth/organizations/{org_id}` for full org update. Integrations at org: see below.
- **Project:** Project-specific config (selection from org options, Integrations) can live under `GET/PATCH /kg/projects/{project_id}` or a dedicated `GET/PUT /kg/projects/{project_id}/settings` (or under org as sub-resource). Prefer one consistent pattern.

### 4.4 Integrations under Settings (per level)

- **Org:** OAuth clients and Project Management (sync projects/issues) config for the org. Suggested: `GET|POST|PUT|DELETE /auth/organizations/{org_id}/integrations` and/or `/auth/organizations/{org_id}/integrations/oauth` (or `oauth-clients`). Backend: implement “missing API” for OAuth client CRUD per org.
- **Project:** Which integrations this project uses (e.g. which Project Management connection). e.g. `GET|PUT /kg/projects/{project_id}/integrations` or under project settings.
- **User:** Connected accounts (e.g. `GET|PUT /auth/profile/connected-accounts` or under profile).

### 4.5 Org-level Map, Artifacts, Decisions, Discovery

Today most APIs are project-scoped (thread_id / project_id). To support **org-level** Map, Artifacts, Decisions, Discovery:

- **Option 1 (minimal):** Keep existing project-scoped APIs; “org” view in UI is a convention (e.g. “org dashboard” that aggregates or shows org-wide decisions) using existing org and project list APIs.
- **Option 2 (full parity):** Add org-scoped read (and where needed write) endpoints, e.g.:
  - `GET /kg/data?scope=organization&org_id=...`
  - `GET /decisions?scope=organization&org_id=...`
  - `GET /artifact/...` with org scope where artifacts are org-level.

Recommendation: Phase 1 use Option 1; Phase 2+ add Option 2 if product requires true org-level artifact/decision entities.

### 4.6 Cleanup alignment (no new APIs)

- **Hydration:** Keep `POST /hydration/apply`; only remove **UI route** `/hydration`. Backend unchanged.
- **Concept brief / Requirements / UX brief:** Keep backend tool names and `artifact_type`; no dedicated API routes for these. UI uses generic Decisions + artifact approval.
- **Backlog:** Project Management (sync projects/issues) APIs stay; they are consumed under Integrations (UI and optionally `GET /auth/organizations/{org_id}/integrations` including project management config).

---

## 5. Implementation phases

### Phase 1: Cleanup and Integrations (UI + API)

1. **UI**
   - Add root route **`/integrations`** (page + nav). Content: product-level integrations and/or link to Settings → Integrations.
   - Redirect **`/backlog`** → **`/integrations`** (or to a Project Management view under Integrations). Update sidebar: replace “Smart Backlog” with “Integrations” or move Backlog under Integrations.
   - Redirect **`/hydration`** → **`/decisions`**. Remove hydration from sidebar and workbench view sync; when backend sends “hydration” view, map to `decisions`.
   - Remove **`/concept-brief`**, **`/requirements`**, **`/ux-brief`** as routes (redirect to `/decisions` with appropriate query or rely on in-app navigation from decisions list). Remove from sidebar if present.
2. **API**
   - Add or document **product-level** `GET /integrations` (or `/auth/integrations`).
   - Document or add **org integrations** shape: `GET /auth/organizations/{org_id}/integrations` (and OAuth CRUD if planned).

### Phase 2: Settings at three levels

1. **UI**
   - Restructure **`/settings`** to support User, Org, Project (tabs or `/settings/profile`, `/settings/org`, `/settings/project`). Use org/project from context (and later from URL if Option B).
   - Under Settings, add **Integrations** section per level (user connected accounts, org OAuth + Project Management, project integration selection).
2. **API**
   - Ensure **user** settings: `GET/PATCH /auth/profile` (or `/auth/user/settings`).
   - **Org** settings: consolidate under `GET/PUT /auth/organizations/{org_id}` or add `.../settings`; add **Integrations** subsection (OAuth clients, Project Management config).
   - **Project** settings: `GET/PATCH /kg/projects/{project_id}` or `.../settings` including integrations selection.

### Phase 3: Org vs Project scope (optional)

1. **UI**
   - Introduce scope switcher (Org / Project) and optionally **Option B** URLs: `/org/[orgId]`, `/org/[orgId]/project/[projectId]` for Map, Decisions, Discovery, Settings.
   - Same core routes (Map, Decisions, Discovery, Settings), different scope from URL or context.
2. **API**
   - If needed, add org-scoped read APIs for Map, Decisions, Discovery (Option 2 in §4.5).

### Phase 4: Parity and GraphQL (later)

- Document which API operations back each UI route (contract).
- Add **GraphQL** interface that mirrors entities and scopes (user, org, project); keep REST for backward compatibility. Align with [ROUTE_SURFACE_CORE_AND_CLEANUP.md](./ROUTE_SURFACE_CORE_AND_CLEANUP.md) “AG-UI + GraphQL” section.

---

## 6. Migration and rollout

- **Redirects:** Use Next.js `redirect()` in page components or `next.config` redirects for removed routes (`/hydration`, `/concept-brief`, `/requirements`, `/ux-brief`, `/backlog`) so bookmarks and links keep working.
- **Feature flags:** Optional feature flag for “new Integrations” and “Settings levels” to roll out gradually.
- **Backend:** Prefer additive API (new routes or query params for scope); avoid breaking existing project-scoped consumers.

---

## 7. Checklist (summary)

**UI routes**

- [x] Add `/integrations` (product-level).
- [x] Redirect `/backlog` → `/integrations` (or PM view).
- [x] Redirect `/hydration` → `/decisions`.
- [x] Remove routes `/concept-brief`, `/requirements`, `/ux-brief` (redirect to `/decisions`).
- [x] Update sidebar: Core = Map, Artifacts, Decisions, Discovery, Integrations, Settings; remove Smart Backlog top-level, Hydration, Concept Brief, Requirements, UX Brief.
- [ ] Restructure `/settings` for User / Org / Project with Integrations subsection.
- [x] Optional scope in URL: `/org/[orgId]`, `/org/[orgId]/project/[projectId]` (Phase 3 implemented).

**API routes**

- [ ] Add or document `GET /integrations` (product-level).
- [ ] Add or document org integrations: `GET|PUT /auth/organizations/{org_id}/integrations` (and OAuth CRUD if needed).
- [ ] Document user settings: `GET/PATCH /auth/profile` (or `/auth/user/settings`).
- [ ] Ensure org settings include Integrations (and NPD Type, Agents, Workflows, Templates, etc.).
- [ ] Ensure project settings include integration selection (and optional overrides).
- [ ] (Later) Org-scoped read for Map/Decisions/Discovery if required.

**Backend / proxy**

- [x] Map workbench_view `hydration` → `decisions`, `backlog` → `integrations`.
- [ ] No breaking changes to existing project-scoped or decision/artifact APIs.

---

## 8. References

- [PRODUCT_SURFACE_SUMMARY.md](./PRODUCT_SURFACE_SUMMARY.md) — Product intent, core (6), User/Org/Project, flow.
- [ROUTE_SURFACE_CORE_AND_CLEANUP.md](./ROUTE_SURFACE_CORE_AND_CLEANUP.md) — Core vs cleanup table, Settings levels, Integrations (root vs Settings), GCP analogy, AG-UI + GraphQL.
