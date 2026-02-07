/**
 * Shared workflow/agent color scheme: one brand hue with light→dark progression
 * (start → finish). Used by the global header workflow strip and the map view
 * bottom panel for consistency.
 */
const WORKFLOW_BRAND_HUE = 217;

/** Workflow node id (from GET /api/workflow) → agent color. Light (start) → dark (finish). */
const WORKFLOW_NODE_COLORS: Record<string, string> = {
    supervisor: 'hsl(215, 15%, 55%)',
    project_configurator: 'hsl(217, 40%, 68%)',
    concept: `hsl(${WORKFLOW_BRAND_HUE}, 45%, 72%)`,
    requirements: `hsl(${WORKFLOW_BRAND_HUE}, 50%, 58%)`,
    architecture: `hsl(${WORKFLOW_BRAND_HUE}, 55%, 48%)`,
    design: `hsl(${WORKFLOW_BRAND_HUE}, 55%, 38%)`,
    administration: 'hsl(215, 15%, 45%)',
};

/**
 * Returns the agent-level color for a workflow node (same light→dark as map legend).
 * Fallback for unknown node ids (e.g. from future API).
 */
export function getWorkflowNodeColor(nodeId: string): string {
    const key = (nodeId || '').toLowerCase().replace(/-/g, '_');
    return WORKFLOW_NODE_COLORS[key] ?? 'hsl(215, 15%, 50%)';
}

export { WORKFLOW_BRAND_HUE };
