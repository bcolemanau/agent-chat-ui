# Template artifact type harmonization

Artifact templates (concept brief, UX brief, requirements, architecture, design) are **harmonized** for view and edit: all render as Markdown and use the same edit pane (scroll, header, layout). This doc summarizes what is unified and what still differs (and why).

## Unified (same behavior)

- **View / edit pane**: All template types use the markdown renderer; same scroll container, header, and layout (node-detail-panel + markdown-renderer).
- **Backend content_type**: `get_artifact_content` returns `content_type: "markdown"` for all template text artifacts (normalized at end of handler).
- **Full proposal modal**: If `preview_data.content` or `preview_data.markdown` is present, it is rendered as Markdown for **any** artifact proposal type. Otherwise requirements/architecture/design fall back to structured parsers (requirements_data, architecture_data, design_data).
- **“View full proposal”**: Shown for any artifact proposal type when preview has markdown or structured data (concept/ux/requirements/architecture/design).
- **Diff preview container**: Same container (min-h-0, no inner max-height) for all artifact proposal types in the approval card.
- **Badge color**: All artifact proposal types use the same purple badge in the Decisions pane.
- **Labels**: use-unified-previews gives a specific label per type (e.g. “Architecture Proposal”, “Design Proposal”) for clarity; no special branching.

## Still different (by design)

- **Apply payload (backend)**: Concept/UX use `option_index` + optional `draft_content`; architecture uses `selected_option_index`; requirements/design use `cache_key` + config. These map to different agent save tools; the response shape is the same.
- **Draft content fetch (UI)**: Only concept_brief and ux_brief currently fetch `/api/artifact/draft-content` before apply (for option_index). Requirements/architecture/design could be extended if the backend adds multi-option drafts.
- **Options approval page**: Only concept_brief and ux_brief have the multi-option approval flow (options-approval-page); others are single-proposal apply. Backend-driven.
- **Structured full proposal**: When there is no `content`/`markdown`, requirements/architecture/design still use RequirementsFullContent, ArchitectureFullContent, DesignFullContent for legacy structured preview_data. Concept/UX use the diff view with options instead of this modal.
- **Routes / pages**: Dedicated workbench routes (e.g. concept-brief, ux-brief, requirements) and tool names (generate_concept_brief, etc.) remain for workflow and navigation; they do not change the shared “edit MD” behavior.

## Files touched for harmonization

- **agent-chat-ui**: `content-renderers/markdown-renderer.tsx` (all template types + text → markdown), `approval-card.tsx` (diff container, badge, hasFullProposalContent), `full-proposal-modal.tsx` (markdown fallback), `use-unified-previews.ts` (labels), `content-renderers/__tests__/index.test.tsx`.
- **Reflexion**: `proxy_server.py` (`get_artifact_content` normalization to markdown, comment).
