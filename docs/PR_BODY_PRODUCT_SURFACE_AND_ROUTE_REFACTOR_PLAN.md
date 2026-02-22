# PR: Product surface summary (Org/Project/User) and route refactoring plan

## Summary

Updates **Product Surface Summary** to reflect Decisions, Discovery, KG Map, and Artifacts at **Organization** and **Project** level; **User** level contained within cross-functional teams; **Settings** at all three levels; and the end-to-end flow (Discovery + Map → Artifacts → Decisions; org decisions feed project; project decisions → Integrations → teams). Adds a **Route Refactoring Plan** that aligns UI routes and API routes with this intent (core vs cleanup, Settings at User/Org/Project, Integrations at root and under Settings, phased implementation).

---

## 1. Product Surface Summary (`docs/PRODUCT_SURFACE_SUMMARY.md`)

**Changes:**

- **Decisions** — Now explicit at **Organization** and **Project** level (diagram + prose).
- **Discovery** — At Org and Project; “explore beyond the grounding and bring findings back into the system” (one-story, plain terms, diagram, core bullet).
- **KG Map and Artifacts** — Apply **exactly the same way** at Organization and Project level (diagram shows both levels; prose and core bullet updated).
- **Flow** — Discovery + KG Map → Artifacts → Decisions at Org; **Org Decisions** + Discovery + KG Map → Project Artifacts → Project Decisions → **Integrations** → Cross-functional teams (diagram edges and narrative).
- **User level** — Contained within cross-functional teams; diagram shows User (with Settings: profile, preferences) inside Teams.
- **Settings at all 3 levels** — Diagram and prose: **User** (profile, preferences), **Org** (Identity/Role, NPD Type, Agents, Workflows, Artifact/Decision Templates, Integrations, Evaluations), **Project** (select from Org options, Identity/Role, Integrations, Evaluations).
- **Design principles** — Typo fixes (capabilities, interface); numbering (Design principle 1, 2).
- **Summary bullet** — Core (6) and Settings at three levels aligned with above; Project Settings described as “select from Org options, Integrations”; Integrations in flow (ProjDec → IntConfig → Teams).

---

## 2. Route Refactoring Plan (`docs/ROUTE_REFACTORING_PLAN.md`) — **new**

**Purpose:** Refactor UI routes and API routes to match the product surface (parity of capability between web UI and API).

**Contents:**

- **Target model** — User/Org/Project levels and core (Map, Artifacts, Decisions, Discovery, Integrations, Settings) from product summary.
- **Current state** — Brief snapshot of UI routes (flat paths, workbench redirects, sidebar) and API (Next.js proxy, backend project/org scope).
- **UI route refactoring:**
  - Scope options (keep flat vs `/org/[orgId]`/`/org/.../project/[projectId]`); recommend flat for Phase 1.
  - Core routes: keep Map, Artifacts, Decisions, Discovery; **add `/integrations`** (product-level); extend **`/settings`** for User/Org/Project.
  - Cleanup: remove `/hydration`, `/concept-brief`, `/requirements`, `/ux-brief` as top-level (redirect to `/decisions`); move `/backlog` under Integrations (redirect to `/integrations` or PM view).
  - Sidebar: Core = Map, Artifacts, Decisions, Discovery, Integrations, Settings; remove Smart Backlog top-level and folded routes from main nav.
- **API route refactoring:**
  - Product-level `GET /integrations`; Settings at User (profile), Org (settings + Integrations), Project (settings + integration selection).
  - Integrations under Settings: org OAuth + Project Management; project/user integration config.
  - Org-level Map/Decisions/Discovery: Phase 1 use existing project APIs + conventions; later add org-scoped read if needed.
- **Phases:** Phase 1 (cleanup + Integrations), Phase 2 (Settings at three levels), Phase 3 (optional scope in URL), Phase 4 (parity + GraphQL).
- **Migration:** Redirects for removed routes; additive API only.
- **Checklist:** Concrete UI and API tasks and backend/proxy items.

**References:** Links to `PRODUCT_SURFACE_SUMMARY.md` and `ROUTE_SURFACE_CORE_AND_CLEANUP.md`.

---

## 3. Files touched

| File | Change |
|------|--------|
| `docs/PRODUCT_SURFACE_SUMMARY.md` | Updated (Decisions/Discovery/Map/Artifacts at levels, User, Settings, flow, diagram, design principles, summary). |
| `docs/ROUTE_REFACTORING_PLAN.md` | **New** — Route refactoring plan (UI + API, phases, checklist). |

---

## 4. Follow-up

- Implementation of **Phase 1** (add `/integrations`, redirects, sidebar updates, product-level integrations API) and **Phase 2** (Settings at User/Org/Project) to be done in subsequent PRs per the plan.
- No code or route changes in this PR; documentation only.
