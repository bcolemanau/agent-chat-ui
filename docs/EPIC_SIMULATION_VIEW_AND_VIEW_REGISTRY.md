# Epic: Simulation as Map View + Generalized View Registry

**[Theme] Map simulation as a selectable view with a generalized view registry**

---

## Summary

Expose the hero simulation as a **map view mode** so users can run the same narrative/visualization on their project’s knowledge graph without leaving the map. Introduce a **generalized view registry** and use it for map content views (graph, artifacts, simulate) and, over time, simulation sub-views (chaos, teams, linear, traceability, etc.), so new views can be added without hardcoded branches. Simulation consumes the map’s in-memory graph when available (no duplicate fetch) and respects the timeline (prior version selection).

---

## Goals

- **Simulate in map:** Simulate is a selectable view under the Map tab (`view=simulate`); same data as the map, no extra fetch when switching from map.
- **View registry:** A single view registry holds map content views (graph, artifacts, simulate) and simulation sub-views; map content resolution is registry-driven instead of hardcoded conditionals.
- **Product views from beats:** Simulation beats map to product views (chaos = nodes only, teams = phase constellations + hulls, linear = workflow layout, traceability = link emphasis, etc.); each can be a registered view as we implement it.
- **Incremental scope:** Only new and touched views are added to the registry; workbench tabs, decisions panel, and content renderer registry stay as-is for this epic.

---

## Goal (user outcome)

*As a Product Manager or user exploring a project, I can switch to a simulation view from the map and see the same graph (including a prior version if I selected one in the timeline) in narrative/visualization mode, so I can use simulation as a view of my project rather than a separate demo.*

---

## Personas

| Persona category | Role | Primary goals / JTBD | Key needs from assistant | Desired experience outcomes |
|------------------|------|----------------------|---------------------------|-----------------------------|
| NPD Execution | Product Manager / PMO | Communicate scope and flow to stakeholders; show how decisions connect | One place to see graph as map or as simulation; same data, different lens | Simulation feels part of the product; no context switch or duplicate load |
| Configuration / UX | Configurator or power user | Configure and demo project structure | Selectable views (graph, artifacts, simulate and later chaos/teams/traceability) | New views can be added via registry; consistent pattern |

---

## User stories

| ID | As a … | I want … | So that … |
|----|--------|----------|-----------|
| US-1 | Product Manager | To open a “Simulate” view from the map and see my project’s graph in narrative/beats mode | I can present or explore the same data in story form without leaving the map or reloading |
| US-2 | User | To have the simulation use the exact graph I’m viewing (including a past version from the timeline) | What I see in simulate matches what I had selected on the map |
| US-3 | Developer | To add new map or simulation views by registering them instead of adding conditionals | We can add chaos, teams, traceability, etc., without more hardcoded branches |

---

## Features

- **Generalized view registry:** New `ViewRegistry` (or equivalent) with `register(id, descriptor)`, `get(id)`; descriptors have `id`, optional `label`, and a way to render (component or render function with props).
- **Map content via registry:** `world-map-view.tsx` resolves map content (graph, artifacts, simulate) via registry lookup instead of `viewMode === 'artifacts' ? ... : ...`.
- **Simulate view mode:** `view=simulate` supported in Map; simulation component receives `initialGraph` (and metadata) when available and skips fetch; otherwise keeps fetch for standalone/direct load.
- **Simulate entry in shell:** Button or control that sets `view=simulate` and navigates to `/map?view=simulate`; active state when on `/map` and `view=simulate`.
- **Bottom bar:** When `viewMode === 'simulate'`, hide map bottom bar (workflow strip, risk, filters).
- **Simulation sub-views (over time):** Register product views (chaos, teams, linear, agile, forces, traceability, zoom) as they are implemented; optional sub-view selector or URL.

---

## Work plan (embedded)

**Work items**

- [ ] **[View registry] Add generalized view registry**  
  Add a view registry (e.g. `src/lib/view-registry.ts` or under `content-renderers` as a sibling). Interface: register(id, descriptor), get(id), has(id), getIds() or list(). Descriptor: id, optional label, render (e.g. component or (props) => ReactNode). No migrations of existing code yet.

