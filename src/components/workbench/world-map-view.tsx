'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Search, RefreshCw, ZoomIn, ZoomOut, Maximize, Globe, GitCompare, ChevronDown, ChevronRight, ChevronUp } from 'lucide-react';
import { Button as UIButton } from '@/components/ui/button';
import { useStreamContext } from '@/providers/Stream';
import { useRouteScope } from '@/hooks/use-route-scope';
import { useQueryState } from 'nuqs';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { KG_DIFF_COLORS } from '@/lib/diff-types';
import { getWorkflowNodeColor } from '@/lib/workflow-agent-colors';
import { NodeDetailPanel } from './node-detail-panel';
import { ArtifactsListView } from './artifacts-list-view';
import { useUnifiedPreviews } from './hooks/use-unified-previews';
import { useThreadUpdates } from './hooks/use-thread-updates';
import { KgDiffDiagramView } from './kg-diff-diagram-view';
import { apiFetch } from '@/lib/api-fetch';

interface Node extends d3.SimulationNodeDatum {
    id: string;
    name: string;
    type: string;
    description?: string;
    properties?: any;
    metadata?: Record<string, any>;
    diff_status?: 'added' | 'modified' | 'removed';
}

interface Link extends d3.SimulationLinkDatum<Node> {
    source: string | Node;
    target: string | Node;
    type?: string;
    is_anchor?: boolean;
}

interface GraphData {
    nodes: Node[];
    links: Link[];
    metadata: {
        active_trigger?: string;
        customer_id: string;
        thread_id: string;
        /** Schema summary: counts by type, phase grouping, link-type counts (from API or streamed filtered_kg). */
        entity_counts?: Record<string, number>;
        phase_grouping?: { agent_id: string; agent_name: string; types: string[] }[];
        link_type_counts?: Record<string, number>;
    };
}

/** Parse decision commit message body (build_decision_commit_message format) for status/type. */
function parseDecisionCommitMessage(messageFull: string | undefined): { status?: string; type?: string } {
    if (!messageFull || typeof messageFull !== 'string') return {};
    const out: { status?: string; type?: string } = {};
    for (const line of messageFull.split('\n')) {
        const t = line.trim();
        if (t.startsWith('status:')) out.status = t.slice(6).trim();
        else if (t.startsWith('type:')) out.type = t.slice(5).trim();
    }
    return out;
}

/** Map decision status to timeline badge label. */
function decisionStatusLabel(status: string | undefined): string | null {
    if (!status) return null;
    const s = status.toLowerCase();
    if (s === 'pending') return 'Proposed';
    if (s === 'approved') return 'Approved';
    if (s === 'rejected') return 'Rejected';
    return status;
}

/** Content-level trace link types to emphasize when a node is focused (primary over ART–ART links). */
const CONTENT_TRACE_LINK_TYPES = new Set(['DERIVED_FROM', 'SATISFIES', 'REALIZES', 'VALIDATES', 'TRACES_TO']);

/** Type → display label (for legend and fallback). */
const typeConfig: Record<string, { color: string; label: string }> = {
    DOMAIN: { color: '#64748b', label: 'Domain' },
    REQ: { color: '#fbbf24', label: 'Trigger' },
    ARTIFACT: { color: '#0ea5e9', label: 'Artifact' },
    MECH: { color: '#a855f7', label: 'Mechanism' },
    CRIT: { color: '#f43f5e', label: 'Risk' },
    COMPONENT: { color: '#06b6d4', label: 'Component' },
    VIEW: { color: '#22c55e', label: 'View' },
    REQUIREMENT: { color: '#eab308', label: 'Requirement' },
    SCENARIO: { color: '#ec4899', label: 'Scenario' },
    INTERFACE: { color: '#8b5cf6', label: 'Interface' },
    DECISION: { color: '#f97316', label: 'Decision' },
    PERSONA: { color: '#ec4899', label: 'Persona' },
    PERS: { color: '#ec4899', label: 'Persona' },
    OUTCOME: { color: '#22c55e', label: 'Outcome' },
    OUT: { color: '#22c55e', label: 'Outcome' },
    METRIC: { color: '#06b6d4', label: 'Metric' },
    MET: { color: '#06b6d4', label: 'Metric' },
    CONSTRAINT: { color: '#8b5cf6', label: 'Constraint' },
    CONST: { color: '#8b5cf6', label: 'Constraint' },
    FEATURE: { color: '#eab308', label: 'Feature' },
    FEAT: { color: '#eab308', label: 'Feature' },
    JTBD: { color: '#a855f7', label: 'JTBD' },
    UXO: { color: '#0ea5e9', label: 'UX Outcome' },
    LIFECYCLE: { color: '#64748b', label: 'Lifecycle' },
    TEMPLATE: { color: '#64748b', label: 'Template' },
};

/** Agent → Template → NodeTypes hierarchy (aligns with ArtifactTemplates_kg). Colour is at Agent level. templateId matches backend CONTRIBUTES_TO (T-*) for artifact risk aggregates. */
const MAP_LEGEND_AGENT_HIERARCHY: {
    agentId: string;
    agentName: string;
    templates: { templateName: string; templateId?: string; types: string[] }[];
}[] = [
    {
        agentId: 'concept',
        agentName: 'Concept',
        templates: [
            { templateName: 'Concept Brief', templateId: 'T-CONCEPT', types: ['PERSONA', 'PERS', 'SCENARIO', 'OUTCOME', 'OUT', 'METRIC', 'MET', 'DECISION', 'CONSTRAINT', 'CONST'] },
            { templateName: 'Feature Definition', templateId: 'T-FEATDEF', types: ['FEATURE', 'FEAT', 'JTBD'] },
            { templateName: 'UX Brief', templateId: 'T-UX', types: ['UXO'] },
        ],
    },
    {
        agentId: 'requirements',
        agentName: 'Requirements',
        templates: [
            { templateName: 'Requirements Package', templateId: 'T-REQPKG', types: ['REQUIREMENT', 'LIFECYCLE', 'SCENARIO'] },
        ],
    },
    {
        agentId: 'architecture',
        agentName: 'Architecture',
        templates: [
            { templateName: 'Architecture', templateId: 'T-ARCH', types: ['COMPONENT', 'INTERFACE', 'VIEW'] },
        ],
    },
    {
        agentId: 'design',
        agentName: 'Design',
        templates: [
            { templateName: 'Design', templateId: 'T-DESIGN', types: ['COMPONENT', 'INTERFACE', 'REQUIREMENT', 'DECISION'] },
        ],
    },
    {
        agentId: 'system',
        agentName: 'System',
        templates: [
            { templateName: 'Methodology / KG', types: ['DOMAIN', 'REQ', 'ARTIFACT', 'MECH', 'CRIT', 'TEMPLATE'] },
        ],
    },
];

/** Node type → agent id (for agent-level colour). First match in hierarchy wins. */
const typeToAgentId: Record<string, string> = (() => {
    const out: Record<string, string> = {};
    for (const agent of MAP_LEGEND_AGENT_HIERARCHY) {
        for (const t of agent.templates) {
            for (const typeName of t.types) {
                if (!(typeName in out)) out[typeName] = agent.agentId;
            }
        }
    }
    return out;
})();

/** Brand hue (customer brand); light → dark = start → finish. */
const MAP_LEGEND_BRAND_HUE = 217;
/** Agent-level colours: same hue, light (start) → dark (finish). */
const agentColors: Record<string, string> = {
    concept: `hsl(${MAP_LEGEND_BRAND_HUE}, 45%, 72%)`,
    requirements: `hsl(${MAP_LEGEND_BRAND_HUE}, 50%, 58%)`,
    architecture: `hsl(${MAP_LEGEND_BRAND_HUE}, 55%, 48%)`,
    design: `hsl(${MAP_LEGEND_BRAND_HUE}, 55%, 38%)`,
    system: 'hsl(215, 15%, 45%)',
};

function getAgentColorForNodeType(nodeType: string): string {
    const agentId = typeToAgentId[nodeType];
    return agentId ? agentColors[agentId] ?? '#888' : '#888';
}

export interface WorldMapViewProps {
    /** When true, the decisions table on the left is the timeline; hide the built-in timeline panel. */
    embeddedInDecisions?: boolean;
}

