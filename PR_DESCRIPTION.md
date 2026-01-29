# agent-chat-ui – PR: feature/issue-19-hydration-preview-view → staging

## Summary

Adds Decisions/workbench UX for hydration and other previews: unified previews hook, approval card, shell/Stream updates, and debug agent switcher. Replaces the previous approvals hook with a unified previews model and keeps approval count and auth behavior intact.

## Changes

### Unified previews and Decisions
- **`use-unified-previews`:** New hook replacing `use-unified-approvals`; same Decisions surface with a unified “preview” model (hydration, concept briefs, etc.).
- **Decisions page:** Uses `useUnifiedPreviews`; groupings and labels updated for preview types (e.g. Hydration Complete, Concept Brief Options).
- **Approval card:** Uses `UnifiedPreviewItem` from the new hook; threadId-aware submit so approvals apply to the correct thread and don’t cross threads after navigation.

### Workbench shell and Stream
- **Shell:** Mode label (supervisor/hydrator/concept); debug agent switcher (S/H/C) that calls `setActiveAgentDebug(agent)` to force active agent for the current thread.
- **Stream provider:** `setActiveAgentDebug(agent)` implemented via LangGraph client `threads.updateState` to set `active_agent` on the backend.
- **Approval count:** Preserved; badge and auto-route to Decisions view on new approvals (integrated with unified previews where applicable).
- **Auth:** Redirect unauthenticated users to login; authenticated users land in the workbench as before.

### Other
- **Hydration diff view:** Adjustments for layout/behavior in the workbench.
- **Workbench pages:** Decisions and main workbench page updated to use the new hook and routing.

## Files touched (main)

- `src/components/workbench/hooks/use-unified-previews.ts` (new)
- `src/components/workbench/hooks/use-unified-approvals.ts` (removed)
- `src/components/workbench/hooks/use-approval-count.ts`
- `src/components/workbench/approval-card.tsx`
- `src/components/workbench/shell.tsx`
- `src/components/workbench/hydration-diff-view.tsx`
- `src/app/workbench/decisions/page.tsx`
- `src/app/workbench/page.tsx`
- `src/providers/Stream.tsx`

## How to test

1. Run frontend against the Reflexion backend that supports `active_agent` and `threads.updateState`.
2. Sign in; confirm unauthenticated users are redirected to login.
3. Open a thread and trigger a hydration-complete (or other) proposal; confirm it appears in Decisions and is grouped correctly.
4. Approve/reject; confirm the action applies to the current thread and the approval count badge updates; confirm auto-route to Decisions when new approvals arrive (if enabled).
5. Use the S/H/C debug buttons in the header; confirm Mode label and backend agent stay in sync.
6. Open multiple threads/tabs; approve in one thread and confirm no cross-thread application of approvals.

## Base branch

- **Base:** `staging`  
- **Head:** `feature/issue-19-hydration-preview-view`