- [ ] **[Map views] Register graph and artifacts and switch WorldMapView to registry**  
  Register `graph` (default force-directed map) and `artifacts` (ArtifactsView) with props shape the map can pass (e.g. data, containerRef, scope). In `world-map-view.tsx`, replace `viewMode === 'artifacts' ? <ArtifactsView /> : (graph ...)` with lookup: `const View = viewRegistry.get(viewMode || 'graph')` and render View with props. Verify behavior unchanged.

- [ ] **[Simulate] Simulation component accepts initialGraph**  
  In HeroDemoScene (or simulation wrapper), add optional prop `initialGraph?: GraphData`. When `initialGraph` is present and valid, use it and skip the useEffect fetch; otherwise keep existing fetch. Ensure metadata (phase_grouping, etc.) is passed so clustering and beats work.

- [ ] **[Simulate] Register simulate view and pass initialGraph from map**  
  Register `simulate` in the view registry; descriptor renders simulation component. In WorldMapView, when rendering the simulate view, pass `initialGraph={data}` (and metadata) so simulate uses map’s current graph. Handle loading/empty state when data is null.

- [ ] **[Shell] Add Simulate control and URL/state**  
  In workbench shell, add a Simulate button (or tab) that sets view to simulate and navigates to `/map?view=simulate`. Ensure active state when pathname includes `/map` and view param is `simulate`. Sync viewMode with URL so deep link and back/forward work.

- [ ] **[Map] Hide bottom bar when view=simulate**  
  In WorldMapView, when `viewMode === 'simulate'`, do not render the bottom bar (workflow strip, risk summary, status filter, etc.).

- [ ] **[Sub-views] Register first simulation sub-view (optional / follow-up)**  
  When first product view (e.g. chaos = “nodes only”) is implemented, register it in the view registry and wire it (e.g. as default sub-view for simulate or via selector). Repeat for teams, linear, traceability, etc. as separate work items.

**Anticipated file touches**

| File / module | Expected change | Done |
|---------------|-----------------|------|
| `src/lib/view-registry.ts` (or `src/components/workbench/view-registry.tsx`) | New: ViewRegistry class and singleton; descriptor type | ☐ |
| `src/components/workbench/world-map-view.tsx` | Use viewRegistry.get() for map content; pass initialGraph to simulate; hide bottom bar when simulate | ☐ |
| `src/components/demo/HeroDemoScene.tsx` | Add optional initialGraph prop; skip fetch when set | ☐ |
| `src/components/workbench/shell.tsx` | Add Simulate button; navigate to /map?view=simulate; active state | ☐ |
| (New or existing) map view registration module | Register graph, artifacts, simulate with their components | ☐ |

**Validation (forecast vs actual)**

- Compare actual changes to this table when closing work items.
- Run `pnpm build` and `pnpm lint` after frontend changes.
- Manually: open map → select a timeline version → switch to simulate → confirm same graph and no extra fetch (e.g. network tab).

---

## Success (epic-level acceptance)

- [ ] User can switch to Simulate from the Map tab and see the same graph (or selected timeline version) in simulation mode without a second fetch.
- [ ] Map content (graph, artifacts, simulate) is resolved from the view registry; no hardcoded branch for these three in WorldMapView.
- [ ] Simulate control is visible and active state is correct; bottom bar is hidden when in simulate view.
- [ ] New views (e.g. chaos, traceability) can be added by registering in the view registry when implemented.

---

## Out of scope

- Migrating workbench-level tabs (map vs decisions) to the registry.
- Migrating decisions-panel or full-proposal-modal view branching.
- Changing the existing content renderer registry (artifact body rendering).
- Backend or ArtifactTemplate schema changes for simulation.
- Implementing all simulation sub-views (chaos, teams, linear, agile, forces, traceability, zoom); this epic establishes the registry and simulate-as-map-view; sub-views are follow-on.

---

## References

- **Plan:** [docs/SIMULATION_VIEW_AND_VIEW_REGISTRY_PLAN.md](./SIMULATION_VIEW_AND_VIEW_REGISTRY_PLAN.md)
- **Hero demo / beats:** [docs/HERO_DEMO_BEATS_AND_WORLD_MAP_REUSE.md](./HERO_DEMO_BEATS_AND_WORLD_MAP_REUSE.md)
- **Content renderer registry (pattern):** `src/components/workbench/content-renderers/index.tsx`
