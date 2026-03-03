# Integrated Plan: Simulation as Map View + Generalized View Registry

This document is the implementation plan for exposing simulation as a map view mode and introducing a generalized view registry for map content (and later simulation sub-views). It is the source of truth for order of work, file touches, and data flow.

**Epic:** [EPIC_SIMULATION_VIEW_AND_VIEW_REGISTRY.md](./EPIC_SIMULATION_VIEW_AND_VIEW_REGISTRY.md)  
**Hero demo / beats:** [HERO_DEMO_BEATS_AND_WORLD_MAP_REUSE.md](./HERO_DEMO_BEATS_AND_WORLD_MAP_REUSE.md)

---

## 1. Goals

- Expose **simulate** as a **map view mode** (same data as map, no extra fetch when coming from map).
- Treat simulation beats as **product views** (selectable map/simulation modes).
- Introduce a **generalized view registry** and use it only for **new and touched views** in this work.
- Reuse the **existing content renderer registry** pattern; don’t migrate untouched views yet.

---

## 2. Current State (Reference)

### 2.1 Map view and URL

- **Route:** Workbench Map lives under `/map` (e.g. `/org/.../project/.../map`). Decisions is a separate route `/decisions`.
- **Query param:** `view` is synced via `useQueryState("view", { defaultValue: "map" })` in both **shell** and **WorldMapView**. Allowed values today: `map`, `artifacts`. We add `simulate`.
- **Shell tabs:** Three controls — Map (`view=map`), Artifacts (`view=artifacts`), Decisions (navigates to `/decisions`). Map and Artifacts stay on `/map` and only change the query param.

### 2.2 WorldMapView branching

- **File:** `src/components/workbench/world-map-view.tsx`
- **State:** `viewMode` from `useQueryState("view", { defaultValue: "map" })` (line ~204).
- **Branching (two places):**
  1. **~1934–2033:** Inside the “canvas” area when a node is selected: `viewMode === 'artifacts' ? <ArtifactsView /> : (<> ... graph SVG and loading/error ... </>)`.
  2. **~2060–2080+:** When no node is selected: same pattern `viewMode === 'artifacts' ? <ArtifactsView /> : (<> ... graph ... </>)`.
- **Data:** Map fetches KG via `fetchData()` and holds `data` (GraphData: `nodes`, `links`, `metadata` with `phase_grouping`, `entity_counts`, etc.). Loading/error states are shown only for the graph branch; ArtifactsView is rendered without the same loading UI.

### 2.3 Content renderer registry (unchanged)

- **File:** `src/components/workbench/content-renderers/index.tsx`
- **Pattern:** `ContentRendererRegistry` with `register(contentType, renderer)`, `get(contentType)`, `has()`, `getContentTypes()`. Renderers implement `ContentRenderer` (`render(content, metadata)`). Used for **artifact body** rendering in node-detail and approval flows.
- **Scope:** This plan does **not** change the content renderer registry. The new **view registry** is a separate abstraction for “which component fills the map content area” (graph vs artifacts vs simulate).

### 2.4 HeroDemoScene (demo)

- **File:** `src/components/demo/HeroDemoScene.tsx`
- **Data:** Fetches via `/api/demo/kg` (optionally with `phase_id`, etc.) in a `useEffect`; falls back to synthetic graph. Has its own `GraphData`-like interface (`nodes`, `links`, `metadata.phase_grouping`, etc.).
- **Gap:** No `initialGraph` prop; always fetches (or uses synthetic). To use map’s data when embedded as a view, we add optional `initialGraph` and skip fetch when it is present and valid.

---

## 3. Generalized View Registry (Minimal Start)

### 3.1 Purpose

A single **view registry** maps view **ids** to descriptors so that map content (graph, artifacts, simulate) is resolved by lookup instead of hardcoded conditionals. Later, simulation sub-views (chaos, teams, linear, etc.) can be registered as well.

### 3.2 Interface (TypeScript)

- **Location:** New file `src/lib/view-registry.ts` (or `src/components/workbench/view-registry.tsx` if components are registered directly).
- **Descriptor shape:**

```ts
export interface MapContentViewDescriptor {
  id: string;
  label?: string;
  /** Component or render function. Receives props from WorldMapView (data, containerRef, scope, etc.). */
  render: (props: MapContentViewProps) => React.ReactNode;
}

export interface MapContentViewProps {
  data: GraphData | null;
  loading: boolean;
  error: string | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Scope from route (orgId, projectId, threadId, etc.) for child views that need to fetch or link. */
  scope?: { orgId?: string; projectId?: string; threadId?: string; phaseId?: string };
  /** When view is simulate: pass map's graph so simulate doesn't re-fetch. */
  initialGraphForSimulate?: GraphData | null;
  // Add other props the map already has and that graph/artifacts/simulate need (e.g. onRetry).
}
```

