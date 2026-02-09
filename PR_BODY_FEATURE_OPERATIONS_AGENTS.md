# PR: feature/operations-agents-two-roles – Decision map diff visibility

## Summary
- **Decision + map view:** When the Decisions tab is in "Map (decisions + world map)" layout and the user selects a processed decision row (with a KG version), the map now shows a visible **"Diff for selected decision"** strip with Added/Modified/Removed counts. The diff was already applied to the graph; this change makes it clear that the map is showing the diff for the selected decision.

## Changes

### `src/components/workbench/world-map-view.tsx`
- When `embeddedInDecisions` and a decision version is selected (`selectedTimelineVersionId`), render a compact strip below the "Knowledge Graph Mode" pill:
  - **"Diff for selected decision"** heading
  - While loading: "Loading diff…"
  - When loaded: Added / Modified / Removed counts from `timelineVersionDiff.summary`
- Uses existing `KG_DIFF_COLORS` for the count indicators. The Graph/Diff list toggle and legend continue to show when the diff payload has `type === "kg_diff"`.

## Testing
- Go to Decisions → Map (decisions + world map).
- Select a **processed** decision row that has a KG version (e.g. "Added artifact …", "Classification applied: S1").
- Confirm the map shows the "Diff for selected decision" strip with counts (and, when applicable, the graph colored by diff and the Graph/Diff list toggle).

## Notes
- Backend must return `kg_version_sha` for processed decisions and history/diff from the same branch as storage (`GITHUB_STORAGE_BRANCH`) so the map can load the correct version and diff.
