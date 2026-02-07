# PR: Decisions UX, settings route, org switcher, KG diff, and tool result display

**Branch:** `feature/operations-agents-two-roles`  
**Base:** `origin/staging`

## Summary

- Simplify Decisions tab to Split and Map only; hide map controls when map is embedded in Decisions.
- Fix System Settings navigation to `/workbench/settings` (no longer `view=settings` on map).
- Show organization selector for `newco_admin` (and other admin roles).
- Keep node detail in edit mode after applying a revise from agent chat.
- KG diff: hide unchanged nodes/edges by default with option to show them; improve section labels.
- Tool results: friendly Knowledge Graph Summary for `get_kg_with_decisions`; show “No arguments” for tools with no args.
- Remove architecture-specific renderer; rely on markdown rendering and approval/full-proposal UX improvements.

## Changes

### Decisions panel

- **`src/components/workbench/decisions-panel.tsx`**
  - Removed Cards, Table, and Hybrid view modes. Only **Split** and **Map** remain (default: Split).
  - Table is always the left column; right column is either detail pane (Split) or World Map (Map).
  - Removed `expandedId`, Actions column, and hybrid inline-expand.
  - `ViewMode` is now `"split" | "map"`.

### World map

- **`src/components/workbench/world-map-view.tsx`**
  - Map controls (workflow strip, filter, search, zoom in bottom panel) render only when **not** embedded in Decisions (`!embeddedInDecisions`).
  - When embedded in Decisions tab, map is shown without duplicate controls.

### Navigation and shell

- **`src/components/workbench/shell.tsx`**
  - System Settings button navigates to **`/workbench/settings`** instead of setting `view=settings` on the current path.
  - Admin check includes `newco_admin`: `["reflexion_admin", "admin", "newco_admin"]` so org selector is visible for all relevant admins.

### Organization switcher

- **`src/components/workbench/org-switcher.tsx`**
  - Organization selector visibility updated to include `newco_admin` (and other admin roles that can access Organization Management).

### Node detail and revise

- **`src/components/workbench/node-detail-panel.tsx`**
  - When applying a revise from agent chat, the panel stays in **edit (source) mode** and focuses the textarea (`setEditPreviewMode(false)` and `setTimeout(… focus(), 0)`).

### KG diff

- **`src/components/workbench/kg-diff-diagram-view.tsx`**
  - **Unchanged** nodes/edges are hidden by default.
  - Checkbox “Show unchanged (X nodes, Y edges)” when unchanged items exist.
  - Section headers show counts (e.g. “Nodes (5 of 182)”).
  - Empty state when everything is unchanged explains to enable “Show unchanged.”

### Tool results

- **`src/components/thread/messages/tool-calls.tsx`**
  - For **`get_kg_with_decisions`**: render a “Knowledge Graph Summary” card (entity counts, artifact count, decisions count) instead of raw `{}` / JSON.
  - For tool calls with no arguments: show “No arguments” instead of `{}`.

### Content and approvals

- **`src/components/workbench/content-renderers/architecture-renderer.tsx`** – Removed; architecture content handled via markdown.
- **`src/components/workbench/content-renderers/markdown-renderer.tsx`** – Adjustments for consistent rendering.
- **`src/components/workbench/approval-card.tsx`** – Approval card UX improvements.
- **`src/components/workbench/full-proposal-modal.tsx`** – Full proposal modal tweaks.
- **`src/components/workbench/enrichment-view.tsx`**, **`src/components/thread/enrichment-approval.tsx`** – Minor updates.
- **`src/components/workbench/hooks/use-processed-decisions.ts`**, **`use-unified-previews.ts`** – Hook updates for Decisions behavior.

### Other

- **`src/app/globals.css`**, **`src/components/thread/markdown-styles.css`**, **`src/components/thread/markdown-text.tsx`** – Styles and markdown display.
- **`src/components/thread/user-menu.tsx`** – User menu updates.
- **`src/components/workbench/artifacts-list-view.tsx`**, **`src/components/workbench/sidebar.tsx`** – List/sidebar tweaks.
- **`src/config/users.ts`** – User/role config if needed for `newco_admin`.
- **New:** `src/lib/workflow-agent-colors.ts`, `src/app/api/kg/`, `docs/PROXY_ROUTES_SUMMARY.md`, `docs/TEMPLATE_ARTIFACT_HARMONIZATION.md`, `public/map-legend-hierarchy-mockup.html`.

## Verification

- Open Workbench → Decisions: confirm only Split and Map; map embedded without extra controls.
- Click System Settings: URL is `/workbench/settings`.
- As `newco_admin`: organization selector visible.
- Apply a revise from agent chat on a node: detail panel stays in edit mode with focus in textarea.
- Open a project diff with KG diff: unchanged items hidden by default; “Show unchanged” toggles them; section counts correct.
- Trigger `get_kg_with_decisions`: tool result shows Knowledge Graph Summary card; no-arg tools show “No arguments.”

## Related

- Backend: **Reflexion** repo PR (graph_simplified entrypoint, operations agents, project configurator, proxy) – see `PR.md` in that repo.