- **Registry API:** `register(id, descriptor)`, `get(id): MapContentViewDescriptor | undefined`, `has(id): boolean`, `getIds(): string[]`. Singleton `viewRegistry` exported.

### 3.3 Initial registrations

| View id     | Description                    | Component / render content |
|------------|--------------------------------|----------------------------|
| `map`      | Default force-directed graph   | Current graph SVG + loading/error + controls (existing inline JSX). |
| `artifacts`| Artifacts list + detail       | `<ArtifactsView />` (existing). |
| `simulate` | Simulation (hero beats)       | Simulation wrapper that renders HeroDemoScene (or equivalent) with `initialGraph={data}` when present. |

- **Content renderer registry:** Keep as-is for artifact body rendering; no change. Optionally later: treat it as one category inside a broader “view” abstraction; out of scope for this plan.

### 3.4 GraphData shape (shared)

Both WorldMapView and HeroDemoScene use a similar shape. For `initialGraph` we pass the same structure the map has:

- `nodes`, `links` (array of node/link objects with `id`, `type`, `name`, etc.).
- `metadata`: at least `phase_grouping` (for clustering/beats), optional `entity_counts`, `link_type_counts`, `customer_id`, `thread_id`, etc.

Simulation component should accept a **compatible** GraphData type (can be a shared type in `src/lib` or `src/types` if needed).

---

## 4. Simulation as Map View Mode

### 4.1 URL and state

- **View param:** Allow `view=simulate` in addition to `view=map` and `view=artifacts`. No new route; still under `/map`.
- **Shell:** Include `simulate` in the list of map sub-views so that when on `/decisions` with `viewMode === 'simulate'`, we navigate to `/map?view=simulate` (same fix as for `map` and `artifacts` today at shell.tsx ~313).

### 4.2 Data source for simulate

- When the user switches from map (or artifacts) to simulate **while the map has already loaded data**, pass the map’s current `data` (and metadata) as **initialGraph** into the simulation component. **No fetch** when `initialGraph` is present and valid.
- If the user opens simulate before the map has loaded (e.g. direct deep link to `/map?view=simulate`), simulation can either fetch itself (current demo behavior) or show an empty/loading state that reflects “no graph yet”.
- **Timeline/version:** Simulate runs on whatever the map is showing. If the user selected a prior version in the map timeline, that version’s graph is what is in `data`; pass it as `initialGraph` so simulate shows the same version.

### 4.3 Simulation component contract

- **HeroDemoScene** (or a thin wrapper used only when embedded in the map) accepts optional **initialGraph** (e.g. `initialGraph?: GraphData | null`).
- When `initialGraph` is present and has `nodes` (and optionally `links`/`metadata`), use it and **skip** the `useEffect` fetch. Otherwise keep existing fetch (and optional `phase_id`/credentials for project-scoped demo).
- Ensure metadata (`phase_grouping`, etc.) is passed so clustering and beats work when data comes from the map.

---

## 5. Map Content Views → View Registry

### 5.1 Replacement strategy

- **Replace** the two hardcoded branches in `world-map-view.tsx`:
  - Current: `viewMode === 'artifacts' ? <ArtifactsView /> : (<> ... graph ... </>)`.
  - New: resolve view by id, e.g. `const descriptor = viewRegistry.get(viewMode || 'map'); if (!descriptor) return fallback; return descriptor.render({ data, loading, error, containerRef, scope, initialGraphForSimulate: viewMode === 'simulate' ? data : undefined, ... })`.
- **Registration:** At app init (or when the workbench module loads), register `map`, `artifacts`, and `simulate` with their respective render implementations. The “map” (graph) descriptor can wrap the existing inline JSX (loading, error, SVG, controls) so behavior is unchanged.

### 5.2 Props passed to registered views

- **graph (map):** needs `data`, `loading`, `error`, `containerRef`, and any callbacks/state the current graph branch uses (e.g. `fetchData`, `svgRef`, filters, diff state). Either pass these in `MapContentViewProps` or extend the descriptor type for map-specific props.
- **artifacts:** currently `<ArtifactsView />` with no props in the current code; can receive `scope` and `data` if we want artifacts to show “current graph” context later.
- **simulate:** needs `data` as `initialGraph`, `containerRef`, and `scope` (for phase_id/project when falling back to fetch). Optional: `loading`/`error` to show a message when data is null and simulate is chosen before load.

### 5.3 Loading and error for simulate

