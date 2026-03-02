# Schema-Driven UI Implementation Plan

Concrete steps to align the UI with the schema-driven API (decision types, phase change, labels). Work is split into **backend**, **config layer**, and **UI consumers**, with clear dependencies.

---

## Serial vs parallel

| Work | Serial or parallel | Why |
|------|--------------------|-----|
| **Phase 1.1** (config hook) | **Must be first** | Everything else consumes `getTypeLabel` / `isPhaseChange` from this hook. |
| **Phase 1.2** (fallback comment) | Can be same PR as 1.1 or anytime | Comment-only; no dependency. |
| **Phases 2.1, 2.2, 3.1, 3.2** | **Parallel after 1.1** | All four only depend on the extended hook. No dependency on each other. |
| **Phase 4.1** (artifact-types) | Parallel with 4.2 | Backend + UI for artifact labels vs backend + UI for apply mapping; independent. |
| **Phase 4.2** (apply_type) | Parallel with 4.1 | Same as above. |
| **Phase 4.3** (workflow_phases) | After 1.1; can parallel with 2.x/3.x | Uses `workflow_phases` from same config; no dependency on 2.x/3.x. |
| **Phase 5** | After the phase it cleans up | Defaults after 4.1; node labels after backend exposes them. |

**Practical split:**
- **Serial:** Do Phase 1.1 first.
- **Parallel track A:** Phase 2.1 (decisions panel).
- **Parallel track B:** Phase 2.2 (processed decisions).
- **Parallel track C:** Phase 3.1 (unified previews).
- **Parallel track D:** Phase 3.2 (tool-call titles).

Tracks A–D can be separate PRs or one PR after 1.1 is merged.

---

## Phase 1: Config layer (single source of truth)

**Goal:** The UI consumes the full `GET /config/decision-types` response and exposes helpers for labels and phase-change. No new backend endpoints.

### 1.1 Extend config types and hook (UI)

**Files:**  
- `src/components/workbench/hooks/use-decision-types-config.ts`  
- (optional) `src/types/decision-types-config.ts` if you prefer a shared types file

**Changes:**

1. **Define full config shape** (in hook file or `src/types/decision-types-config.ts`):

```ts
export interface DecisionTypeEntry {
  id: string;
  label?: string;
  phase?: string;
  workflow_phase?: string;
  phase_change?: boolean;
  apply_category?: string;
  primary_artifact_type?: string;
}

export interface DecisionTypesConfig {
  decision_types: DecisionTypeEntry[];
  org_phase_types: string[];
  workflow_phases?: string[];
}
```

2. **Update the hook** so it:
   - Parses and caches the full response (accept both current `{ org_phase_types }` and full `{ decision_types, org_phase_types, workflow_phases }` for backward compatibility).
   - Exposes:
     - `config: DecisionTypesConfig | null` (full)
     - `inferPhase(type: string): "Organization" | "Project"` (unchanged)
     - `getTypeLabel(type: string): string` — resolve from `decision_types` by `id`, fallback: `type.replace(/_/g, " ")` + title-case
     - `isPhaseChange(type: string): boolean` — true if config has an entry with that `id` and `phase_change === true`; fallback: keep current `PHASE_CHANGE_DECISION_TYPES` from `decision-types.ts` when config not loaded
   - Keeps existing cache key and TTL; invalidate when `decision_types` is present in response.

3. **Fallback behavior:**  
   If the API returns only `org_phase_types` (legacy) or fetch fails, keep using existing `DEFAULT_ORG_PHASE_TYPES` for phase and keep using the existing hardcoded label/phase-change fallbacks until config is available.

**Acceptance:** Hook returns `getTypeLabel` and `isPhaseChange`; when backend returns full `decision_types`, labels and phase-change come from config.

---

### 1.2 Keep fallbacks in `decision-types.ts` (UI)

**File:** `src/lib/decision-types.ts`

**Changes:**

- Leave `PHASE_CHANGE_DECISION_TYPES`, `DEFAULT_ORG_PHASE_TYPES`, `inferPhaseFromType`, and `isPhaseChangeDecisionType` as-is for now (used when config not yet loaded or API unavailable).
- Add a short comment that the canonical source is `useDecisionTypesConfig` and these are fallbacks only.

