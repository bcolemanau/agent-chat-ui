# PR: Map view history decision badges, decisions panel, and workbench updates

## Summary

Adds **Proposed / Approved / Rejected** badges to the map view history timeline (from backend commit messages), updates the decisions panel and approval flows, and refreshes workbench shell, org/project switchers, and stream handling for the feature branch.

---

## 1. Map view history: decision status badges

**File:** `src/components/workbench/world-map-view.tsx`

- **`parseDecisionCommitMessage(messageFull)`** — Parses backend commit `message_full` to extract `status` (e.g. `pending`, `approved`, `rejected`) and optional `type`. Backend uses `build_decision_commit_message`; message carries the decision outcome.
- **`decisionStatusLabel(status)`** — Maps status to UI label: `pending` → "Proposed", `approved` → "Approved", `rejected` → "Rejected".
- Timeline (version list) in **compare mode** and **single-version view** shows the resolved label as a badge per version, so users can see at a glance which versions are Proposed vs Approved vs Rejected.

---

## 2. Decisions panel and approval flows

**Files:** `src/components/workbench/decisions-panel.tsx`, `approval-card.tsx`, `single-proposal-approval-page.tsx`

- Decisions panel and approval card updated for consistent display of proposal state and actions.
- Single-proposal approval page: **reject** path wired (e.g. `persistDecisionRejected`), with toasts and UI for Approved / Rejected outcomes.
- Approval card shows Approved / Rejected states and success messaging (e.g. "Project created." on approve).

---

## 3. Hooks and decision types

**Files:** `src/components/workbench/hooks/use-pending-decisions.ts`, `use-processed-decisions.ts`, `src/lib/decision-types.ts`

- Hooks and shared decision types aligned with backend decision payload and status values so pending/processed lists and status labels stay in sync across the workbench.

---

## 4. Workbench shell, switchers, and stream

**Files:** `src/components/workbench/shell.tsx`, `sidebar.tsx`, `org-switcher.tsx`, `project-switcher.tsx`, `organization-management.tsx`, `src/providers/Stream.tsx`

- Shell, sidebar, org/project switchers, and organization management adjusted for current workbench layout and state.
- Stream provider updates for compatibility with staging and feature-branch API/events.

---

## 5. Concept brief diff view

**File:** `src/components/workbench/concept-brief-diff-view.tsx`

- Minor updates for diff display and alignment with decision/proposal data.

---

## 6. Docs

**File:** `docs/TROUBLESHOOTING_CONSOLE_ERRORS.md`

- Troubleshooting notes for console errors (updated for current stack).

---

## Testing

- Manual: Map timeline shows Proposed/Approved/Rejected badges when backend provides `message_full` with `status:` in the commit message.
- Decisions panel and single-proposal approval (approve/reject) flows work with current backend endpoints.

---

## Checklist

- [x] Map view timeline badges (parseDecisionCommitMessage, decisionStatusLabel)
- [x] Decisions panel and approval-card / single-proposal-approval-page updates
- [x] Hooks and decision-types in sync with backend
- [x] Shell, sidebar, org/project switchers, Stream provider updates
- [ ] (Optional) E2E or integration test for map history badges if desired