- When `viewMode === 'simulate'` and `data` is null (e.g. initial load or failed fetch), the simulate view can show a short message: “Load the map first” or “Switch to Map to load the graph, then Simulate.” Alternatively, simulate can trigger a fetch when `initialGraph` is absent (same as standalone demo). Plan: **prefer passing data only**; if `data` is null, simulate view shows a lightweight empty/loading state or a one-line prompt to switch to map and back.

---

## 6. Simulation Sub-Views (Product Views from Beats)

Map hero demo beats to **selectable product views** and add them to the registry as they are implemented:

| View id        | Product concept | Beat reference |
|----------------|------------------|----------------|
| **chaos**      | Map with no edges (nodes only). | Beat 1 |
| **teams**      | Phase/artifact constellations + hulls (tribe labels). | Beat 2 |
| **linear**     | Same in linear (workflow) layout. | Beat 3 |
| **agile**      | Same in circular (agile) layout. | Beat 4 |
| **forces**     | Trigger-style / “saved decision” emphasis. | Beat 5 |
| **traceability** | Link emphasis (ricochets / traceability). | Beat 6 |
| **zoom**       | Search/zoom to focus node. | Beat 7 |

Each can be a separate view id in the registry when built. Simulate mode can either show **one at a time** (user picks sub-view id, e.g. from a dropdown or URL `view=simulate&sub=chaos`) or keep the **narrative** that cycles through beats. This plan only requires the registry to support these ids; implementing each sub-view is follow-on work.

---

## 7. UI and Shell

### 7.1 Simulate entry point

- Add a **Simulate** control (button or tab) alongside Map and Artifacts. On click: `setViewMode("simulate")` and, if not already on `/map`, `router.push(workbenchHref("/map?view=simulate"))`.
- **Active state:** When `pathname` includes `/map` and `view === 'simulate'`, the Simulate control is active (same styling as Map/Artifacts when active).
- **Location:** Same tab row as Map and Artifacts in `shell.tsx` (around lines 635–681). Add a fourth button “Simulate” with an icon (e.g. Sparkles or Play).

### 7.2 URL and backend sync

- Include `simulate` in the list of map sub-views when syncing with backend (`stream.setWorkbenchView(viewMode)`) so the backend can store “last view” as `simulate` if desired. Update the check that navigates from `/decisions` to `/map`: use `["map", "artifacts", "simulate"].includes(viewMode)` (currently only `["map", "artifacts"]` at ~313).

### 7.3 Bottom bar (map chrome)

- When `viewMode === 'simulate'`, **hide** the map bottom bar: workflow strip, risk summary, status filter, and any other map-only chrome that doesn’t apply to simulation. Option A: inside WorldMapView, when rendering the simulate view, do not render the bottom bar section. Option B: hide the bar in the parent when view is simulate. Prefer **Option A** so the registry-rendered view is self-contained.

---

## 8. Implementation Order (Step-by-Step)

### Phase A: View registry and map content

1. **Add view registry module**
   - Create `src/lib/view-registry.ts` (or under `components/workbench/`): types `MapContentViewDescriptor`, `MapContentViewProps`, and class or singleton `viewRegistry` with `register`, `get`, `has`, `getIds`.
   - Export shared `GraphData`-like type if not already shared (or use a type that both map and demo accept).

2. **Register graph and artifacts**
   - Create a registration module (e.g. `src/components/workbench/map-view-registrations.tsx` or inline in WorldMapView) that:
     - Registers `map` with a descriptor whose `render` returns the current graph branch JSX (loading, error, SVG, controls).
     - Registers `artifacts` with a descriptor that returns `<ArtifactsView />`.
   - In WorldMapView, **replace** the two branching blocks with: resolve `descriptor = viewRegistry.get(viewMode || 'map')`; if no descriptor, fallback to graph; else `descriptor.render({ data, loading, error, containerRef, scope, ... })`.
   - Verify behavior: Map and Artifacts look and behave the same (no regression).

### Phase B: Simulate view and data passing

3. **HeroDemoScene accepts initialGraph**
   - In `HeroDemoScene.tsx`, add optional prop `initialGraph?: GraphData | null` (use a type compatible with existing demo GraphData).
   - In the data-fetching `useEffect`, when `initialGraph` is present and has `nodes?.length`, skip the fetch and set local state (or use `initialGraph` directly) so the rest of the component runs on that data.
   - Ensure `metadata.phase_grouping` (and any other fields the beats need) are passed through so clustering and layouts work.

4. **Register simulate view**
   - Register `simulate` in the view registry. The descriptor’s `render` returns a wrapper that:
     - Receives `data` (and optionally `initialGraphForSimulate` or just `data` when view is simulate).
     - Renders HeroDemoScene (or the same component used on `/demo`) with `initialGraph={data}` when `data` is present; otherwise `initialGraph={undefined}` so the demo can fetch or show empty.
   - In WorldMapView, when calling `descriptor.render(...)`, pass `data` as the initial graph for the simulate view (and the same `scope` for phase_id if the component needs it for fallback fetch).