**Acceptance:** No behavior change; fallbacks still used when config is missing.

---

## Phase 2: Decisions panel and processed decisions

**Goal:** Decisions panel and processed-decisions logic use config for labels and phase-change.

### 2.1 Decisions panel – labels and phase-change from config

**File:** `src/components/workbench/decisions-panel.tsx`

**Changes:**

1. **Remove local `getTypeLabel`** (the big hardcoded `Record`). Use the one from the hook instead.
2. **Use hook’s `isPhaseChange`** when building rows:
   - In the `useMemo` that builds `orgRows`, `pendingRows`, and `processedRows`, replace:
     - `is_phase_change: isPhaseChangeDecisionType(d.type)` → `is_phase_change: isPhaseChange(d.type)` (from hook)
     - Same for `item.type` and `p.type`; for processed keep `p.is_phase_change ?? isPhaseChange(p.type)` so backend value still wins when present.
3. **Wire hook:** Ensure the component already uses `useDecisionTypesConfig()`; add `getTypeLabel` and `isPhaseChange` from the hook and use them everywhere you currently use `getTypeLabel(row.type)` and the phase-change badge.

**Acceptance:** Decision type labels and “Phase boundary” badge are driven by config when available; fallback when config not loaded.

---

### 2.2 Processed decisions – phase-change from backend or config

**File:** `src/components/workbench/hooks/use-processed-decisions.ts`

**Changes:**

1. **Option A (simplest):** Keep using `isPhaseChangeDecisionType` from `@/lib/decision-types` when normalizing backend records (e.g. when `r.is_phase_change == null`). No change if backend always sends `is_phase_change`.
2. **Option B (full schema-driven):** If you want processed decisions to also use config, pass `isPhaseChange` from the hook into this hook (or a small context). When mapping backend → local, use `is_phase_change: r.is_phase_change ?? isPhaseChange(r.type)` where `isPhaseChange` comes from config. This requires `useProcessedDecisions` to either receive a callback or read from a shared context that provides `isPhaseChange`.

**Recommendation:** Start with Option A; do Option B only if you need processed decisions to stay in sync with config without relying on backend always sending `is_phase_change`.

**Acceptance:** Processed decisions show correct phase-change badge; either from backend or from config fallback.

---

## Phase 3: Previews and tool-call titles

**Goal:** Preview titles and tool-call proposal titles use the same config-driven labels so they stay in sync with the decisions panel.

### 3.1 Unified previews – use config for decision-type labels

**File:** `src/components/workbench/hooks/use-unified-previews.ts`

**Changes:**

1. **Use decision-types config for tool names that match decision types:**  
   The hook cannot use React hooks (it’s used inside a `useMemo`). So either:
   - **Option A:** Pass `getTypeLabel: (type: string) => string` (and optionally a small map for “generate” artifact types) from the parent that has access to `useDecisionTypesConfig`. Parent calls `useDecisionTypesConfig()`, gets `getTypeLabel`, and passes it into the hook or into the function that builds titles.
   - **Option B:** In the component that uses `useUnifiedPreviews` (e.g. decisions panel or shell), compute a `titleByToolAndType` map from config once (decision_types by id → label; optionally artifact_type → label from same or future config), and pass it into the hook so `getPreviewTitle(toolName, request, titleMap)` can look up instead of switching.

2. **Concrete approach (Option A):**  
   - In `decisions-panel.tsx` (or shell), get `getTypeLabel` from `useDecisionTypesConfig()`.
   - Change `useUnifiedPreviews` to accept an optional `getTypeLabel?: (type: string) => string`.
   - Inside the hook, when building each item’s `title`, if `getTypeLabel` is provided and the item has a `type` (e.g. decision type or tool name that is a decision type), use `getTypeLabel(type)` for the title when the current logic would have used a hardcoded string. For the “generate” branch, use `getTypeLabel(artifactType)` if the artifact type matches a decision type id, else keep a small fallback map or generic format.