export function WorldMapView({ embeddedInDecisions = false }: WorldMapViewProps = {}) {
    const stream = useStreamContext();
    const [viewMode, setViewMode] = useQueryState("view", { defaultValue: "map" });
    const [compareParam] = useQueryState("compare"); // When "1" or "true", open timeline (header "Compare on map")
    const [versionParam] = useQueryState("version"); // Select this decision version in timeline and show its diff (per-decision "Compare on map")
    /** Filtered KG streamed from backend when Project Configurator runs; use for map without extra /api/kg-data. */
    const filteredKg = (stream as any)?.values?.filtered_kg as { nodes: any[]; links: any[]; metadata?: any } | undefined;

    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const simulationRef = useRef<d3.Simulation<Node, Link> | null>(null);
    const [data, setData] = useState<GraphData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [threadIdFromUrl] = useQueryState("threadId");
    const threadId = (stream as any)?.threadId ?? threadIdFromUrl ?? undefined;
    const { projectId: projectIdFromRoute, orgId: orgIdFromRoute } = useRouteScope();
    const scopeProjectId = projectIdFromRoute ?? undefined;
    const scopeOrgId = orgIdFromRoute ?? undefined;

    const [kgHistory, setKgHistory] = useState<{ versions: any[], total: number } | null>(null);
    const [kgDecisions, setKgDecisions] = useState<{ id: string; type: string; title: string; status?: string; kg_version_sha?: string }[]>([]);
    const [_historyOpen, _setHistoryOpen] = useState(false);

    const [showHistory, setShowHistory] = useState(false);
    const [activeVersion, setActiveVersion] = useState<string | null>(null);
    const [compareMode, setCompareMode] = useState(false);

    // Open timeline when arriving via shortcut (e.g. ?compare=1 from header "Compare on map")
    useEffect(() => {
        if (compareParam === "1" || compareParam === "true") {
            setShowHistory(true);
        }
    }, [compareParam]);
    // When version= in URL (per-decision "Compare on map"), open timeline, select that version, show its diff
    const lastUrlVersion = useRef<string | null>(null);
    useEffect(() => {
        if (!versionParam || !threadId) return;
        if (!kgHistory?.versions?.length) {
            console.log('[WorldMapView] Timeline diff: version= in URL but no kgHistory yet, fetching history');
            fetchKgHistory();
            return;
        }
        const versions = kgHistory.versions as { id?: string }[];
        const idx = versions.findIndex((v) => v.id === versionParam);
        const versionBefore = idx >= 0 && idx < versions.length - 1 ? versions[idx + 1]?.id : undefined;
        console.log('[WorldMapView] Timeline diff: version= in URL', {
            versionParam,
            threadId,
            versionsCount: versions.length,
            idx,
            versionBefore: versionBefore ?? null,
            willFetchDiff: lastUrlVersion.current !== versionParam && !!versionBefore,
        });
        setShowHistory(true);
        setCompareMode(false);
        setSelectedTimelineVersionId(versionParam);
        setActiveVersion(versionParam);
        if (lastUrlVersion.current !== versionParam) {
            lastUrlVersion.current = versionParam;
            fetchDiffForTimelineVersion(versionParam);
        }
        fetchData(versionParam);
    }, [versionParam, scopeProjectId, kgHistory]);
    const [compareVersion1, setCompareVersion1] = useState<string | null>(null);
    const [compareVersion2, setCompareVersion2] = useState<string | null>(null);
    const [diffData, setDiffData] = useState<any>(null);
    const [loadingDiff, setLoadingDiff] = useState(false);
    /** When in compare mode: 'graph' = force-directed map with diff colors; 'diff' = KgDiffDiagramView (list by change type). Harmonized with KG_DIFF_CONTRACT. */
    const [compareViewMode, setCompareViewMode] = useState<'graph' | 'diff'>('graph');
    /** Timeline view: version selected for showing its introduced diff (before → this version). */
    const [selectedTimelineVersionId, setSelectedTimelineVersionId] = useState<string | null>(null);
    const [timelineVersionDiff, setTimelineVersionDiff] = useState<any>(null);
    const [loadingTimelineDiff, setLoadingTimelineDiff] = useState(false);

    /** Map search: single match → select node; multiple → filtered view. */
    const [mapSearchQuery, setMapSearchQuery] = useState('');
    /** Status filter: "active" (default) = approved only; "all" = show all; "pending" | "rejected" for decision lineage. */
    const [statusFilter, setStatusFilter] = useState<'active' | 'all' | 'pending' | 'rejected'>('active');
    /** Type filter: record of node type → visible (false = hidden). Empty = all visible. */
    const [typeFilter, setTypeFilter] = useState<Record<string, boolean>>({});
    /** Collapsed agent groups in the hierarchical legend (agentId → true = collapsed). */
    const [legendCollapsed, setLegendCollapsed] = useState<Record<string, boolean>>({});
    /** Workflow strip for bottom panel (same left-to-right as header). */
    const [workflowStrip, setWorkflowStrip] = useState<{ nodes: { id: string; label: string }[]; active_node?: string } | null>(null);
    /** Project risk summary (in-scope, covered, uncovered, artifact_aggregates) for map context pane. */
    const [riskSummary, setRiskSummary] = useState<{
        in_scope: number;
        covered: number;
        uncovered: number;
        artifact_aggregates: { art_node_id: string; template_id?: string; covered: number; covered_crit_ids: string[] }[];
    } | null>(null);
    /** Phase-level risk aggregates (phase_id, in_scope, covered, uncovered) for map hierarchy. */
    const [phaseRiskAggregates, setPhaseRiskAggregates] = useState<{ phase_id: string; in_scope: number; covered: number; uncovered: number }[]>([]);
    const [loadingRiskSummary, setLoadingRiskSummary] = useState(false);
    /** Bottom panel (workflow | filter | search | zoom) collapsed. */
    const [bottomPanelCollapsed, setBottomPanelCollapsed] = useState(false);
    /** Focused node (ART or content). Map emphasizes this node + its contained nodes + content-level trace links. Clicking a node moves focus. */
    const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

    // Clear focus when graph data changes and the focused node is no longer present
    useEffect(() => {
        if (focusedNodeId && data?.nodes && !data.nodes.some((n: Node) => n.id === focusedNodeId)) {
            setFocusedNodeId(null);
        }
    }, [data?.nodes, focusedNodeId]);

    // Fetch workflow strip for bottom panel (same as header, left-to-right flow).
    useEffect(() => {
        if (!scopeProjectId || embeddedInDecisions) return;
        let cancelled = false;
        const params = new URLSearchParams();
        const activeAgent = (stream as any)?.values?.active_agent;
        if (activeAgent) params.set('active_node', activeAgent);
        apiFetch(`/api/workflow${params.toString() ? `?${params.toString()}` : ''}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data: { nodes?: { id: string; label: string }[]; active_node?: string } | null) => {
                if (!cancelled && data?.nodes) setWorkflowStrip({ nodes: data.nodes, active_node: data.active_node });
                else if (!cancelled) setWorkflowStrip(null);
            })
            .catch(() => { if (!cancelled) setWorkflowStrip(null); });
        return () => { cancelled = true; };
    }, [scopeProjectId, embeddedInDecisions, (stream as any)?.values?.active_agent]);

    // Fetch project risk summary (project + phase + artifact aggregates) for map context pane
    useEffect(() => {
        if (!scopeProjectId || embeddedInDecisions) {
            setRiskSummary(null);
            return;
        }
        let cancelled = false;
        setLoadingRiskSummary(true);
        const params = new URLSearchParams({ project_id: scopeProjectId });
        apiFetch(`/api/project/risk-summary?${params.toString()}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data: { in_scope?: number; covered?: number; uncovered?: number; phase_aggregates?: { phase_id: string; in_scope: number; covered: number; uncovered: number }[]; artifact_aggregates?: { art_node_id: string; template_id?: string; covered: number; covered_crit_ids: string[] }[] } | null) => {
                if (cancelled) return;
                if (data && typeof data.in_scope === 'number') {
                    setRiskSummary({
                        in_scope: data.in_scope,
                        covered: data.covered ?? 0,
                        uncovered: data.uncovered ?? 0,
                        artifact_aggregates: Array.isArray(data.artifact_aggregates) ? data.artifact_aggregates : [],
                    });
                    setPhaseRiskAggregates(Array.isArray(data.phase_aggregates) ? data.phase_aggregates : []);
                    if (process.env.NODE_ENV === 'development') {
                        console.info('[Map context] Project risk: in_scope=%s covered=%s uncovered=%s', data.in_scope, data.covered, data.uncovered);
                    }
                } else {
                    setRiskSummary(null);
                    setPhaseRiskAggregates([]);
                }
            })
            .catch(() => { if (!cancelled) setRiskSummary(null); })
            .finally(() => { if (!cancelled) setLoadingRiskSummary(false); });
        return () => { cancelled = true; };
    }, [scopeProjectId, embeddedInDecisions]);

    useEffect(() => {
        if (selectedTimelineVersionId) {
            console.log('[WorldMapView] Timeline diff state', {
                selectedTimelineVersionId,
                loadingTimelineDiff,
                hasDiff: !!timelineVersionDiff?.diff,
                hasSummary: !!timelineVersionDiff?.summary,
                nodeCount: timelineVersionDiff?.diff?.nodes?.length ?? 0,
            });
        }
    }, [selectedTimelineVersionId, timelineVersionDiff, loadingTimelineDiff]);

    /** ART node ids by template id (CONTRIBUTES_TO: ART → T-*) for focus-from-hierarchy. */
    const artNodeIdsByTemplateId = useMemo(() => {
        const map: Record<string, string[]> = {};
        for (const l of data?.links ?? []) {
            const typ = (l.type ?? '').toString().trim();
            if (typ !== 'CONTRIBUTES_TO') continue;
            const src = typeof l.source === 'string' ? l.source : (l.source as Node)?.id;
            const tgt = typeof l.target === 'string' ? l.target : (l.target as Node)?.id;
            if (!src || !tgt || !String(tgt).startsWith('T-')) continue;
            if (!map[tgt]) map[tgt] = [];
            map[tgt].push(src);
        }
        return map;
    }, [data?.links]);

    /** For a template, pick the best ART to focus: prefer one that only CONTRIBUTES_TO this template (avoids focusing "Concept Brief" when user chose "Requirements Package"). */
    const getFocusArtIdForTemplate = useCallback(
        (templateId: string): string | undefined => {
            const artIds = artNodeIdsByTemplateId[templateId] ?? [];
            if (artIds.length === 0) return undefined;
            const otherTemplateIds = Object.keys(artNodeIdsByTemplateId).filter((t) => t !== templateId);
            const artIdsInOther = new Set<string>();
            for (const t of otherTemplateIds) {
                for (const id of artNodeIdsByTemplateId[t] ?? []) artIdsInOther.add(id);
            }
            const exclusive = artIds.find((id) => !artIdsInOther.has(id));
            return exclusive ?? artIds[0];
        },
        [artNodeIdsByTemplateId]
    );

    const unifiedPreviews = useUnifiedPreviews();
    const draftArtifactNodes = useMemo(() => {
        return unifiedPreviews
            .filter(
                (p) =>
                    p.status === 'pending' &&
                    p.type === 'generate' &&
                    (p.data?.args as Record<string, unknown> | undefined)?.artifact_type
            )
            .map((p) => {
                const artifactType = (p.data?.args as Record<string, unknown> | undefined)?.artifact_type as string;
                return {
                    id: `draft-${p.id}`,
                    name: p.title,
                    type: 'ARTIFACT',
                    metadata: { draft: true, artifact_types: [artifactType], artifact_id: undefined },
                };
            }) as Node[];
    }, [unifiedPreviews]);

    // Note: Workflow workbench view removed; version/orientation is in global header. Artifact history and content fetching is handled by NodeDetailPanel.

    const fetchKgHistory = async () => {
        try {
            // Scope from URL: use project_id (org/project layout). Fallback to thread_id for legacy URLs.
            const url = scopeProjectId
                ? `/api/project/history?project_id=${encodeURIComponent(scopeProjectId)}`
                : threadId
                    ? `/api/project/history?project_id=${encodeURIComponent(threadId)}`
                    : '/api/project/history';
            const res = await apiFetch(url);
            if (res.ok) setKgHistory(await res.json());
        } catch (e) { console.error('History fetch error:', e); }
    };

    const fetchKgDecisions = async () => {
        if (!scopeProjectId || !scopeOrgId) return;
        try {
            console.info("[WorldMapView] GET /api/decisions", {
                scopeProjectId,
                scopeOrgId,
            });
            const res = await apiFetch(`/api/decisions?project_id=${encodeURIComponent(scopeProjectId)}&org_id=${encodeURIComponent(scopeOrgId)}`);
            if (res.ok) {
                const data = await res.json();
                // Backend returns { decisions, org_phase } when org has NPDDecision; otherwise a plain array
                const projectList = Array.isArray(data) ? data : (data?.decisions ?? []);
                const orgList = data?.org_phase?.decisions ?? [];
                const merged = [...orgList, ...projectList].filter((r: { id?: string }) => r && r.id);
                setKgDecisions(merged);
            }
        } catch (e) { console.error('Decisions fetch error:', e); }
    };

    /** Resolve "current" to latest commit SHA so diff API always receives commit refs (unified diff views = always refer to a commit). */
    const latestVersionSha = (kgHistory?.versions as { id?: string }[])?.[0]?.id;
    const resolveVersion = (v: string) => (v === "current" ? (latestVersionSha ?? v) : v);

    const fetchDiff = async (v1: string, v2: string) => {
        if (!v1 || !v2 || !scopeProjectId) return;
        try {
            setLoadingDiff(true);
            const v1Resolved = resolveVersion(v1);
            const v2Resolved = resolveVersion(v2);
            const versions = (kgHistory?.versions ?? []) as { id?: string; source?: string }[];
            const v1Source = v1 === "current" ? undefined : versions.find((x) => x.id === v1Resolved)?.source;
            const v2Source = v2 === "current" ? undefined : versions.find((x) => x.id === v2Resolved)?.source;
            const params = new URLSearchParams({
                project_id: scopeProjectId,
                version1: v1Resolved,
                version2: v2Resolved,
            });
            if (v1Source === "organization") params.set("version1_source", "organization");
            if (v2Source === "organization") params.set("version2_source", "organization");
            const url = `/api/project/diff?${params.toString()}`;
            const res = await apiFetch(url);
            if (res.ok) {
                const diff = await res.json();
                const apiSummary = diff.summary ?? diff.diff?.summary ?? {};
                console.log('[WorldMapView] Fetched diff:', {
                    version1: v1Resolved,
                    version2: v2Resolved,
                    nodesInDiff: diff.diff?.nodes?.length ?? 0,
                    edgesInDiff: (diff.diff?.links ?? diff.diff?.edges)?.length ?? 0,
                    summary: { added: apiSummary.added, modified: apiSummary.modified, removed: apiSummary.removed, total_nodes_v1: apiSummary.total_nodes_v1, total_nodes_v2: apiSummary.total_nodes_v2, total_links_v1: apiSummary.total_links_v1, total_links_v2: apiSummary.total_links_v2 },
                    semanticSummary: (apiSummary.semanticSummary ?? diff.diff?.summary?.semanticSummary) ? String(apiSummary.semanticSummary ?? diff.diff?.summary?.semanticSummary).slice(0, 120) + '…' : undefined,
                });
                setCompareMode(true);
                setViewMode('map'); // Compare always shows map/diff view (workflow tab removed)
                setActiveVersion(v2 === "current" ? null : v2);
                const v2Source = v2 === "current" ? undefined : (kgHistory?.versions as { id?: string; source?: string }[] | undefined)?.find((x) => x.id === v2Resolved)?.source;
                // Load v2 graph first so diff is applied to correct data (avoids race where diff showed on stale graph).
                await fetchData(v2 === "current" ? undefined : v2, true, false, v2Source);
                setDiffData(diff);
            } else {
                console.error('Diff fetch failed:', await res.text());
            }
        } catch (e) {
            console.error('Diff fetch error:', e);
        } finally {
            setLoadingDiff(false);
        }
    };

    /** Fetch diff for a single timeline version (versionBefore → versionId). Used in timeline view for decision versions. */
    const fetchDiffForTimelineVersion = async (versionId: string) => {
        if (!scopeProjectId || !kgHistory?.versions?.length) {
            console.log('[WorldMapView] Timeline diff fetch skipped: no project or kgHistory', { scopeProjectId: !!scopeProjectId, versionsLength: kgHistory?.versions?.length ?? 0 });
            return;
        }
        const versions = kgHistory.versions as { id?: string; source?: string }[];
        const idx = versions.findIndex((v) => v.id === versionId);
        const versionBefore = idx >= 0 && idx < versions.length - 1 ? versions[idx + 1]?.id : undefined;
        if (!versionBefore) {
            console.log('[WorldMapView] Timeline diff fetch skipped: no versionBefore', { versionId, idx, versionsLength: versions.length });
            return;
        }
            const params = new URLSearchParams({
                project_id: scopeProjectId,
                version1: versionBefore,
                version2: versionId,
            });
        const v1Source = versions.find((v) => v.id === versionBefore)?.source;
        const v2Source = versions.find((v) => v.id === versionId)?.source;
        if (v1Source === "organization") params.set("version1_source", "organization");
        if (v2Source === "organization") params.set("version2_source", "organization");
        const url = `/api/project/diff?${params.toString()}`;
        console.log('[WorldMapView] Timeline diff fetch start', { versionId, versionBefore, url });
        try {
            setLoadingTimelineDiff(true);
            const res = await apiFetch(url);
            if (res.ok) {
                const diff = await res.json();
                const hasDiff = !!diff?.diff;
                const hasSummary = !!diff?.summary;
                const nodeCount = diff?.diff?.nodes?.length ?? 0;
                const edgeCount = (diff?.diff?.edges ?? diff?.diff?.links)?.length ?? 0;
                console.log('[WorldMapView] Timeline diff fetch OK', { versionId, hasDiff, hasSummary, nodeCount, edgeCount, summaryKeys: hasSummary ? Object.keys(diff.summary) : [] });
                setTimelineVersionDiff(diff);
            } else {
                const text = await res.text();
                console.warn('[WorldMapView] Timeline diff fetch failed', { versionId, status: res.status, body: text.slice(0, 200) });
            }
        } catch (e) {
            console.error('[WorldMapView] Timeline version diff fetch error:', e);
        } finally {
            setLoadingTimelineDiff(false);
        }
    };

    const fetchData = async (version?: string, preserveDiff: boolean = false, silent: boolean = false, versionSource?: string) => {
        try {
            if (!silent) {
                setLoading(true);
                setError(null);
            }
            const params = new URLSearchParams();
            if (threadId) params.set('thread_id', threadId);
            if (version) {
                params.set('version', version);
                setActiveVersion(version);
            } else {
                setActiveVersion(null);
            }
            if (versionSource === 'organization') params.set('version_source', 'organization');
            const url = `/api/kg-data?${params.toString()}`;

            console.log('[WorldMapView] Fetching data:', { url, preserveDiff, version, versionSource });
            const res = await apiFetch(url);
            if (!res.ok) throw new Error('Failed to fetch graph data');
            const json = await res.json();
            console.log('[WorldMapView] Fetched data:', {
                thread_id: json.metadata?.thread_id,
                node_count: json.nodes?.length
            });
            setData(json);
            // Only update history list if we are loading the latest version, 
            // otherwise we might get a stale list if we time travel back
            if (!version) fetchKgHistory();
            // Clear diff data unless we're preserving it (e.g., when in compare mode showing version 2 with diff)
            if (!preserveDiff && !compareMode) {
                setDiffData(null);
            }
        } catch (err: any) {
            if (!silent) {
                console.error('[WorldMapView] Fetch error:', err);
                setError(err.message);
            }
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const workbenchRefreshKey = (stream as any)?.workbenchRefreshKey ?? 0;
    useThreadUpdates(threadId ?? undefined, {
        onKgUpdate: () => fetchData(undefined, false, true),
    });

    // When we have a project (threadId), always fetch from API so map/artifacts show persisted KG
    // (uploaded/enriched). When no threadId, use filtered_kg if streamed or fallback to fetch.
    // When showing version 2 with diff (compare mode), skip refetch so we don't double-fetch and cause a visible reload.
    useEffect(() => {
        if (activeVersion) {
            fetchData(activeVersion);
            return;
        }
        // Prefer API when project is selected so we see latest from GitHub (avoids stale filtered_kg after upload/enrichment).
        if (threadId) {
            if (compareMode && diffData) {
                // We're showing version 2 with diff; data was already loaded by the button handler — don't refetch.
                return;
            }
            fetchData();
            return;
        }
        if (filteredKg?.nodes && filteredKg?.links && workbenchRefreshKey === 0) {
            const asGraphData: GraphData = {
                nodes: filteredKg.nodes,
                links: filteredKg.links,
                metadata: {
                    ...(filteredKg.metadata || {}),
                    customer_id: (filteredKg.metadata as any)?.customer_id ?? '',
                    thread_id: threadId ?? '',
                },
            };
            setData(asGraphData);
            setLoading(false);
            setError(null);
            fetchKgHistory();
            return;
        }
        fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchData/fetchKgHistory intentionally omitted to avoid re-run loops
    }, [threadId, workbenchRefreshKey, activeVersion, filteredKg, compareMode, diffData]);

    // After "Begin Enriching" we update thread state with current_trigger_id; refetch version list so the new commit shows.
    const currentTriggerId = (stream as any)?.values?.current_trigger_id;
    useEffect(() => {
        if (scopeProjectId && currentTriggerId) fetchKgHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchKgHistory stable
    }, [scopeProjectId, currentTriggerId]);

    // Load decisions when we have history so we can show which decision produced each version
    useEffect(() => {
        if (scopeProjectId && kgHistory) fetchKgDecisions();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchKgDecisions stable
    }, [scopeProjectId, kgHistory]);

    // After workbench refresh (e.g. after applying a proposal), refetch decisions so artifact list can hide applied drafts
    useEffect(() => {
        if (scopeProjectId && workbenchRefreshKey > 0) fetchKgDecisions();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchKgDecisions stable
    }, [scopeProjectId, workbenchRefreshKey]);

    useEffect(() => {
        if (!data || !svgRef.current || !containerRef.current) return;

        const svgElForCleanup = svgRef.current;

        // When a timeline version is selected, use its diff for semantic coloring on the main graph; otherwise use compare-mode diff.
        const effectiveDiff = (selectedTimelineVersionId && timelineVersionDiff) ? timelineVersionDiff : diffData;
        const hasDiff = !!(effectiveDiff?.diff?.nodes?.length && (effectiveDiff?.diff?.links?.length ?? effectiveDiff?.diff?.edges?.length));
        console.log('[WorldMapView] graph rendering', { nodes: data.nodes?.length, links: data.links?.length, hasDiff, diffSource: selectedTimelineVersionId ? 'timelineVersionDiff' : 'diffData', diffNodes: effectiveDiff?.diff?.nodes?.length, diffEdges: (effectiveDiff?.diff?.links ?? effectiveDiff?.diff?.edges)?.length });

        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;

        // Clear SVG with a single DOM write to avoid removeChild errors when React and D3 disagree
        const svgEl = svgRef.current;
        if (svgEl) {
            try {
                svgEl.innerHTML = '';
            } catch {
                // ignore if already detached or DOM in inconsistent state
            }
        }
        const svg = d3.select(svgRef.current);
        const g = svg.append('g');

        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 8])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });

        svg.call(zoom);

        // Arrow marker
        svg.append('defs').append('marker')
            .attr('id', 'arrowhead')
            .attr('viewBox', '-0 -5 10 10')
            .attr('refX', 20)
            .attr('refY', 0)
            .attr('orient', 'auto')
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .append('path')
            .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
            .attr('fill', '#888');

        // In compare mode or timeline-version-selected mode, use the diff payload as the single source of truth for nodes and links
        // so link endpoints always match node ids (no orphaned added nodes).
        const diffEdges = (effectiveDiff?.diff?.links ?? effectiveDiff?.diff?.edges) as Array<{ source?: string | number | { id?: string }; target?: string | number | { id?: string }; changeType?: string; type?: string }> | undefined;
        const diffNodesList = effectiveDiff?.diff?.nodes as Array<{ id: string; name?: string; changeType?: string; diff_status?: string }> | undefined;
        const useDiffPayload = diffNodesList?.length && diffEdges?.length;

        let nodes: Node[];
        let links: Link[] = [];

        if (useDiffPayload) {
            // Nodes: non-removed only (v2 graph); diff payload has id, type, name, etc. at runtime
            nodes = diffNodesList
                .filter((n: { changeType?: string; diff_status?: string }) => (n.changeType ?? n.diff_status) !== 'removed')
                .map((n) => ({ ...n })) as Node[];
            const seen = new Set<string>();
            for (const e of diffEdges) {
                if (e.changeType === 'removed') continue;
                const src = typeof e.source === 'object' && e.source && 'id' in e.source ? e.source.id : e.source;
                const tgt = typeof e.target === 'object' && e.target && 'id' in e.target ? e.target.id : e.target;
                const srcStr = src != null ? String(src) : '';
                const tgtStr = tgt != null ? String(tgt) : '';
                if (!srcStr || !tgtStr) continue;
                const key = `${srcStr}\t${tgtStr}`;
                if (seen.has(key)) continue;
                seen.add(key);
                links.push({ source: srcStr, target: tgtStr, type: e.type } as Link);
            }
            console.log('[WorldMapView] Using diff payload for graph: nodes=', nodes.length, 'links=', links.length);
        } else {
            nodes = data.nodes.map(d => ({ ...d }));
            links = data.links.map((d: Link) => ({ ...d }));
            // Status filter: every decision has an impact on the world (active = default)
            if (statusFilter !== 'all') {
                const nodeStatus = (n: Node) => (n.metadata?.status ?? 'active') as string;
                const linkStatus = (l: Link) => {
                    const m = (l as any).metadata;
                    return (m?.status ?? 'active') as string;
                };
                const matchNode = (n: Node) =>
                    statusFilter === 'active'
                        ? [undefined, 'active', 'accepted'].includes(nodeStatus(n) as any)
                        : nodeStatus(n) === statusFilter;
                nodes = nodes.filter(matchNode);
                const activeIds = new Set(nodes.map((n) => n.id));
                links = links.filter((l: Link) => {
                    const src = typeof l.source === 'object' && l.source && 'id' in l.source ? (l.source as Node).id : l.source;
                    const tgt = typeof l.target === 'object' && l.target && 'id' in l.target ? (l.target as Node).id : l.target;
                    if (!activeIds.has(String(src)) || !activeIds.has(String(tgt))) return false;
                    if (statusFilter === 'active') return [undefined, 'active', 'accepted'].includes(linkStatus(l) as any);
                    return linkStatus(l) === statusFilter;
                });
            }
        }

        // If we have diff data but didn't use diff payload (e.g. no edges), merge diff_status into nodes for coloring.
        if (effectiveDiff && effectiveDiff.diff && effectiveDiff.diff.nodes && !useDiffPayload) {
            console.log('[WorldMapView] Applying diff visualization (data nodes + diff status):', {
                diffDataStructure: {
                    hasDiff: !!effectiveDiff.diff,
                    hasNodes: !!effectiveDiff.diff.nodes,
                    nodesLength: effectiveDiff.diff.nodes?.length,
                    summary: effectiveDiff.summary
                },
                diffNodes: effectiveDiff.diff.nodes.length,
                currentNodes: nodes.length,
                sampleDiffNode: effectiveDiff.diff.nodes[0],
                sampleCurrentNode: nodes[0]
            });
            
            // Create maps for both ID and name/label matching (KG-diff contract: changeType or diff_status)
            const diffNodesById = new Map(effectiveDiff.diff.nodes.map((n: any) => [n.id, n]));
            const diffNodesByName = new Map(
                effectiveDiff.diff.nodes
                    .filter((n: any) => n.name != null || (n as any).label != null)
                    .map((n: any) => [n.name ?? (n as any).label, n])
            );
            
            // Log detailed structure
            const sampleDiffNode = effectiveDiff.diff.nodes[0];
            const sampleCurrentNode = nodes[0];
            console.log('[WorldMapView] Sample diff node structure:', {
                id: sampleDiffNode?.id,
                name: sampleDiffNode?.name,
                diff_status: sampleDiffNode?.diff_status,
                keys: sampleDiffNode ? Object.keys(sampleDiffNode) : []
            });
            console.log('[WorldMapView] Sample current node structure:', {
                id: sampleCurrentNode?.id,
                name: sampleCurrentNode?.name,
                keys: sampleCurrentNode ? Object.keys(sampleCurrentNode) : []
            });
            
            console.log('[WorldMapView] Diff node IDs (first 10):', Array.from(diffNodesById.keys()).slice(0, 10));
            console.log('[WorldMapView] Diff node names (first 10):', Array.from(diffNodesByName.keys()).slice(0, 10));
            console.log('[WorldMapView] Current node IDs (first 10):', nodes.map(n => n.id).slice(0, 10));
            console.log('[WorldMapView] Current node names (first 10):', nodes.map(n => n.name).slice(0, 10));
            
            // Check for ID matches
            const matchingIds = nodes.filter(n => diffNodesById.has(n.id)).map(n => n.id);
            const matchingNames = nodes.filter(n => n.name && diffNodesByName.has(n.name)).map(n => n.name);
            console.log('[WorldMapView] Matching IDs:', matchingIds.slice(0, 10));
            console.log('[WorldMapView] Matching names:', matchingNames.slice(0, 10));
            
            // Check all diff nodes with their status
            const diffNodesWithStatus = effectiveDiff.diff.nodes.filter((n: any) => n.diff_status).map((n: any) => ({
                id: n.id,
                name: n.name || (n as any).label,
                status: n.diff_status,
                fullNode: n
            }));
            console.log('[WorldMapView] Diff nodes with status:', diffNodesWithStatus);
            console.log('[WorldMapView] Total diff nodes with status:', diffNodesWithStatus.length);
            
            // Check if these nodes exist in current nodes
            diffNodesWithStatus.forEach((diffNode: any) => {
                const existsInCurrent = nodes.find(n => n.id === diffNode.id);
                console.log(`[WorldMapView] Diff node "${diffNode.id}" (${diffNode.status}):`, {
                    existsInCurrent: !!existsInCurrent,
                    currentNodeId: existsInCurrent?.id,
                    willBeApplied: existsInCurrent && diffNode.status !== 'removed'
                });
            });
            
            let matchedCount = 0;
            nodes.forEach(node => {
                // Try to match by ID first, then by name/label as fallback
                let diffNode = diffNodesById.get(node.id) as Node | undefined;
                if (!diffNode) {
                    const nameOrLabel = node.name ?? (node as any).label;
                    if (nameOrLabel) diffNode = diffNodesByName.get(nameOrLabel) as Node | undefined;
                }
                // KG-diff contract: backend may send changeType; treat same as diff_status
                const status = (diffNode as any)?.diff_status ?? (diffNode as any)?.changeType;
                if (diffNode) {
                    // Only apply for nodes that exist in current version; skip "removed"
                    if (status && status !== 'removed') {
                        (node as any).diff_status = status;
                        matchedCount++;
                    }
                }
            });
            
            // Log for debugging
            const addedNodes = nodes.filter(n => (n as any).diff_status === 'added');
            const modifiedNodes = nodes.filter(n => (n as any).diff_status === 'modified');
            console.log('[WorldMapView] Diff visualization applied:', {
                total_nodes: nodes.length,
                matched_nodes: matchedCount,
                added: addedNodes.length,
                modified: modifiedNodes.length,
                added_ids: addedNodes.map(n => `${n.id} (${n.name})`),
                modified_ids: modifiedNodes.map(n => `${n.id} (${n.name})`)
            });
        } else {
            console.log('[WorldMapView] No diff data available:', { 
                effectiveDiff, 
                hasDiff: !!effectiveDiff?.diff,
                hasDiffNodes: !!effectiveDiff?.diff?.nodes,
                diffNodesLength: effectiveDiff?.diff?.nodes?.length
            });
        }

        console.log('[WorldMapView] Initializing Simulation with:', { node_count: nodes.length });

        // Resolve link source/target to nodes: API may send ids that don't match node.id (e.g. ART-xxx_pdf vs ART-xxx, TRIGGER-O1 vs O1).
        // Build a map from all possible endpoint keys (id, name, _pdf variant, without prefix) to node so links resolve and green nodes aren't orphaned.
        const nodeByKey = new Map<string, Node>();
        const PREFIXES = ['TRIGGER-', 'ART-', 'ET-', 'FM-'];
        const addKey = (key: string, node: Node) => {
            if (key != null && key !== '') nodeByKey.set(String(key), node);
        };
        for (const n of nodes) {
            nodeByKey.set(n.id, n);
            if (n.name) addKey(n.name, n);
            const label = (n as { label?: string }).label;
            if (label) addKey(label, n);
            if (typeof n.id === 'string') {
                if (n.id.endsWith('_pdf')) {
                    nodeByKey.set(n.id.replace(/_pdf$/, ''), n);
                    addKey(n.id.replace(/_pdf$/, ''), n);
                } else {
                    nodeByKey.set(n.id + '_pdf', n);
                    addKey(n.id + '_pdf', n);
                }
                // Register id without common prefix so link "O1" resolves to node "TRIGGER-O1"
                for (const prefix of PREFIXES) {
                    if (n.id.startsWith(prefix)) {
                        addKey(n.id.slice(prefix.length), n);
                        break;
                    }
                }
                // Trigger id confusion: "01" (zero-one) vs "O1" (letter O) — register both so links resolve
                if (/^O\d+$/i.test(n.id)) addKey('0' + n.id.slice(1), n);
                else if (/^0\d+$/.test(n.id)) addKey('O' + n.id.slice(1), n);
            }
        }
        const resolveEndpoint = (endpoint: string | number | Node | undefined): Node | undefined => {
            if (endpoint == null) return undefined;
            if (typeof endpoint !== 'string' && typeof endpoint !== 'number') return endpoint as Node;
            // Index-based: when source/target is a number, treat as index into nodes (some APIs send indices)
            if (typeof endpoint === 'number' && endpoint >= 0 && endpoint < nodes.length) return nodes[endpoint];
            const s = String(endpoint);
            return (
                nodeByKey.get(s) ??
                nodeByKey.get(s.replace(/_pdf$/, '')) ??
                nodeByKey.get(s + '_pdf') ??
                (s.startsWith('TRIGGER-') ? nodeByKey.get(s.slice('TRIGGER-'.length)) : undefined) ??
                // Trigger id: try "01" <-> "O1" and similar
                (() => {
                    const alt = /^O(\d+)$/i.test(s) ? '0' + s.slice(1) : /^0(\d+)$/.test(s) ? 'O' + s.slice(1) : null;
                    if (alt) return nodeByKey.get(alt) ?? undefined;
                    return undefined;
                })() ??
                (() => {
                    for (const prefix of PREFIXES) {
                        if (s.startsWith(prefix)) {
                            const out = nodeByKey.get(s.slice(prefix.length));
                            if (out) return out;
                        }
                    }
                    return undefined;
                })()
            );
        };
        const resolvedLinks: Link[] = [];
        const droppedLinks: { source: string; target: string }[] = [];
        const allSourceTargets = new Set<string>();
        for (const link of links) {
            const rawSource = typeof link.source === 'string' ? link.source : typeof (link.source as Node)?.id !== 'undefined' ? (link.source as Node).id : link.source;
            const rawTarget = typeof link.target === 'string' ? link.target : typeof (link.target as Node)?.id !== 'undefined' ? (link.target as Node).id : link.target;
            if (rawSource != null) allSourceTargets.add(String(rawSource));
            if (rawTarget != null) allSourceTargets.add(String(rawTarget));
            const sourceNode = resolveEndpoint(rawSource ?? (link.source as Node));
            const targetNode = resolveEndpoint(rawTarget ?? (link.target as Node));
            if (sourceNode && targetNode) {
                resolvedLinks.push({
                    ...link,
                    source: sourceNode,
                    target: targetNode,
                });
            } else {
                droppedLinks.push({ source: String(rawSource), target: String(rawTarget) });
                console.warn('[WorldMapView] Filtering out link:', rawSource, '->', rawTarget);
            }
        }
        // Build set of node ids that appear as link endpoints (after resolution) for orphan detection
        const allEndpointIdsFromResolved = new Set<string>();
        for (const l of resolvedLinks) {
            const a = typeof l.source === 'string' ? l.source : (l.source as Node)?.id;
            const b = typeof l.target === 'string' ? l.target : (l.target as Node)?.id;
            if (a) allEndpointIdsFromResolved.add(String(a));
            if (b) allEndpointIdsFromResolved.add(String(b));
        }
        const orphanNodeIds = nodes.filter((n) => !allEndpointIdsFromResolved.has(n.id) && !allEndpointIdsFromResolved.has(String(n.id))).map((n) => n.id);
        const orphanAddedNodes = orphanNodeIds
            .map((id) => nodes.find((n) => n.id === id))
            .filter((n): n is Node => !!n && (n as any).diff_status === 'added');

        // In diff mode: add anchor links for orphan added nodes so they are pulled into the layout (no floating).
        let validLinks: Link[] = resolvedLinks;
        if (effectiveDiff && orphanAddedNodes.length > 0) {
            const anchor = nodes.find((n) => allEndpointIdsFromResolved.has(n.id)) ?? nodes[0];
            if (anchor) {
                const anchorLinks: Link[] = orphanAddedNodes.map((orphan) => ({
                    source: orphan,
                    target: anchor,
                    type: '_anchor',
                    is_anchor: true,
                })) as Link[];
                validLinks = [...resolvedLinks, ...anchorLinks];
            }
        } else {
            validLinks = resolvedLinks;
        }

        // In-focus set: focused node + contained nodes (REFERENCES from that node). Same logic for ART or content node.
        const inFocusNodeIds = new Set<string>();
        if (focusedNodeId) {
            inFocusNodeIds.add(focusedNodeId);
            for (const l of resolvedLinks) {
                const src = typeof l.source === 'string' ? l.source : (l.source as Node)?.id;
                const tgt = typeof l.target === 'string' ? l.target : (l.target as Node)?.id;
                const linkType = (l.type ?? '').toString().trim();
                if (linkType === 'REFERENCES' && src === focusedNodeId && tgt) inFocusNodeIds.add(tgt);
            }
        }

        // Unconditional logging so console always shows resolution result (filter by "WorldMapView").
        const addedNodeIds = new Set(nodes.filter((n: Node) => (n as any).diff_status === 'added').map((n: Node) => n.id));
        const endpointSet = allSourceTargets;
        const addedNodesWithNoLink = addedNodeIds.size ? Array.from(addedNodeIds).filter(id => !endpointSet.has(id) && !endpointSet.has(String(id))) : [];
        console.log(
            `[WorldMapView] Link resolution: ${links.length} links -> ${resolvedLinks.length} resolved, ${droppedLinks.length} dropped.` +
            (orphanAddedNodes.length ? ` ${orphanAddedNodes.length} orphan added nodes anchored.` : '') +
            (droppedLinks.length === 0 ? ' (No links dropped; if nodes look orphaned, the API may not return links for those node ids.)' : '')
        );
        if (addedNodeIds.size > 0) {
            console.log('[WorldMapView] Added node ids:', Array.from(addedNodeIds));
            if (addedNodesWithNoLink.length > 0) {
                console.warn('[WorldMapView] Added nodes with no link endpoint (likely orphaned):', addedNodesWithNoLink);
            }
        }
        if (droppedLinks.length > 0) {
            console.warn(`[WorldMapView] Dropped ${droppedLinks.length} links (unresolvable endpoints):`, droppedLinks.slice(0, 5), droppedLinks.length > 5 ? `... and ${droppedLinks.length - 5} more` : '');
        }
        console.log('[WorldMapView] Endpoint sample (from links) vs node ids:', { endpoints: Array.from(endpointSet).slice(0, 15), nodeIds: nodes.slice(0, 12).map((n: Node) => n.id) });

        // Consolidated diff debug: filter console by "WorldMapView" to hide 404/Stream noise
        if (effectiveDiff) {
            const added = nodes.filter((n: Node) => (n as any).diff_status === 'added');
            const summaryFromApi = effectiveDiff.summary ?? (effectiveDiff.diff as any)?.summary ?? {};
            const _allEndpointIds = allEndpointIdsFromResolved;
            const orphans = orphanNodeIds;
            const linkSample = links.slice(0, 8).map((l: Link) => ({
                source: typeof l.source === 'string' ? l.source : (l.source as Node)?.id,
                target: typeof l.target === 'string' ? l.target : (l.target as Node)?.id,
            }));
            console.group('[WorldMapView] Diff debug — filter by this to hide 404s');
            console.log('source', useDiffPayload ? 'diff payload' : 'data + diff status');
            console.log('counts', { nodes: nodes.length, links: links.length, resolved: validLinks.length, dropped: droppedLinks.length });
            console.log('apiSummary', { added: summaryFromApi.added, modified: summaryFromApi.modified, removed: summaryFromApi.removed, total_nodes_v2: summaryFromApi.total_nodes_v2, total_links_v2: summaryFromApi.total_links_v2 });
            console.log('semanticSummary', (summaryFromApi.semanticSummary ?? (effectiveDiff.diff as any)?.summary?.semanticSummary) ? String(summaryFromApi.semanticSummary ?? (effectiveDiff.diff as any)?.summary?.semanticSummary).slice(0, 200) : undefined);
            console.log('added nodes (ids)', added.map((n: Node) => n.id));
            console.log('orphans (nodes with no link endpoint)', orphans.length ? orphans : 'none');
            if (orphans.length) console.warn('orphan node ids', orphans);
            console.log('link sample (first 8)', linkSample);
            console.groupEnd();
        }

        // Type filter: show only nodes whose type is not explicitly hidden (typeFilter[type] !== false)
        const visibleByType = nodes.filter((n) => typeFilter[n.type] !== false);
        const visibleNodeIds = new Set(visibleByType.map((n) => n.id));

        // Search: match by id, name, label, or description (case-insensitive). Label/name are the main display fields.
        const matchesSearch = (n: Node, q: string) => {
            const t = q.toLowerCase();
            const label = (n as { label?: string }).label;
            const desc = (n as { description?: string }).description;
            return (
                (n.id && String(n.id).toLowerCase().includes(t)) ||
                (n.name && String(n.name).toLowerCase().includes(t)) ||
                (label && String(label).toLowerCase().includes(t)) ||
                (desc && String(desc).toLowerCase().includes(t))
            );
        };
        const query = mapSearchQuery.trim();
        const searchMatches = query
            ? visibleByType.filter((n) => matchesSearch(n, query))
            : visibleByType;

        if (searchMatches.length === 1 && searchMatches[0].id !== selectedNode?.id) {
            setSelectedNode(searchMatches[0]);
        }

        const effectiveNodeIds =
            query && searchMatches.length > 1
                ? new Set(searchMatches.map((n) => n.id))
                : visibleNodeIds;
        const effectiveNodes = nodes.filter((n) => effectiveNodeIds.has(n.id));
        const effectiveValidLinks = validLinks.filter(
            (l) =>
                effectiveNodeIds.has((l.source as Node).id) &&
                effectiveNodeIds.has((l.target as Node).id)
        );

        const simulation = d3.forceSimulation<Node>(effectiveNodes)
            .force('link', d3.forceLink<Node, Link>(effectiveValidLinks).id(d => d.id).distance(150))
            .force('charge', d3.forceManyBody().strength(-800))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collide', d3.forceCollide().radius(60));
        simulationRef.current = simulation;

        const linkKgStatus = (d: Link) => ((d as any).metadata?.status ?? 'active') as string;
        const linkIsPendingOrRejected = (d: Link) => statusFilter === 'all' && (linkKgStatus(d) === 'pending' || linkKgStatus(d) === 'rejected');

        const link = g.append('g')
            .attr('class', 'links')
            .selectAll('line')
            .data(effectiveValidLinks)
            .enter().append('line')
            .attr('stroke', (d: Link) => {
                if (linkIsPendingOrRejected(d)) return linkKgStatus(d) === 'pending' ? '#f59e0b' : '#ef4444';
                return (d as Link & { is_anchor?: boolean }).is_anchor ? '#94a3b8' : '#888';
            })
            .attr('stroke-width', (d: Link) => (d as Link & { is_anchor?: boolean }).is_anchor ? 1 : 1.5)
            .attr('stroke-dasharray', (d: Link) => {
                if (linkIsPendingOrRejected(d)) return '4,2';
                return (d as Link & { is_anchor?: boolean }).is_anchor ? '4,4' : null;
            })
            .attr('marker-end', (d: Link) => (d as Link & { is_anchor?: boolean }).is_anchor ? null : 'url(#arrowhead)')
            .style('opacity', (d: Link) => (d as Link & { is_anchor?: boolean }).is_anchor ? 0.35 : 0.5);

        const node = g.append('g')
            .attr('class', 'nodes')
            .selectAll('.node')
            .data(effectiveNodes)
            .enter().append('g')
            .attr('class', 'node')
            .style('opacity', 1)
            .style('filter', 'none')
            .on('click', (event, d) => {
                setFocusedNodeId(d.id);
                setSelectedNode(d);
                event.stopPropagation();
            })
            .call(d3.drag<SVGGElement, Node>()
                .on('start', (event, d) => {
                    if (!event.active) simulation.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                })
                .on('drag', (event, d) => {
                    d.fx = event.x;
                    d.fy = event.y;
                })
                .on('end', (event, d) => {
                    if (!event.active) simulation.alphaTarget(0);
                    d.fx = null;
                    d.fy = null;
                }) as any);

        // Add selection highlighting circle (outer glow)
        node.append('circle')
            .attr('class', 'selection-glow')
            .attr('r', d => {
                if (selectedNode && d.id === selectedNode.id) return 24;
                return 0;
            })
            .attr('fill', 'none')
            .attr('stroke', '#3b82f6')
            .attr('stroke-width', 3)
            .attr('opacity', 0.6)
            .style('pointer-events', 'none')
            .style('filter', 'drop-shadow(0 0 8px #3b82f6)')
            .style('animation', d => selectedNode && d.id === selectedNode.id ? 'node-pulse 2s ease-in-out infinite' : 'none');

        // When statusFilter === 'all', style pending/rejected by metadata.status (decision lineage)
        const nodeKgStatus = (d: Node) => (d.metadata?.status ?? 'active') as string;
        const isPendingOrRejected = (d: Node) => statusFilter === 'all' && (nodeKgStatus(d) === 'pending' || nodeKgStatus(d) === 'rejected');

        node.append('circle')
            .attr('r', d => {
                if (selectedNode && d.id === selectedNode.id) return 20;
                return d.id === data.metadata.active_trigger ? 18 : 12;
            })
            .attr('fill', d => {
                if (selectedNode && d.id === selectedNode.id) return '#3b82f6';
                if (isPendingOrRejected(d)) {
                    return nodeKgStatus(d) === 'pending' ? '#fef3c7' : '#fecaca'; // amber-100 / red-200
                }
                const status = (d as any).diff_status ?? (d as any).changeType;
                if (status && KG_DIFF_COLORS[status as keyof typeof KG_DIFF_COLORS]) return KG_DIFF_COLORS[status as keyof typeof KG_DIFF_COLORS];
                return getAgentColorForNodeType(d.type);
            })
            .attr('stroke', d => {
                if (selectedNode && d.id === selectedNode.id) return '#fff';
                if (isPendingOrRejected(d)) {
                    return nodeKgStatus(d) === 'pending' ? '#f59e0b' : '#ef4444'; // amber-500 / red-500
                }
                const status = (d as any).diff_status ?? (d as any).changeType;
                if (status) return '#fff';
                return d.id === data.metadata.active_trigger ? '#fff' : '#000';
            })
            .attr('stroke-width', d => {
                if (selectedNode && d.id === selectedNode.id) return 4;
                if (isPendingOrRejected(d)) return 2;
                const status = (d as any).diff_status ?? (d as any).changeType;
                if (status) return 2;
                return d.id === data.metadata.active_trigger ? 3 : 1;
            })
            .attr('stroke-dasharray', d => (isPendingOrRejected(d) ? '4,2' : null))
            .style('filter', d => {
                if (selectedNode && d.id === selectedNode.id) return 'drop-shadow(0 0 12px #3b82f6)';
                const status = (d as any).diff_status ?? (d as any).changeType;
                if (status && KG_DIFF_COLORS[status as keyof typeof KG_DIFF_COLORS]) return `drop-shadow(0 0 6px ${KG_DIFF_COLORS[status as keyof typeof KG_DIFF_COLORS]})`;
                return d.id === data.metadata.active_trigger ? 'drop-shadow(0 0 8px #fbbf24)' : 'none';
            });

        node.append('text')
            .attr('dx', 16)
            .attr('dy', 4)
            .text(d => {
                const nameOrLabel = d.name ?? (d as { label?: string }).label ?? d.id ?? 'Unknown';
                let label = String(nameOrLabel);
                const status = (d as any).diff_status ?? (d as any).changeType;
                if (status === 'added') label += ' [+]';
                if (status === 'modified') label += ' [~]';
                if (status === 'removed') label += ' [-]';
                return label;
            })
            .attr('fill', d => {
                const status = (d as any).diff_status ?? (d as any).changeType;
                if (status && KG_DIFF_COLORS[status as keyof typeof KG_DIFF_COLORS]) return KG_DIFF_COLORS[status as keyof typeof KG_DIFF_COLORS];
                return 'gray';
            })
            .style('font-size', '10px')
            .style('font-weight', d => ((d as any).diff_status ?? (d as any).changeType) ? '600' : '500')
            .style('pointer-events', 'none');

        simulation.on('tick', () => {
            const linkType = (d: Link) => (d.type ?? '').toString().trim();
            const isContentTraceLink = (d: Link) => CONTENT_TRACE_LINK_TYPES.has(linkType(d));
            const isReferencesFromFocus = (d: Link) => linkType(d) === 'REFERENCES' && (typeof d.source === 'string' ? d.source : (d.source as Node)?.id) === focusedNodeId;
            const sourceId = (d: Link) => typeof d.source === 'string' ? d.source : (d.source as Node)?.id;
            const targetId = (d: Link) => typeof d.target === 'string' ? d.target : (d.target as Node)?.id;
            const linkTouchesFocus = (d: Link) => inFocusNodeIds.has(sourceId(d)) || inFocusNodeIds.has(targetId(d));
            const linkHighlighted = (d: Link) => focusedNodeId && linkTouchesFocus(d) && (isContentTraceLink(d) || isReferencesFromFocus(d));

            link
                .attr('x1', d => (d.source as Node).x!)
                .attr('y1', d => (d.source as Node).y!)
                .attr('x2', d => (d.target as Node).x!)
                .attr('y2', d => (d.target as Node).y!)
                .style('opacity', d => {
                    if (focusedNodeId) {
                        if (linkHighlighted(d)) return 1;
                        return 0.2;
                    }
                    if (selectedNode) {
                        if (sourceId(d) === selectedNode.id || targetId(d) === selectedNode.id) return 1;
                    }
                    return 0.5;
                })
                .style('stroke-width', d => {
                    if (focusedNodeId) {
                        if (linkHighlighted(d)) return 2.5;
                        return 1;
                    }
                    if (selectedNode && (sourceId(d) === selectedNode.id || targetId(d) === selectedNode.id)) return 2.5;
                    return 1.5;
                })
                .style('stroke', d => {
                    if (focusedNodeId) {
                        if (linkHighlighted(d)) return '#3b82f6';
                        return '#888';
                    }
                    if (selectedNode && (sourceId(d) === selectedNode.id || targetId(d) === selectedNode.id)) return '#3b82f6';
                    if (linkIsPendingOrRejected(d)) return linkKgStatus(d) === 'pending' ? '#f59e0b' : '#ef4444';
                    return '#888';
                });

            node
                .attr('transform', d => `translate(${d.x},${d.y})`)
                .style('opacity', d => {
                    if (focusedNodeId) return inFocusNodeIds.has(d.id) ? 1 : 0.35;
                    if (selectedNode && d.id !== selectedNode.id) return 0.4;
                    return 1;
                });
            
            // Update selection glow position
            node.select('.selection-glow')
                .attr('r', d => {
                    if (selectedNode && d.id === selectedNode.id) return 24;
                    return 0;
                });
        });

        // Initial zoom to fit
        setTimeout(() => {
            const bounds = (g.node() as SVGGElement).getBBox();
            const fullWidth = width;
            const fullHeight = height;
            const midX = bounds.x + bounds.width / 2;
            const midY = bounds.y + bounds.height / 2;
            if (bounds.width === 0 || bounds.height === 0) return;

            const scale = 0.8 / Math.max(bounds.width / fullWidth, bounds.height / fullHeight);
            svg.transition().duration(750).call(
                zoom.transform,
                d3.zoomIdentity.translate(fullWidth / 2, fullHeight / 2).scale(scale).translate(-midX, -midY)
            );
        }, 500);

        return () => {
            simulationRef.current?.stop();
            simulationRef.current = null;
            if (svgElForCleanup && svgElForCleanup.parentNode) {
                try {
                    // Clear SVG with a single DOM write to avoid removeChild errors when
                    // React and D3 disagree (e.g. on project switch / unmount).
                    svgElForCleanup.innerHTML = '';
                } catch {
                    // Ignore if already detached or other DOM errors
                }
            }
        };
    }, [data, viewMode, diffData, selectedTimelineVersionId, timelineVersionDiff, selectedNode, focusedNodeId, compareViewMode, mapSearchQuery, typeFilter, statusFilter]);

    // Center map on selected node when it changes
    useEffect(() => {
        if (!selectedNode || !svgRef.current || !data) return;
        
        const svg = d3.select(svgRef.current);
        const g = svg.select<SVGGElement>('g');
        if (!g.node()) return;
        
        // Wait for simulation to settle and DOM to update
        const timeoutId = setTimeout(() => {
            // Find the selected node in the simulation
            const nodeElement = g.selectAll<SVGGElement, Node>('.node')
                .filter((d: Node) => d.id === selectedNode.id);
            
            if (nodeElement.empty()) return;
            
            const node = nodeElement.datum() as Node;
            if (!node.x || !node.y) return;
            
            // Get current zoom transform
            if (!svgRef.current) return;
            const zoom = d3.zoom<SVGSVGElement, unknown>();
            const currentTransform = d3.zoomTransform(svgRef.current);
            
            // Calculate center position in viewport coordinates
            const container = svgRef.current.parentElement;
            if (!container) return;
            
            const containerWidth = container.clientWidth;
            const containerHeight = container.clientHeight;
            
            // Center the selected node in the viewport
            const scale = currentTransform.k || 1;
            const translateX = containerWidth / 2 - node.x * scale;
            const translateY = containerHeight / 2 - node.y * scale;
            
            // Smooth transition to center on selected node
            svg.transition()
                .duration(750)
                .ease(d3.easeCubicOut)
                .call(
                    zoom.transform,
                    d3.zoomIdentity.translate(translateX, translateY).scale(scale)
                );
        }, 300);
        
        return () => clearTimeout(timeoutId);
    }, [selectedNode, data]);

    // Approved decision ids: hide draft nodes for proposals that were already applied
    const approvedDecisionIds = useMemo(
        () => new Set((kgDecisions || []).filter((d) => d.status === 'approved').map((d) => d.id)),
        [kgDecisions]
    );
    const draftsToShow = useMemo(
        () => draftArtifactNodes.filter((n: Node) => !approvedDecisionIds.has(n.id.replace(/^draft-/, ''))),
        [draftArtifactNodes, approvedDecisionIds]
    );

    // Artifacts View Component: KG artifacts (accepted) + pending proposals (draft) — exclude drafts that were applied.
    // Dedupe by metadata.artifact_id so the same document does not appear twice (e.g. base + enriched node for same file).
    const ArtifactsView = () => {
        const kgArtifacts = data?.nodes.filter(n => n.type === 'ARTIFACT') || [];
        const enrichedKg = kgArtifacts.map(artifact => {
            const fullNode = data?.nodes.find(n => n.id === artifact.id);
            return {
                ...artifact,
                metadata: fullNode?.metadata || artifact.metadata || {}
            };
        });
        const seenArtifactIds = new Set<string>();
        const dedupedKg = enrichedKg.filter((n) => {
            const aid = n.metadata?.artifact_id;
            if (aid != null && aid !== '') {
                if (seenArtifactIds.has(String(aid))) return false;
                seenArtifactIds.add(String(aid));
            }
            return true;
        });
        const artifacts = [...draftsToShow, ...dedupedKg];

        return (
            <ArtifactsListView
                artifacts={artifacts}
                threadId={threadId}
                onNodeSelect={setSelectedNode}
                selectedNode={selectedNode}
            />
        );
    };

    return (
        <div className="h-full w-full flex flex-col bg-background overflow-hidden relative">
            {/* History Panel - Slide In (hidden when decisions table is the timeline) */}
            {!embeddedInDecisions && showHistory && kgHistory && (
                <div className="absolute top-12 left-0 bottom-0 w-80 bg-background/95 backdrop-blur-sm border-r border-border z-30 flex flex-col animate-in slide-in-from-left-4 duration-200">
                    <div className="p-4 border-b border-border flex justify-between items-center bg-muted/30">
                        <div>
                            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                                {compareMode ? "Compare Versions" : "Timeline"}
                            </h3>
                            <p className="text-[10px] text-muted-foreground">
                                {compareMode ? "Select two versions to compare" : `${kgHistory.total} snapshots available`}
                            </p>
                            {!compareMode && (
                                <p className="text-[10px] text-muted-foreground/70 mt-0.5" title="GitHub commits for NPDModel.json (KG+decision pair), not LangGraph thread history">
                                    KG + decision history
                                </p>
                            )}
                            {!compareMode && kgHistory.total === 0 && (
                                <p className="text-[10px] text-muted-foreground/80 mt-1 italic">
                                    Version history appears after the KG is saved (e.g. apply a decision or complete hydration). If you see history on GitHub for this project, the backend may be using a different branch — set DATA_GITHUB_STORAGE_BRANCH to match the branch in your GitHub URL.
                                </p>
                            )}
                        </div>
                        <UIButton variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                            setShowHistory(false);
                            setCompareMode(false);
                        }}>
                            <ZoomOut className="h-3 w-3" />
                        </UIButton>
                    </div>
                    {compareMode ? (
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-muted-foreground uppercase mb-2 block">Version 1 (Base)</label>
                                <div className="space-y-1">
                                    <div
                                        className={cn(
                                            "p-2 rounded-md cursor-pointer transition-colors border",
                                            compareVersion1 === "current" ? "bg-blue-500/20 border-blue-500/40" : "border-border hover:bg-muted"
                                        )}
                                        onClick={() => {
                                            setCompareVersion1("current");
                                            if (compareVersion2) fetchDiff("current", compareVersion2);
                                        }}
                                    >
                                        <span className="text-xs font-medium text-foreground">Current State</span>
                                    </div>
                                    {kgHistory.versions.map((v: any) => (
                                        <div
                                            key={v.id}
                                            className={cn(
                                                "p-2 rounded-md cursor-pointer transition-colors border",
                                                compareVersion1 === v.id ? "bg-blue-500/20 border-blue-500/40" : "border-border hover:bg-muted"
                                            )}
                                            onClick={() => {
                                                setCompareVersion1(v.id);
                                                if (compareVersion2) fetchDiff(v.id, compareVersion2);
                                            }}
                                        >
                                            <span className="text-xs font-medium text-foreground">
                                                {v.message || v.id}
                                            </span>
                                            <div className="flex items-center justify-between mt-0.5">
                                                <span className="text-[10px] text-muted-foreground">{v.timestamp}</span>
                                                {v.sha && (
                                                    <span className="text-[9px] text-muted-foreground/60 font-mono">{v.sha}</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                                {v.source === "organization" && (
                                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">Organization</span>
                                                )}
                                                {v.source === "project" && (
                                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">Project</span>
                                                )}
                                                {kgDecisions.some((d: any) => d.kg_version_sha === v.id) && (
                                                    <span className="text-[9px] text-purple-600 dark:text-purple-400">Decision</span>
                                                )}
                                                <span className="text-[9px] text-muted-foreground">Clone: {v.source === "organization" ? "Org" : "—"}</span>
                                                {(() => {
                                                    const parsed = parseDecisionCommitMessage(v.message_full);
                                                    const label = decisionStatusLabel(parsed.status);
                                                    if (!label) return null;
                                                    const s = parsed.status?.toLowerCase();
                                                    return (
                                                        <span className={cn(
                                                            "text-[9px] px-1.5 py-0.5 rounded font-medium",
                                                            s === 'pending' && "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
                                                            s === 'approved' && "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200",
                                                            s === 'rejected' && "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200"
                                                        )}>
                                                            {label}
                                                        </span>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-muted-foreground uppercase mb-2 block">Version 2 (Compare)</label>
                                <div className="space-y-1">
                                    <div
                                        className={cn(
                                            "p-2 rounded-md cursor-pointer transition-colors border",
                                            compareVersion2 === "current" ? "bg-green-500/20 border-green-500/40" : "border-border hover:bg-muted"
                                        )}
                                        onClick={() => {
                                            setCompareVersion2("current");
                                            if (compareVersion1) fetchDiff(compareVersion1, "current");
                                        }}
                                    >
                                        <span className="text-xs font-medium text-foreground">Current State</span>
                                    </div>
                                    {kgHistory.versions.map((v: any) => (
                                        <div
                                            key={v.id}
                                            className={cn(
                                                "p-2 rounded-md cursor-pointer transition-colors border",
                                                compareVersion2 === v.id ? "bg-green-500/20 border-green-500/40" : "border-border hover:bg-muted"
                                            )}
                                            onClick={() => {
                                                setCompareVersion2(v.id);
                                                if (compareVersion1) fetchDiff(compareVersion1, v.id);
                                            }}
                                        >
                                            <span className="text-xs font-medium text-foreground">
                                                {v.message || v.id}
                                            </span>
                                            <div className="flex items-center justify-between mt-0.5">
                                                <span className="text-[10px] text-muted-foreground">{v.timestamp}</span>
                                                {v.sha && (
                                                    <span className="text-[9px] text-muted-foreground/60 font-mono">{v.sha}</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                                {v.source === "organization" && (
                                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">Organization</span>
                                                )}
                                                {v.source === "project" && (
                                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">Project</span>
                                                )}
                                                {kgDecisions.some((d: any) => d.kg_version_sha === v.id) && (
                                                    <span className="text-[9px] text-purple-600 dark:text-purple-400">Decision</span>
                                                )}
                                                <span className="text-[9px] text-muted-foreground">Clone: {v.source === "organization" ? "Org" : "—"}</span>
                                                {(() => {
                                                    const parsed = parseDecisionCommitMessage(v.message_full);
                                                    const label = decisionStatusLabel(parsed.status);
                                                    if (!label) return null;
                                                    const s = parsed.status?.toLowerCase();
                                                    return (
                                                        <span className={cn(
                                                            "text-[9px] px-1.5 py-0.5 rounded font-medium",
                                                            s === 'pending' && "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
                                                            s === 'approved' && "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200",
                                                            s === 'rejected' && "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200"
                                                        )}>
                                                            {label}
                                                        </span>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            {loadingDiff && (
                                <div className="flex items-center justify-center py-4">
                                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                </div>
                            )}
                            {(() => {
                                const effectiveSummary = (selectedTimelineVersionId && timelineVersionDiff?.summary)
                                    ? timelineVersionDiff.summary
                                    : diffData?.summary;
                                if (!effectiveSummary) return null;
                                const semSummary = timelineVersionDiff?.diff?.summary?.semanticSummary ?? timelineVersionDiff?.summary?.semanticSummary ?? (diffData?.diff?.summary as { semanticSummary?: string })?.semanticSummary ?? (diffData?.summary as { semanticSummary?: string })?.semanticSummary;
                                return (
                                    <div className="mt-4 p-3 bg-muted/50 rounded-md border border-border">
                                        <div className="text-[10px] font-bold text-muted-foreground uppercase mb-2">Diff Summary</div>
                                        <div className="space-y-1 text-xs">
                                            <div className="flex justify-between">
                                                <span className="text-green-500">Added:</span>
                                                <span className="font-medium">{effectiveSummary.added ?? 0}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-yellow-500">Modified:</span>
                                                <span className="font-medium">{effectiveSummary.modified ?? 0}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-red-500">Removed:</span>
                                                <span className="font-medium">{effectiveSummary.removed ?? 0}</span>
                                            </div>
                                            {(effectiveSummary as { total_nodes_v1?: number }).total_nodes_v1 != null && (
                                                <div className="pt-2 border-t border-border mt-2">
                                                    <div className="flex justify-between text-[10px] text-muted-foreground">
                                                        <span>Nodes: {(effectiveSummary as { total_nodes_v1?: number }).total_nodes_v1} → {(effectiveSummary as { total_nodes_v2?: number }).total_nodes_v2}</span>
                                                    </div>
                                                    <div className="flex justify-between text-[10px] text-muted-foreground">
                                                        <span>Links: {(effectiveSummary as { total_links_v1?: number }).total_links_v1} → {(effectiveSummary as { total_links_v2?: number }).total_links_v2}</span>
                                                    </div>
                                                </div>
                                            )}
                                            {semSummary && (
                                                <div className="pt-2 border-t border-border mt-2">
                                                    <p className="text-[10px] text-muted-foreground italic">{semSummary as string}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto p-2 space-y-1 flex flex-col">
                            {/* Data view header: Phase and Clone */}
                            <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase border-b border-border/50">
                                <span>Version</span>
                                <span>Phase</span>
                                <span>Clone</span>
                            </div>
                            <div
                                className={cn(
                                    "p-3 rounded-md cursor-pointer transition-colors flex flex-col gap-1",
                                    !activeVersion ? "bg-primary/10 border border-primary/20" : "hover:bg-muted"
                                )}
                                onClick={() => {
                                    setSelectedTimelineVersionId(null);
                                    setTimelineVersionDiff(null);
                                    fetchData();
                                }}
                            >
                                <span className="text-xs font-semibold text-foreground flex items-center justify-between">
                                    Current State
                                    {!activeVersion && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
                                </span>
                                <span className="text-[10px] text-muted-foreground">Live Active Graph</span>
                            </div>

                            {kgHistory.versions.map((v: any) => {
                                const isDecision = kgDecisions.some((d: any) => d.kg_version_sha === v.id);
                                const phase = v.source === "organization" ? "Organization" : (v.source === "project" ? "Project" : (v.source ?? "Project"));
                                const cloneLabel = v.source === "organization" ? "Org" : "—";
                                return (
                                    <div
                                        key={v.id}
                                        className={cn(
                                            "p-3 rounded-md cursor-pointer transition-colors flex flex-col gap-1 border border-transparent",
                                            activeVersion === v.id ? "bg-purple-500/10 border-purple-500/20" : "hover:bg-muted"
                                        )}
                                        onClick={() => {
                                            setActiveVersion(v.id);
                                            fetchData(v.id, false, false, v.source);
                                            if (isDecision) {
                                                setSelectedTimelineVersionId(v.id);
                                                console.log('[WorldMapView] Timeline: selected decision version', { versionId: v.id });
                                                fetchDiffForTimelineVersion(v.id);
                                            } else {
                                                setSelectedTimelineVersionId(null);
                                                setTimelineVersionDiff(null);
                                            }
                                        }}
                                    >
                                        <span className="text-xs font-medium text-foreground">
                                            {v.message || v.id}
                                        </span>
                                        {v.message_full && v.message_full.trim() !== (v.message || '').trim() && (
                                            <p className="text-[10px] text-muted-foreground whitespace-pre-wrap line-clamp-3 mt-0.5 border-t border-border/50 pt-1">
                                                {v.message_full}
                                            </p>
                                        )}
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-muted-foreground">{v.timestamp}</span>
                                            {v.sha && (
                                                <span className="text-[9px] text-muted-foreground/60 font-mono">{v.sha}</span>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                            {phase === "Organization" && (
                                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200" title="Phase">Organization</span>
                                            )}
                                            {phase === "Project" && (
                                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200" title="Phase">Project</span>
                                            )}
                                            {isDecision && (
                                                <span className="text-[9px] text-purple-600 dark:text-purple-400">Decision</span>
                                            )}
                                            {(() => {
                                                const parsed = parseDecisionCommitMessage(v.message_full);
                                                const label = decisionStatusLabel(parsed.status);
                                                if (!label) return null;
                                                const s = parsed.status?.toLowerCase();
                                                return (
                                                    <span className={cn(
                                                        "text-[9px] px-1.5 py-0.5 rounded font-medium",
                                                        s === 'pending' && "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
                                                        s === 'approved' && "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200",
                                                        s === 'rejected' && "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200"
                                                    )}>
                                                        {label}
                                                    </span>
                                                );
                                            })()}
                                            </div>
                                            <span className="text-[9px] text-muted-foreground shrink-0" title="Clone">{cloneLabel}</span>
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Diff for selected decision version (timeline view) */}
                            {selectedTimelineVersionId && (
                                <div className="mt-4 p-3 border-t border-border space-y-2">
                                    <div className="text-[10px] font-bold text-muted-foreground uppercase">Diff for this version</div>
                                    {loadingTimelineDiff && (
                                        <div className="flex justify-center py-4">
                                            <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                        </div>
                                    )}
                                    {!loadingTimelineDiff && timelineVersionDiff && (
                                        <>
                                            {/* Numeric summary (from API top-level summary) */}
                                            {timelineVersionDiff.summary && (
                                                <div className="space-y-1 text-xs p-2 rounded-md bg-muted/30 border border-border">
                                                    <div className="flex justify-between">
                                                        <span className="text-green-500">Added:</span>
                                                        <span className="font-medium">{timelineVersionDiff.summary.added ?? 0}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-yellow-500">Modified:</span>
                                                        <span className="font-medium">{timelineVersionDiff.summary.modified ?? 0}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-red-500">Removed:</span>
                                                        <span className="font-medium">{timelineVersionDiff.summary.removed ?? 0}</span>
                                                    </div>
                                                    {(timelineVersionDiff.summary as { total_nodes_v1?: number }).total_nodes_v1 != null && (
                                                        <div className="pt-2 border-t border-border mt-2 space-y-0.5">
                                                            <div className="flex justify-between text-[10px] text-muted-foreground">
                                                                <span>Nodes: {(timelineVersionDiff.summary as { total_nodes_v1?: number }).total_nodes_v1} → {(timelineVersionDiff.summary as { total_nodes_v2?: number }).total_nodes_v2}</span>
                                                            </div>
                                                            <div className="flex justify-between text-[10px] text-muted-foreground">
                                                                <span>Links: {(timelineVersionDiff.summary as { total_links_v1?: number }).total_links_v1} → {(timelineVersionDiff.summary as { total_links_v2?: number }).total_links_v2}</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {timelineVersionDiff.summary.semanticSummary && (
                                                        <p className="text-[10px] text-muted-foreground italic pt-1 border-t border-border mt-1">
                                                            {timelineVersionDiff.summary.semanticSummary}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                            {/* Full diagram (nodes/edges list) */}
                                            {timelineVersionDiff.diff && (
                                                <KgDiffDiagramView payload={timelineVersionDiff.diff} isLoading={false} />
                                            )}
                                            {!loadingTimelineDiff && !timelineVersionDiff.diff && timelineVersionDiff.summary && (
                                                <p className="text-xs text-muted-foreground">No structural diff (summary only).</p>
                                            )}
                                        </>
                                    )}
                                    {!loadingTimelineDiff && selectedTimelineVersionId && !timelineVersionDiff && (
                                        <p className="text-xs text-muted-foreground">Loading diff from previous version…</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Canvas Area - Split vertically when node is selected (but not in artifacts view) */}
            {selectedNode && viewMode !== 'artifacts' ? (
                <div className="flex-1 flex flex-col relative overflow-hidden">
                    {/* Map - Top, full width */}
                    <div ref={containerRef} className="flex-1 relative overflow-hidden border-b border-border min-h-0" onClick={(e) => {
                        // Only close if clicking directly on the map background, not on nodes
                        if (e.target === e.currentTarget || (e.target as Element).closest('svg')) {
                            setSelectedNode(null);
                        }
                    }}>
                        {viewMode === 'artifacts' ? (
                    <ArtifactsView />
                ) : (
                    <>
                        {loading && !data && (
                            <div className="absolute inset-0 flex items-center justify-center bg-background z-30">
                                <div className="text-center">
                                    <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                                    <p className="text-xs text-muted-foreground">Initializing Knowledge Graph...</p>
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="absolute inset-0 flex items-center justify-center bg-background z-30 p-6 text-center">
                                <div>
                                    <p className="text-destructive mb-4 font-mono text-sm leading-relaxed max-w-md mx-auto">Error: {error}</p>
                                    <UIButton onClick={() => fetchData()} variant="outline" className="border-border">Retry Connection</UIButton>
                                </div>
                            </div>
                        )}

                        {((compareMode && diffData?.diff?.type === "kg_diff") || (selectedTimelineVersionId && timelineVersionDiff?.diff?.type === "kg_diff")) && compareViewMode === "diff" ? (
                            <div className="absolute inset-0 overflow-auto p-4 bg-background z-10">
                                <KgDiffDiagramView payload={(diffData?.diff ?? timelineVersionDiff?.diff)!} isLoading={false} />
                            </div>
                        ) : (
                            <svg ref={svgRef} className="h-full w-full cursor-grab active:cursor-grabbing" />
                        )}

                        <div className="absolute bottom-6 left-6 z-20 flex flex-col gap-2">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-background/80 backdrop-blur-md border border-border rounded-full shadow-lg">
                                <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Knowledge Graph Mode</span>
                            </div>
                            {/* When embedded in Decisions tab: show that we're displaying diff for the selected decision */}
                            {embeddedInDecisions && selectedTimelineVersionId && (
                                <div className="px-3 py-2 bg-background/90 backdrop-blur-md border border-border rounded-lg shadow-lg text-[10px]">
                                    <span className="font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Diff for selected decision</span>
                                    {loadingTimelineDiff ? (
                                        <span className="text-muted-foreground">Loading diff…</span>
                                    ) : timelineVersionDiff?.summary ? (
                                        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: KG_DIFF_COLORS.added }} /> Added {timelineVersionDiff.summary.added ?? 0}</span>
                                            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: KG_DIFF_COLORS.modified }} /> Modified {timelineVersionDiff.summary.modified ?? 0}</span>
                                            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: KG_DIFF_COLORS.removed }} /> Removed {timelineVersionDiff.summary.removed ?? 0}</span>
                                        </div>
                                    ) : (
                                        <span className="text-muted-foreground">No diff summary</span>
                                    )}
                                </div>
                            )}
                            {(diffData?.diff?.type === "kg_diff" || timelineVersionDiff?.diff?.type === "kg_diff") && (
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center gap-2 px-2">
                                        <button
                                            type="button"
                                            className={cn(
                                                "text-[10px] font-medium px-2 py-1 rounded",
                                                compareViewMode === 'graph' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                                            )}
                                            onClick={() => setCompareViewMode('graph')}
                                        >
                                            Graph
                                        </button>
                                        <button
                                            type="button"
                                            className={cn(
                                                "text-[10px] font-medium px-2 py-1 rounded",
                                                compareViewMode === 'diff' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                                            )}
                                            onClick={() => setCompareViewMode('diff')}
                                        >
                                            Diff list
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-4 px-3 py-2 bg-background/90 backdrop-blur-md border border-border rounded-lg shadow-lg text-[10px] font-medium">
                                        <span className="text-muted-foreground uppercase tracking-wider">Diff:</span>
                                        <span className="flex items-center gap-1.5">
                                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: KG_DIFF_COLORS.added }} title="Added" />
                                            Added
                                        </span>
                                        <span className="flex items-center gap-1.5">
                                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: KG_DIFF_COLORS.modified }} title="Modified" />
                                            Modified
                                        </span>
                                        <span className="flex items-center gap-1.5">
                                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: KG_DIFF_COLORS.removed }} title="Removed" />
                                            Removed
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}

                        {/* Floating Controls - only when bottom panel is collapsed */}
                        {bottomPanelCollapsed && (
                            <div className="absolute bottom-6 right-6 flex flex-col gap-2 z-20">
                                <UIButton variant="outline" size="icon" className="w-9 h-9 bg-background/50 border-border text-muted-foreground hover:text-foreground rounded-lg backdrop-blur-md">
                                    <ZoomIn className="h-4 w-4" />
                                </UIButton>
                                <UIButton variant="outline" size="icon" className="w-9 h-9 bg-background/50 border-border text-muted-foreground hover:text-foreground rounded-lg backdrop-blur-md">
                                    <ZoomOut className="h-4 w-4" />
                                </UIButton>
                                <UIButton variant="outline" size="icon" className="w-9 h-9 bg-background/50 border-border text-muted-foreground hover:text-foreground rounded-lg backdrop-blur-md">
                                    <Maximize className="h-4 w-4" />
                                </UIButton>
                            </div>
                        )}
                    </div>

                    {/* Detail Panel - Bottom, resizable height */}
                    <div className="h-96 relative overflow-hidden flex flex-col border-t border-border shrink-0" onClick={(e) => e.stopPropagation()}>
                        <NodeDetailPanel
                            node={selectedNode}
                            onClose={() => setSelectedNode(null)}
                            position="bottom"
                            threadId={threadId}
                        />
                    </div>
                </div>
            ) : (
                <div ref={containerRef} className="flex-1 min-h-0 flex flex-col relative overflow-hidden" onClick={() => { setSelectedNode(null); setFocusedNodeId(null); }}>
                    {viewMode === 'artifacts' ? (
                        <ArtifactsView />
                    ) : (
                        <>
                            {loading && !data && (
                                <div className="absolute inset-0 flex items-center justify-center bg-background z-30">
                                    <div className="text-center">
                                        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                                        <p className="text-xs text-muted-foreground">Initializing Knowledge Graph...</p>
                                    </div>
                                </div>
                            )}

                            {error && (
                                <div className="absolute inset-0 flex items-center justify-center bg-background z-30 p-6 text-center">
                                    <div>
                                        <p className="text-destructive mb-4 font-mono text-sm leading-relaxed max-w-md mx-auto">Error: {error}</p>
                                        <UIButton onClick={() => fetchData()} variant="outline" className="border-border">Retry Connection</UIButton>
                                    </div>
                                </div>
                            )}

                            <svg ref={svgRef} className="h-full w-full cursor-grab active:cursor-grabbing" />

                            <div className="absolute bottom-6 left-6 z-20">
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-background/80 backdrop-blur-md border border-border rounded-full shadow-lg">
                                    <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Knowledge Graph Mode</span>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Floating Controls - only when bottom panel is collapsed */}
                    {bottomPanelCollapsed && (
                        <div className="absolute bottom-6 right-6 flex flex-col gap-2 z-20">
                            <UIButton variant="outline" size="icon" className="w-9 h-9 bg-background/50 border-border text-muted-foreground hover:text-foreground rounded-lg backdrop-blur-md">
                                <ZoomIn className="h-4 w-4" />
                            </UIButton>
                            <UIButton variant="outline" size="icon" className="w-9 h-9 bg-background/50 border-border text-muted-foreground hover:text-foreground rounded-lg backdrop-blur-md">
                                <ZoomOut className="h-4 w-4" />
                            </UIButton>
                            <UIButton variant="outline" size="icon" className="w-9 h-9 bg-background/50 border-border text-muted-foreground hover:text-foreground rounded-lg backdrop-blur-md">
                                <Maximize className="h-4 w-4" />
                            </UIButton>
                        </div>
                    )}
                </div>
            )}

            {/* Map controls: only show when not embedded in Decisions tab */}
            {!embeddedInDecisions && (
            <div className={cn("border-t border-border bg-muted/30 z-20 shrink-0 flex flex-col", bottomPanelCollapsed ? "h-9" : "min-h-[52px]")}>
                {bottomPanelCollapsed ? (
                    <button
                        type="button"
                        onClick={() => setBottomPanelCollapsed(false)}
                        className="h-full w-full flex items-center justify-center gap-2 px-4 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    >
                        <ChevronUp className="h-3.5 w-3.5" />
                        Map controls
                    </button>
                ) : (
                    <div className="flex items-center gap-3 flex-wrap px-3 py-2">
                        {/* Workflow strip (same order and colors as header) */}
                        {workflowStrip && workflowStrip.nodes.length > 0 && (
                            <div className="flex items-center gap-0.5 border border-border/50 rounded-md px-1.5 py-0.5 bg-background/50">
                                {workflowStrip.nodes.map((node, i) => {
                                    const color = getWorkflowNodeColor(node.id);
                                    const isActive = workflowStrip.active_node === node.id;
                                    return (
                                        <span key={node.id} className="flex items-center shrink-0 gap-0.5">
                                            <span
                                                className={cn(
                                                    "inline-block px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap border border-transparent",
                                                    isActive ? "text-foreground ring-1 ring-primary/40" : "text-muted-foreground"
                                                )}
                                                style={isActive ? { backgroundColor: `color-mix(in srgb, ${color} 22%, hsl(215,20%,25%))`, borderColor: `color-mix(in srgb, ${color} 55%, transparent)` } : undefined}
                                                title={node.label}
                                            >
                                                {node.label}
                                            </span>
                                            {i < workflowStrip.nodes.length - 1 && <span className="text-muted-foreground/50 text-[10px] shrink-0">→</span>}
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                        <div className="h-4 w-px bg-border shrink-0" />
                        {/* Project risk summary (Epic #143 — map context pane) */}
                        {scopeProjectId && (loadingRiskSummary || riskSummary !== null) && (
                            <div className="flex items-center gap-1.5 shrink-0 px-2 py-1 rounded-md border border-border bg-background/50">
                                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider shrink-0">Risks</span>
                                {loadingRiskSummary ? (
                                    <span className="text-[10px] text-muted-foreground">…</span>
                                ) : riskSummary ? (
                                    <span className="text-[10px] tabular-nums">
                                        <span className="text-foreground">{riskSummary.in_scope}</span>
                                        <span className="text-muted-foreground mx-0.5">in scope</span>
                                        <span className="text-muted-foreground mx-1">·</span>
                                        <span className="text-green-600 dark:text-green-400">{riskSummary.covered}</span>
                                        <span className="text-muted-foreground mx-0.5">covered</span>
                                        <span className="text-muted-foreground mx-1">·</span>
                                        <span className={riskSummary.uncovered > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}>{riskSummary.uncovered}</span>
                                        <span className="text-muted-foreground mx-0.5">uncovered</span>
                                    </span>
                                ) : null}
                            </div>
                        )}
                        <div className="h-4 w-px bg-border shrink-0" />
                        {/* Status filter: every decision has an impact on the world. Default = Active (approved only). */}
                        {data?.nodes?.length ? (
                            <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider shrink-0">Status</span>
                                {(['active', 'all', 'pending', 'rejected'] as const).map((s) => (
                                    <button
                                        key={s}
                                        type="button"
                                        onClick={() => setStatusFilter(s)}
                                        className={cn(
                                            'inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium border transition-colors',
                                            statusFilter === s
                                                ? 'border-primary bg-primary/15 text-primary'
                                                : 'border-border bg-muted/30 hover:bg-muted/50 text-muted-foreground'
                                        )}
                                        title={s === 'active' ? 'Approved only (default)' : s === 'all' ? 'Show all' : `Show ${s} only`}
                                    >
                                        {s === 'active' ? 'Active' : s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                        <div className="h-4 w-px bg-border shrink-0" />
                        {/* Project risk summary (in scope, covered, uncovered). Not affected by map filters. */}
                        {riskSummary ? (
                            <div className="flex items-center gap-1.5 flex-wrap shrink-0" title="Risks in scope for this project; covered = addressed by artifact content.">
                                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider shrink-0">Risks</span>
                                <span className="text-[10px] text-foreground">
                                    {riskSummary.in_scope} in scope · {riskSummary.covered} covered · {riskSummary.uncovered} uncovered
                                </span>
                            </div>
                        ) : null}
                        <div className="h-4 w-px bg-border shrink-0" />
                        {/* Focus: click template to focus that artifact on the map (contained nodes + content trace links). Clear to show all. */}
                        {data?.nodes?.length ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider shrink-0">Focus</span>
                                {focusedNodeId ? (
                                    <button type="button" onClick={() => { setFocusedNodeId(null); }} className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium border border-border bg-primary/15 text-primary hover:bg-primary/25" title="Show all nodes and links">Clear focus</button>
                                ) : null}
                                {(() => {
                                    const entityCounts = data.metadata?.entity_counts ?? {};
                                    const typesInData = new Set(data.nodes.map((n) => n.type));
                                    return MAP_LEGEND_AGENT_HIERARCHY.map((agent) => {
                                        const agentTypesPresent = agent.templates.flatMap((t) => t.types.filter((ty) => typesInData.has(ty)));
                                        if (agentTypesPresent.length === 0) return null;
                                        const isCollapsed = legendCollapsed[agent.agentId] === true;
                                        const color = agentColors[agent.agentId] ?? '#888';
                                        const phaseRisk = phaseRiskAggregates.find((p) => p.phase_id === agent.agentId);
                                        return (
                                            <div key={agent.agentId} className="rounded-md overflow-hidden border border-border" style={{ borderColor: `color-mix(in srgb, ${color} 65%, transparent)` }}>
                                                <button type="button" onClick={() => setLegendCollapsed((prev) => ({ ...prev, [agent.agentId]: !prev[agent.agentId] }))} className={cn("w-full inline-flex items-center gap-1.5 rounded-t-md px-2 py-0.5 text-[10px] font-semibold border-b border-border transition-colors bg-muted/30 hover:bg-muted/50 text-foreground")} style={{ backgroundColor: `color-mix(in srgb, ${color} 22%, hsl(215,20%,25%))` }}>
                                                    {isCollapsed ? <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />}
                                                    <span>{agent.agentName}</span>
                                                    {phaseRisk != null && (phaseRisk.covered > 0 || phaseRisk.uncovered > 0) && (
                                                        <span className="text-[9px] font-normal text-muted-foreground tabular-nums ml-1">
                                                            Risks: {phaseRisk.covered} covered, {phaseRisk.uncovered} uncovered
                                                        </span>
                                                    )}
                                                </button>
                                                {!isCollapsed && (
                                                    <div className="bg-background/50 p-1.5 pt-1 space-y-1">
                                                        {agent.templates.map((tpl) => {
                                                            const present = tpl.types.filter((ty) => typesInData.has(ty));
                                                            if (present.length === 0) return null;
                                                            const firstArtId = tpl.templateId ? getFocusArtIdForTemplate(tpl.templateId) : undefined;
                                                            const isFocused = firstArtId != null && focusedNodeId === firstArtId;
                                                            const risksAddressed = tpl.templateId ? (() => {
                                                                const arts = (riskSummary?.artifact_aggregates ?? []).filter((a) => a.template_id === tpl.templateId);
                                                                const union = new Set<string>();
                                                                arts.forEach((a) => (a.covered_crit_ids ?? []).forEach((id) => union.add(id)));
                                                                return union.size;
                                                            })() : 0;
                                                            return (
                                                                <div key={tpl.templateName} className="pl-1">
                                                                    <div className="flex items-center gap-1 mb-0.5">
                                                                        <span className="text-[9px] font-medium text-muted-foreground">{tpl.templateName}</span>
                                                                        {firstArtId != null ? (
                                                                            <button type="button" onClick={(e) => { e.stopPropagation(); setFocusedNodeId(firstArtId); const node = data?.nodes?.find((n: Node) => n.id === firstArtId); if (node) setSelectedNode(node); }} className={cn("rounded px-1 py-0.5 text-[8px] font-medium border transition-colors", isFocused ? "border-primary bg-primary/20 text-primary" : "border-border bg-muted/30 hover:bg-muted/50 text-muted-foreground")} title="Focus map on this artifact (contained nodes + trace links)">Focus</button>
                                                                        ) : null}
                                                                    </div>
                                                                    {risksAddressed > 0 ? (
                                                                        <div className="text-[9px] text-muted-foreground/90 mb-0.5" title="Risks addressed by artifacts of this type">Risks addressed: {risksAddressed}</div>
                                                                    ) : null}
                                                                    <div className="flex flex-wrap gap-1 opacity-75">
                                                                        <span className="text-[8px] text-muted-foreground/80 uppercase tracking-wider">Type</span>
                                                                        {present.map((t) => {
                                                                            const cfg = typeConfig[t] ?? { label: t };
                                                                            const count = entityCounts[t];
                                                                            const visible = typeFilter[t] !== false;
                                                                            return (
                                                                                <button key={t} type="button" onClick={(e) => { e.stopPropagation(); setTypeFilter((prev) => ({ ...prev, [t]: !(prev[t] !== false) })); }} className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium border transition-colors", visible ? "border-border bg-muted/50 hover:bg-muted text-foreground" : "border-transparent bg-muted/20 text-muted-foreground opacity-60")} title={visible ? `Hide ${cfg.label}` : `Show ${cfg.label}`}>
                                                                                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                                                                    {cfg.label}
                                                                                    {typeof count === "number" && <span className="text-muted-foreground tabular-nums">({count})</span>}
                                                                                </button>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        ) : null}
                        <div className="h-4 w-px bg-border shrink-0" />
                        {/* Search: same vocabulary as KG in chat (id, label/name, description). See docs/MAP_SEARCH_AND_LLM_KG_ALIGNMENT.md */}
                        <div className="relative shrink-0" title="Search by node id (e.g. REQ-001), label (e.g. Concept Brief), or text in description. Same nodes the agent sees in context.">
                            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input value={mapSearchQuery} onChange={(e) => setMapSearchQuery(e.target.value)} placeholder="Search by id, label, or description…" className="bg-muted border border-border rounded-md py-1 pl-8 pr-3 text-xs focus:outline-none focus:border-primary/50 transition-all w-48 text-foreground" aria-label="Search knowledge graph nodes by id, label, or description" />
                        </div>
                        {/* Badges */}
                        {data?.metadata?.active_trigger && (
                            <div className="flex items-center gap-2 px-2 py-0.5 bg-yellow-500/10 border border-yellow-500/20 rounded-full shrink-0">
                                <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                                <span className="text-[10px] font-bold text-yellow-500 uppercase tracking-wider">Trigger: {data.metadata.active_trigger}</span>
                            </div>
                        )}
                        {activeVersion && (
                            <div className="flex items-center gap-2 px-2 py-0.5 bg-purple-500/10 border border-purple-500/20 rounded-full shrink-0">
                                <span className="text-[10px] font-bold text-purple-500 uppercase tracking-wider">Historical: {activeVersion}</span>
                                <UIButton variant="ghost" size="icon" className="h-4 w-4 hover:bg-purple-500/20 rounded-full" onClick={() => fetchData()}>
                                    <RefreshCw className="h-2.5 w-2.5 text-purple-500" />
                                </UIButton>
                            </div>
                        )}
                        <div className="h-4 w-px bg-border shrink-0" />
                        {/* Refresh + KG v15 + Compare + Zoom */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <UIButton variant="ghost" size="sm" className="h-7 gap-1.5 text-muted-foreground hover:text-foreground shrink-0" onClick={() => fetchData()}>
                                <RefreshCw className={loading ? "h-3 w-3 animate-spin" : "h-3 w-3"} />
                                <span className="text-[10px]">Refresh</span>
                            </UIButton>
                            {!embeddedInDecisions && kgHistory && (
                                <>
                                    <UIButton variant="ghost" size="sm" className={cn("h-7 gap-1.5 border rounded-md transition-colors shrink-0", showHistory ? "bg-blue-500/20 border-blue-500/40" : "bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20")} onClick={() => setShowHistory(!showHistory)}>
                                        <span className="text-[10px] font-bold text-blue-500 tracking-wider">KG v{kgHistory.total}</span>
                                    </UIButton>
                                    <UIButton variant="ghost" size="sm" className={cn("h-7 gap-1.5 border rounded-md transition-colors shrink-0", compareMode ? "bg-purple-500/20 border-purple-500/40" : "bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20")} onClick={() => { setCompareMode(!compareMode); if (!compareMode) setShowHistory(true); else { setCompareVersion1(null); setCompareVersion2(null); setDiffData(null); } }}>
                                        <GitCompare className="h-3 w-3 text-purple-500" />
                                        <span className="text-[10px] font-bold text-purple-500 tracking-wider">Compare</span>
                                    </UIButton>
                                </>
                            )}
                            <div className="flex items-center gap-1 shrink-0">
                                <UIButton variant="outline" size="icon" className="w-8 h-8 border-border text-muted-foreground hover:text-foreground rounded-md" title="Zoom in"><ZoomIn className="h-3.5 w-3.5" /></UIButton>
                                <UIButton variant="outline" size="icon" className="w-8 h-8 border-border text-muted-foreground hover:text-foreground rounded-md" title="Zoom out"><ZoomOut className="h-3.5 w-3.5" /></UIButton>
                                <UIButton variant="outline" size="icon" className="w-8 h-8 border-border text-muted-foreground hover:text-foreground rounded-md" title="Fit to view"><Maximize className="h-3.5 w-3.5" /></UIButton>
                            </div>
                        </div>
                        <button type="button" onClick={() => setBottomPanelCollapsed(true)} className="ml-auto shrink-0 p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" title="Collapse map controls">
                            <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                    </div>
                )}
            </div>
            )}
        </div>
    );
}