5. **Wire view param**
   - Ensure `view=simulate` is a valid value: WorldMapView already uses `viewMode` from URL; no change needed unless the default or validation excludes it. Add `simulate` to any allowlists (e.g. shell’s list of map sub-views).

### Phase C: Shell and chrome

6. **Simulate button and navigation**
   - In `shell.tsx`, add a Simulate button next to Map and Artifacts (same tab row). On click: `setViewMode("simulate")`; if `!pathname?.includes("/map")`, `router.push(workbenchHref("/map?view=simulate"))`.
   - Active state: `pathname?.includes("/map") && viewMode === "simulate"` → same active styling as Map/Artifacts.
   - Update the effect that redirects from `/decisions` when viewMode is a map sub-view: include `"simulate"` in the array (e.g. `["map", "artifacts", "simulate"].includes(viewMode)`).

7. **Hide bottom bar when view=simulate**
   - In WorldMapView, the bottom bar (workflow strip, risk, filters) is rendered only when the current view is not simulate. E.g. wrap the bottom bar in `viewMode !== 'simulate' && (...)` or let the registered “map” descriptor own the bottom bar and not render it for the simulate descriptor.

### Phase D: Sub-views (follow-on)

8. **Simulation sub-views**
   - As each product view (chaos, teams, linear, agile, forces, traceability, zoom) is implemented, register it in the view registry. Optionally add a sub-view selector inside the simulate view or a URL param (e.g. `view=simulate&sub=chaos`) and resolve the sub-view component from the registry. This can be a separate task per sub-view.

---

## 9. File Touch Summary

| File | Change |
|------|--------|
| `src/lib/view-registry.ts` (new) | View registry class, `MapContentViewDescriptor`, `MapContentViewProps`, singleton export. |
| `src/components/workbench/world-map-view.tsx` | Use `viewRegistry.get(viewMode \|\| 'map')` for map content; pass `data`/`scope`/`initialGraphForSimulate`; hide bottom bar when `viewMode === 'simulate'`. |
| `src/components/workbench/map-view-registrations.tsx` (new, or inline) | Register `map`, `artifacts`, `simulate` with their render functions/components. |
| `src/components/demo/HeroDemoScene.tsx` | Add optional `initialGraph` prop; skip fetch when present and valid. |
| `src/components/workbench/shell.tsx` | Add Simulate button; active state for `viewMode === 'simulate'`; include `simulate` in map sub-view list for redirect from `/decisions`. |

---

## 10. Validation

- **Regression:** Map and Artifacts tabs behave exactly as before (same loading, error, graph, artifacts list).
- **Simulate:** From Map (with data loaded), switch to Simulate → same graph appears in narrative/beats mode; network tab shows no second KG fetch when switching to simulate. Direct navigate to `/map?view=simulate` either shows empty/loading or one fetch (acceptable).
- **Timeline:** Select an older version in the map timeline, then switch to Simulate → simulation shows that version’s graph.
- **Shell:** Simulate is visible and active when on `/map` with `view=simulate`; bottom bar is hidden in simulate view.

---

## 11. Out of Scope for This Plan

- Migrating workbench-level tabs (Map vs Decisions) to the registry.
- Migrating decisions-panel or full-proposal-modal view branching.
- Changing the content renderer registry (artifact body rendering).
- Backend or ArtifactTemplate changes for simulation.
- Implementing all simulation sub-views (chaos through zoom); only the registry and simulate-as-map-view are in scope; sub-views are follow-on.

---

## 12. References

- **Epic:** [EPIC_SIMULATION_VIEW_AND_VIEW_REGISTRY.md](./EPIC_SIMULATION_VIEW_AND_VIEW_REGISTRY.md)
- **Hero demo / beats:** [HERO_DEMO_BEATS_AND_WORLD_MAP_REUSE.md](./HERO_DEMO_BEATS_AND_WORLD_MAP_REUSE.md)
- **Content renderer pattern:** `src/components/workbench/content-renderers/index.tsx`
- **WorldMapView:** `src/components/workbench/world-map-view.tsx` (viewMode, ArtifactsView, graph branch at ~1934 and ~2060)
- **Shell:** `src/components/workbench/shell.tsx` (viewMode, Map/Artifacts/Decisions tabs, redirect at ~313)
- **HeroDemoScene:** `src/components/demo/HeroDemoScene.tsx` (fetch in useEffect, GraphData shape)