3. **Reduce hardcoding:** Replace the big `switch (toolName)` in `getPreviewTitle` with:
   - First: if `getTypeLabel` and we have a single type (e.g. tool name is the decision type, or `request.args?.artifact_type`), use `getTypeLabel(type)`.
   - Then: keep only the cases that need dynamic parts (e.g. “Project Proposal: ${name}”, “Add user: ${email}”), and use config for the base label where possible.

**Acceptance:** Preview titles for decision types (and where applicable artifact types) come from config; dynamic parts (names, ids) still work.

---

### 3.2 Tool-call proposal titles – use config

**Files:**  
- `src/components/thread/messages/tool-calls.tsx`  
- Optional: a provider (e.g. `src/providers/DecisionTypesConfig.tsx`) or the layout that wraps the chat/thread so tool-calls can access config.

**Changes:**

1. **Provide config to the thread:** Either:
   - Call `useDecisionTypesConfig()` in the parent that renders `tool-calls.tsx` and pass `getTypeLabel` as a prop, or
   - Add a lightweight `DecisionTypesConfigContext` that fetches config once and provides `getTypeLabel` (and optionally `isPhaseChange`), and wrap the chat/thread tree in that provider (e.g. in the layout or shell that already has access to the workbench).
2. **Update `getProposalTitle`:** Either:
   - Pass `getTypeLabel` as an argument and use it for tool names that are decision types (and artifact types if you add artifact config later), or
   - Move `getProposalTitle` to a place where it can use the hook, or
   - Create a small context `DecisionTypesConfigContext` that provides `getTypeLabel` and `isPhaseChange`, and have `getProposalTitle` read from it (or receive `getTypeLabel` from the component that reads context and passes it in).
3. **Replace the switch:** Same idea as previews: for each tool name that corresponds to a decision type, use `getTypeLabel(toolName)`; keep only the cases that need variable substitution (e.g. project name, user email).

**Acceptance:** Tool-call cards show the same labels as the decisions panel for the same types.

---

## Phase 4: Optional backend and UI extensions

**Goal:** Support artifact-type labels and proposal→apply mapping from schema; use workflow_phases if desired.

### 4.1 (Backend) Expose artifact type labels

**Repo:** Reflexion (backend)

**Options:**

- **A.** Add a `GET /config/artifact-types` that returns `[{ id, label, template_id?, ... }]` from the same merge/schema that defines `artifact_type_to_kg_merge` (and any existing artifact display names).
- **B.** Add a `label` (or `display_name`) to each entry in the merge file for artifact types and expose them in an existing config (e.g. extend a config endpoint that already returns merge-related data).

**UI:** Add a small hook `useArtifactTypesConfig()` that fetches this and exposes `getArtifactTypeLabel(id: string)`. Use it in approval-card, unified-previews (for “generate” + artifact_type), and anywhere else artifact types are shown.

**Acceptance:** New artifact types get correct labels in the UI without code changes.

---

### 4.2 (Backend) Proposal → apply type mapping in schema

**Repo:** Reflexion (backend)

**Changes:**

- In `ArtifactTemplates_kg_merge.json`, for decision types that are “proposal” types and resolve to another type on apply, add a field, e.g. `apply_type` or `resolves_to_id` (e.g. `propose_organization` → `create_organization`, `propose_user_add` → `add_user`).
- In `GET /config/decision-types`, include this field in each `decision_types[]` entry (or document that the UI should send the proposal type and the backend resolves it; then the UI doesn’t need the map).

**UI:** In `approval-card.tsx`, replace the hardcoded `adminTypes` and the proposalType mapping with a lookup from config: for the current `item.type`, read `apply_type` (or `resolves_to_id`) from the decision_types config; use that as the apply type when calling the apply API.

**Acceptance:** Adding or changing proposal/apply pairs only requires schema changes, not UI code.

---

### 4.3 Use `workflow_phases` in the UI (optional)

**File:** e.g. `src/components/workbench/decisions-panel.tsx` or a new “Decisions filters” component

**Changes:**

- From `useDecisionTypesConfig()` use `config.workflow_phases` (and optionally `workflow_phase` per decision type) to:
  - Group or filter decisions by workflow phase (e.g. Organization | ProjectConfiguration | ProjectExecution), and/or
  - Show phase tabs or a phase filter.

**Acceptance:** Decisions can be grouped or filtered by schema-defined workflow phase.

---

## Phase 5: Cleanup and defaults

**Goal:** Remove redundant hardcoding and align defaults with schema.

### 5.1 Default artifact type fallbacks

**Files:** e.g. `approval-card.tsx`, enrichment components

**Changes:**

- If backend exposes a default (e.g. first artifact type or `default_artifact_type` in config), use it instead of hardcoded `"concept_brief"` or `"Requirements"`.
- Otherwise, keep current fallbacks but document that they should be replaced when artifact-type config exists.

**Acceptance:** Defaults are config-driven where the backend provides them.

---

### 5.2 KG node type labels (future)

**File:** `src/components/workbench/node-detail-panel.tsx`

**Changes:**

- Only when the backend exposes node-type metadata (e.g. from kg_ontology or artifact schema): add a small hook or config fetch and replace the hardcoded `typeConfig` (EPIC, REQUIREMENT, etc.) with that.

**Acceptance:** Node type labels are schema-driven when the API exists.

---

## Dependency order

```
Phase 1.1 (config hook + types) ──┬──► Phase 2.1 (decisions panel)     ──┐
     │                            ├──► Phase 2.2 (processed decisions) ──┤ parallel
     │                            ├──► Phase 3.1 (unified previews)   ──┤
     │                            └──► Phase 3.2 (tool-call titles)     ──┘
     │
     ├──► Phase 4.3 (workflow_phases; optional) — can run in parallel with 2.x/3.x
     │
Phase 4.1 (artifact-types API) ──► use in approval-card, previews, pickers  ──┐ parallel
Phase 4.2 (apply_type in schema) ──► approval-card mapping                   ──┘

Phase 5: cleanup and defaults (after 1–3, and 4 if done)
```

---

## Suggested implementation order

1. **Phase 1.1** (serial) – Extend config types and hook; add `getTypeLabel` and `isPhaseChange` with fallbacks.
2. **Phases 2.1, 2.2, 3.1, 3.2** (parallel) – In any order or simultaneously: wire decisions panel (2.1), processed decisions (2.2), unified previews (3.1), and tool-call titles (3.2) to the hook.
3. **Phase 4** (parallel where possible) – Backend artifact-types (4.1) and apply_type (4.2) can be done in parallel; workflow_phases (4.3) and Phase 5 as needed.

---

## Testing

- **Config hook:** Unit test that with a full `decision_types` response, `getTypeLabel(id)` returns `label` and `isPhaseChange(id)` respects `phase_change`; with missing/partial response, fallbacks are used.
- **Decisions panel:** Manually or via integration test: change a label or `phase_change` in the backend schema, reload config, and confirm the panel updates.
- **Previews / tool-calls:** Same: change a label in schema and confirm preview and tool-call titles match.
- **Backward compatibility:** Ensure that when the backend returns only `org_phase_types`, the UI still works (phase inference and existing fallback labels).

---

## Files touched (summary)

| Phase | File | Action |
|-------|------|--------|
| 1.1 | `use-decision-types-config.ts` | Extend types; parse full response; add `getTypeLabel`, `isPhaseChange` |
| 1.2 | `decision-types.ts` | Comment only (fallbacks) |
| 2.1 | `decisions-panel.tsx` | Remove local getTypeLabel; use hook getTypeLabel + isPhaseChange |
| 2.2 | `use-processed-decisions.ts` | Optional: use config isPhaseChange when backend null |
| 3.1 | `use-unified-previews.ts` | Accept getTypeLabel; use for titles |
| 3.2 | `tool-calls.tsx` | Use getTypeLabel (props/context) in getProposalTitle |
| 4.1 | Backend + new hook | New artifact-types config + useArtifactTypesConfig |
| 4.2 | Backend merge JSON + proxy + approval-card | apply_type in schema; approval-card reads it |
| 4.3 | decisions-panel or new component | workflow_phases tabs/filters |
| 5.x | approval-card, node-detail-panel | Defaults and node typeConfig from config when available |

This plan gives you a concrete, ordered set of changes to make the UI fully schema-driven for decision types and phase-change, with a clear path to artifact types and proposal→apply mapping.
