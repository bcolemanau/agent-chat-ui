"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { useRouteScope } from "@/hooks/use-route-scope";
import { useUnifiedPreviews, UnifiedPreviewItem } from "./hooks/use-unified-previews";
import { usePendingDecisions } from "./hooks/use-pending-decisions";
import { useProcessedDecisions, ProcessedDecision, type OrgPhaseLineage } from "./hooks/use-processed-decisions";
import { useDecisionTypesConfig } from "./hooks/use-decision-types-config";
import { useThreadUpdates } from "./hooks/use-thread-updates";
import { ApprovalCard } from "./approval-card";
import { KgDiffDiagramView } from "./kg-diff-diagram-view";
import { DecisionSummaryView } from "./decision-summary-view";
import { FullProposalContent } from "./full-proposal-modal";
import { WorldMapView } from "./world-map-view";
import { ErrorBoundary } from "@/components/error-boundary";
import { useStreamContext } from "@/providers/Stream";
import type { DecisionSummary } from "@/lib/diff-types";
import { inferPhaseFromType, isPhaseChangeDecisionType } from "@/lib/decision-types";
import { AlertCircle, PanelRight, ArrowLeft, GitCompare, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-fetch";

const VIEW_STORAGE_KEY = "reflexion_decisions_view";
type ViewMode = "split" | "map";

function getStoredView(): ViewMode {
  if (typeof window === "undefined") return "split";
  const v = localStorage.getItem(VIEW_STORAGE_KEY);
  if (v === "split" || v === "map") return v;
  return "split";
}

function setStoredView(mode: ViewMode) {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, mode);
  } catch {
    // Ignore quota/security errors when persisting view preference
  }
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    organization_onboarding: "Organization Onboarding",
    propose_project: "Project Proposal",
    classify_intent: "Project Classification",  // legacy; kept for backward compat
    project_from_upload: "Project from Document",
    generate_project_configuration_summary: "Project Configuration",
    propose_hydration_complete: "Hydration Complete",
    hydration_complete_trim: "Hydration Complete",
    hydration_complete_prune: "Hydration Complete",
    generate_concept_brief: "Concept Brief",
    generate_ux_brief: "UX Brief",
    generate_requirements_proposal: "Requirements",
    generate_architecture_proposal: "Architecture",
    generate_design_proposal: "Design",
    generate_manufacturing_ops_proposal: "Manufacturing Ops (Hardware)",
    generate_software_ops_proposal: "Software Ops (Digital)",
    approve_enrichment: "Enrichment",
    enrichment: "Enrichment",
    link_uploaded_document: "Link Artifact",
    artifact_apply: "Link + Enrich",
  };
  return labels[type] || type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function relativeTime(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return "Just now";
  if (d < 3600_000) return `${Math.floor(d / 60_000)} min ago`;
  if (d < 86400_000) return `${Math.floor(d / 3600_000)} hr ago`;
  return `${Math.floor(d / 86400_000)} d ago`;
}

type Phase = "Organization" | "Project";

type DecisionRow = {
  id: string;
  type: string;
  title: string;
  status: "pending" | "approved" | "rejected";
  time: number;
  phase: Phase;
  item?: UnifiedPreviewItem;
  kg_version_sha?: string;
  /** Proposal KG commit SHA (Phase 2); use for diff when pending/rejected */
  proposed_kg_version_sha?: string;
  args?: Record<string, unknown>;
  /** Phase boundary (thread concluded); show badge */
  is_phase_change?: boolean;
};

function getArtifactDisplayName(row: DecisionRow): string | undefined {
  const args = row.args ?? row.item?.data?.args;
  if (!args) return undefined;
  const filename =
    (args.preview_data as Record<string, unknown> | undefined)?.filename as string | undefined ||
    (args.filename as string | undefined);
  if (filename) return filename;
  if (row.type === "link_uploaded_document") return (args.document_id as string) || undefined;
  if (row.type === "artifact_apply") return (args.artifact_id as string) || undefined;
  return undefined;
}

/** Read-only detail for phase decisions from fork lineage (e.g. org onboarding). */
function PhaseRowDetail({ row }: { row: DecisionRow }) {
  const phase = (row.phase ?? inferPhaseFromType(row.type)) as string;
  const phaseLabel = phase === "Organization" ? "Organization phase (from fork)" : `${phase} phase (from fork)`;
  const description =
    phase === "Organization"
      ? "This decision was made during organization onboarding and is included with the project fork."
      : `This decision was made during the ${phase.toLowerCase()} phase and is included with the fork.`;

  return (
    <div className="rounded-lg border bg-muted/20 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 text-sm">
        <div className="flex items-center gap-3 min-w-0">
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium shrink-0">
            {getTypeLabel(row.type)}
          </span>
          <span className="truncate" title={row.title}>
            {row.title}
          </span>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{phaseLabel}</span>
      </div>
      <p className="px-4 pb-4 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

/** Minimal header when project was forked from org — decisions are now in the unified table. */
function OrgForkBadge({ orgPhase }: { orgPhase: OrgPhaseLineage }) {
  const version = orgPhase.organization_kg_version;
  if (!version) return null;
  return (
    <div className="mt-2 text-xs text-muted-foreground">
      Forked from Org KG • {version.length > 12 ? version.slice(0, 8) + "…" : version}
    </div>
  );
}

function getDecisionDisplayTitle(row: DecisionRow): string {
  const args = row.args ?? row.item?.data?.args;
  const artifactName = getArtifactDisplayName(row);
  const isEnrichment =
    row.type === "enrichment" || row.type === "approve_enrichment" || row.type === "propose_enrichment";
  const isLink = row.type === "link_uploaded_document";
  const isArtifactApply = row.type === "artifact_apply";

  if (isEnrichment && artifactName) {
    const cycleId = (args as Record<string, unknown> | undefined)?.cycle_id as string | undefined;
    const cycleSuffix =
      cycleId && typeof cycleId === "string"
        ? ` (${cycleId.length > 12 ? "…" + cycleId.slice(-8) : cycleId})`
        : "";
    return `Enrichment${cycleSuffix}: ${artifactName}`;
  }
  if (isLink && artifactName) return `Link: ${artifactName}`;
  if (isArtifactApply && artifactName) return `Link + Enrich: ${artifactName}`;
  if (artifactName && (isEnrichment || isLink || isArtifactApply)) return artifactName;
  return row.title;
}

export function DecisionsPanel() {
  const stream = useStreamContext();
  const router = useRouter();
  const { orgId, projectId, orgName, projectName } = useRouteScope();
  const orgSlug = orgName ?? orgId ?? "";
  const projectSlug = projectName ?? projectId ?? "";
  const [versionParam, setVersionParam] = useQueryState("version"); // In map layout: selected decision's KG version → map shows that version + diff
  // Scope from URL only; no thread-as-scope fallback
  const scopeProjectId = projectId ?? undefined;
  const scopeOrgId = orgId ?? undefined;

  useEffect(() => {
    console.info("[DecisionsPanel] scope", {
      scopeProjectId: scopeProjectId ?? "(none)",
      scopeOrgId: scopeOrgId ?? "(none)",
      fromRoute: { orgId, projectId },
    });
  }, [scopeProjectId, scopeOrgId, orgId, projectId]);

  const mapCompareHref = scopeProjectId && scopeOrgId
    ? `/org/${encodeURIComponent(orgSlug)}/${encodeURIComponent(scopeOrgId)}/project/${encodeURIComponent(projectSlug)}/${encodeURIComponent(scopeProjectId)}/map?compare=1`
    : "/map?compare=1";

  const allPreviews = useUnifiedPreviews();
  const { pending: pendingFromApi, isLoading: pendingApiLoading, refetch: refetchPending } = usePendingDecisions(scopeProjectId, scopeOrgId);
  const { processed, orgPhase, addProcessed, isLoading, refetch: refetchProcessed } = useProcessedDecisions(scopeProjectId, scopeOrgId);
  const { inferPhase } = useDecisionTypesConfig();
  const threadIdForUpdates = (stream as any)?.threadId ?? undefined;
  useThreadUpdates(threadIdForUpdates, {
    onDecisionsUpdate: () => {
      refetchPending();
      refetchProcessed();
    },
  });

  // When thread/upload triggers a workbench refresh, refetch persisted pending so we see new decisions from GET /decisions
  const workbenchRefreshKey = (stream as any)?.workbenchRefreshKey ?? 0;
  useEffect(() => {
    if (scopeProjectId && workbenchRefreshKey > 0) refetchPending();
  }, [scopeProjectId, workbenchRefreshKey, refetchPending]);

  const processedIds = useMemo(() => new Set(processed.map((p) => p.id)), [processed]);
  // Logical keys for link/enrich/artifact_apply so one upload = one combined decision (dedupe API vs stream)
  const linkEnrichKeys = (item: UnifiedPreviewItem): string[] => {
    const args = item.data?.args;
    if (!args) return [];
    const artifactId = (args.artifact_id as string) ?? (args.document_id as string);
    if (!artifactId) return [];
    if (item.type === "link_uploaded_document") return [`link:${artifactId}`];
    if (item.type === "enrichment" || item.type === "approve_enrichment") {
      const cycleId = args.cycle_id as string | undefined;
      return [`enrich:${artifactId}:${cycleId ?? ""}`];
    }
    if (item.type === "artifact_apply") {
      const cycleId = args.cycle_id as string | undefined;
      return [`link:${artifactId}`, `enrich:${artifactId}:${cycleId ?? ""}`];
    }
    return [];
  };
  // Merge persisted pending (GET /decisions) with stream-based pending; dedupe by id and by link/enrich key
  const pending = useMemo(() => {
    const byId = new Map<string, UnifiedPreviewItem>();
    const linkEnrichKeySet = new Set<string>();
    pendingFromApi.forEach((p) => {
      byId.set(p.id, p);
      linkEnrichKeys(p).forEach((k) => linkEnrichKeySet.add(k));
    });
    allPreviews.forEach((p) => {
      if (byId.has(p.id)) return;
      const keys = linkEnrichKeys(p);
      if (keys.length > 0 && keys.some((k) => linkEnrichKeySet.has(k)))
        return; // already have a pending link/enrich/artifact_apply for this artifact (and cycle)
      byId.set(p.id, p);
      keys.forEach((k) => linkEnrichKeySet.add(k));
    });
    return Array.from(byId.values()).filter((p) => !processedIds.has(p.id));
  }, [pendingFromApi, allPreviews, processedIds]);

  const [viewMode, setViewModeState] = useState<ViewMode>("split");
  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    setStoredView(mode);
  }, []);

  React.useEffect(() => {
    setViewModeState(getStoredView());
  }, []);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [proposalViewActive, setProposalViewActive] = useState(false);

  const onDecisionProcessed = useCallback(
    (
      item: UnifiedPreviewItem,
      status: "approved" | "rejected",
      extra?: { kg_version_sha?: string; artifact_id?: string; outcome_description?: string }
    ) => {
      const phase = (item.phase ?? inferPhase(item.type)) as Phase;
      addProcessed({
        id: item.id,
        type: item.type,
        title: item.title,
        status,
        timestamp: Date.now(),
        phase,
        ...(extra?.kg_version_sha != null ? { kg_version_sha: extra.kg_version_sha } : {}),
        ...(extra?.outcome_description != null ? { outcome_description: extra.outcome_description } : {}),
        ...(item.data?.preview_data != null ? { preview_data: item.data.preview_data as Record<string, unknown> } : {}),
        ...(item.data?.args != null ? { args: item.data.args as Record<string, unknown> } : {}),
      });
      refetchPending();
    },
    [addProcessed, refetchPending, inferPhase]
  );

  const allRows = useMemo((): DecisionRow[] => {
    const orgDecisions = orgPhase?.decisions ?? [];
    const orgRows: DecisionRow[] = orgDecisions.map((d) => ({
      id: d.id,
      type: d.type,
      title: d.title,
      status: (d.status === "approved" ? "approved" : "rejected") as "approved" | "rejected",
      time: 0,
      phase: "Organization" as Phase,
      is_phase_change: isPhaseChangeDecisionType(d.type),
    }));
    const pendingRows: DecisionRow[] = pending.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      status: "pending" as const,
      time: Date.now(),
      phase: (item.phase ?? inferPhase(item.type)) as Phase,
      item,
      args: item.data?.args as Record<string, unknown> | undefined,
      proposed_kg_version_sha: (item.data as { proposed_kg_version_sha?: string } | undefined)?.proposed_kg_version_sha,
      is_phase_change: isPhaseChangeDecisionType(item.type),
    }));
    const processedRows: DecisionRow[] = processed.map((p) => ({
      id: p.id,
      type: p.type,
      title: p.title,
      status: p.status,
      time: p.timestamp,
      phase: (p.phase as Phase) ?? (inferPhase(p.type) as Phase),
      kg_version_sha: p.kg_version_sha,
      proposed_kg_version_sha: (p as { proposed_kg_version_sha?: string }).proposed_kg_version_sha,
      args: p.args,
      is_phase_change: p.is_phase_change ?? isPhaseChangeDecisionType(p.type),
    }));
    return [...orgRows, ...pendingRows, ...processedRows];
  }, [orgPhase?.decisions, pending, processed, inferPhase]);

  // In map layout, sync selected row from URL version (e.g. opened via "Compare on map" from a decision)
  const prevVersionParam = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (viewMode !== "map" || !versionParam) return;
    if (prevVersionParam.current === versionParam) return;
    prevVersionParam.current = versionParam;
    const row = allRows.find(
    (r) => (r.kg_version_sha ?? r.proposed_kg_version_sha) === versionParam
  );
    if (row) setSelectedId(row.id);
  }, [viewMode, versionParam, allRows]);

  const selectedRow = useMemo(() => allRows.find((r) => r.id === selectedId) ?? null, [allRows, selectedId]);
  const selectedItem = useMemo(() => pending.find((p) => p.id === selectedId) ?? null, [pending, selectedId]);
  const selectedProcessed = useMemo(
    () => processed.find((p) => p.id === selectedId) ?? null,
    [processed, selectedId]
  );

  const orgDecCount = orgPhase?.decisions?.length ?? 0;
  const hasAny = orgDecCount > 0 || pending.length > 0 || processed.length > 0;
  const emptyMessage = !isLoading && !pendingApiLoading && !hasAny;

  return (
    <div className="flex flex-col h-full min-h-0 p-6">
      <div className="mb-4 shrink-0 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Decisions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and approve pending actions; view processed decisions below.
          </p>
          {orgPhase && (
            <OrgForkBadge orgPhase={orgPhase} />
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(mapCompareHref)}
            title="Open map with Compare versions preselected"
            className="gap-1.5"
          >
            <GitCompare className="h-4 w-4" />
            Compare on map
          </Button>
          <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1">
            <Button
              variant={viewMode === "split" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("split")}
              title="Split (table + detail)"
            >
              <PanelRight className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "map" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("map")}
              title="Map (decisions + world map)"
            >
              <Globe className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {isLoading || pendingApiLoading ? (
        <div className="flex flex-1 items-center justify-center min-h-[200px]">
          <div className="text-center max-w-md text-muted-foreground text-sm">
            Loading decisions…
          </div>
        </div>
      ) : emptyMessage ? (
        <div className="flex flex-1 items-center justify-center min-h-[200px]">
          <div className="text-center max-w-md">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Decisions</h3>
            <p className="text-sm text-muted-foreground">
              Pending decisions will appear here when agents have proposals. Processed decisions will show in the table once you approve or reject.
            </p>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "flex min-h-0 flex-1 gap-4",
            (viewMode === "split" || viewMode === "map") && "flex-row"
          )}
        >
          {/* Table (split and map: left column) */}
          {(viewMode === "split" || viewMode === "map") && (
            <div
              className={cn(
                "min-h-0 flex flex-col border rounded-lg bg-card overflow-hidden",
                "w-1/2 min-w-[320px] shrink-0"
              )}
            >
              <div className="overflow-auto flex-1 min-h-0">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur border-b">
                    <tr>
                      <th className="text-left py-2 px-3 font-medium w-24">Phase</th>
                      <th className="text-left py-2 px-3 font-medium">Type</th>
                      <th className="text-left py-2 px-3 font-medium">Title</th>
                      <th className="text-left py-2 px-3 font-medium">Subject</th>
                      <th className="text-left py-2 px-3 font-medium w-24">Status</th>
                      <th className="text-left py-2 px-3 font-medium w-24">Time</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {allRows.map((row) => (
                      <tr
                        key={row.id}
                        className={cn(
                          "border-b border-border/50 hover:bg-muted/30 cursor-pointer",
                          (selectedId === row.id) && "bg-muted/50"
                        )}
                        onClick={() => {
                          const isDeselecting = selectedId === row.id;
                          setSelectedId((id) => (id === row.id ? null : row.id));
                          setProposalViewActive(false);
                          if (viewMode === "map") {
                            if (isDeselecting) setVersionParam(null);
                            else {
                              const sha = row.kg_version_sha ?? row.proposed_kg_version_sha;
                              setVersionParam(sha ?? null);
                            }
                          }
                        }}
                      >
                        <td className="py-2 px-3">
                          <span
                            className={cn(
                              "text-xs font-medium",
                              row.phase === "Organization" && "text-muted-foreground",
                              row.phase === "Project" && "text-foreground"
                            )}
                          >
                            {row.phase}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium">
                              {getTypeLabel(row.type)}
                            </span>
                            {row.is_phase_change && (
                              <span className="rounded border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-400" title="Thread boundary: phase concluded, new thread started">
                                Phase boundary
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3 truncate max-w-[200px]" title={getDecisionDisplayTitle(row)}>
                          {getDecisionDisplayTitle(row)}
                        </td>
                        <td className="py-2 px-3 truncate max-w-[180px] text-muted-foreground text-sm" title={getArtifactDisplayName(row) ?? ""}>
                          {getArtifactDisplayName(row) ?? "—"}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={cn(
                              "text-xs font-medium",
                              row.status === "pending" && "text-amber-600 dark:text-amber-400",
                              row.status === "approved" && "text-green-600 dark:text-green-400",
                              row.status === "rejected" && "text-muted-foreground"
                            )}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-muted-foreground text-xs">
                          {row.time > 0 ? relativeTime(row.time) : "—"}
                        </td>
                        <td className="py-2 px-1">
                          {selectedId === row.id && (
                            <span className="text-muted-foreground text-xs">▼</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Map layout: decision table on the left is the timeline; map on the right shows selected version + diff */}
          {viewMode === "map" && (
            <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden border rounded-lg bg-card">
              <ErrorBoundary
                name="WorldMapView"
                fallback={
                  <div className="flex flex-1 items-center justify-center rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-6">
                    <p className="text-sm text-amber-800 dark:text-amber-200">Map failed to load. Reload the page to try again.</p>
                  </div>
                }
              >
                <WorldMapView key={scopeProjectId ?? "no-project"} embeddedInDecisions />
              </ErrorBoundary>
            </div>
          )}

          {/* Split detail pane */}
          {viewMode === "split" && (
            <div className="min-h-0 flex flex-col overflow-hidden w-1/2 min-w-[320px] flex-1">
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden border rounded-lg bg-card">
                  {selectedRow && !selectedItem && !selectedProcessed ? (
                    <div className="flex-1 min-h-0 overflow-y-auto p-4">
                      <PhaseRowDetail row={selectedRow} />
                    </div>
                  ) : proposalViewActive && selectedItem ? (
                    <>
                      <div className="shrink-0 flex items-center gap-2 border-b px-4 py-2 bg-muted/30">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => setProposalViewActive(false)}
                        >
                          <ArrowLeft className="h-3.5 w-3.5" />
                          Back to decision
                        </Button>
                        <span className="text-sm font-medium truncate">{selectedItem.title}</span>
                      </div>
                      <div className="flex-1 min-h-0 p-4 overflow-hidden">
                        <FullProposalContent
                          title={selectedItem.title}
                          proposalType={selectedItem.type}
                          previewData={selectedItem.data?.preview_data as Record<string, unknown> | undefined}
                        />
                      </div>
                    </>
                  ) : selectedItem ? (
                    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
                      <ApprovalCard
                        item={selectedItem}
                        stream={stream}
                        scopeProjectId={scopeProjectId}
                        scopeOrgId={scopeOrgId}
                        onDecisionProcessed={onDecisionProcessed}
                        onViewFullProposal={() => setProposalViewActive(true)}
                      />
                      {(() => {
                        const sha = (selectedItem.data as { proposed_kg_version_sha?: string } | undefined)?.proposed_kg_version_sha;
                        if (!sha || !scopeProjectId) return null;
                        return <DecisionKgDiffView projectId={scopeProjectId} kgVersionSha={sha} />;
                      })()}
                    </div>
                  ) : selectedProcessed ? (
                    <div className="flex-1 min-h-0 overflow-y-auto p-4">
                      <ProcessedRow
                        decision={selectedProcessed}
                        projectId={scopeProjectId}
                        orgId={scopeOrgId}
                        displayTitle={getDecisionDisplayTitle({
                          ...selectedProcessed,
                          time: selectedProcessed.timestamp,
                          args: selectedProcessed.args,
                          phase: (selectedProcessed.phase as Phase) ?? (inferPhase(selectedProcessed.type) as Phase),
                        })}
                      />
                    </div>
                  ) : (
                    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                      Select a row to see details
                    </div>
                  )}
                </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Fetches and shows KG diff for a decision (kg_version_sha or proposed_kg_version_sha). Scope from URL only: projectId. */
function DecisionKgDiffView({
  projectId,
  kgVersionSha,
  label,
}: {
  projectId: string | undefined;
  kgVersionSha: string;
  label?: string;
}) {
  const [payload, setPayload] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !kgVersionSha) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const historyRes = await apiFetch(`/api/project/history?project_id=${encodeURIComponent(projectId)}`);
        if (!historyRes.ok || cancelled) return;
        const historyData = await historyRes.json();
        const versions = Array.isArray(historyData?.versions) ? historyData.versions : [];
        const idx = versions.findIndex((v: { id?: string }) => v.id === kgVersionSha);
        const versionBeforeEntry = idx >= 0 && idx < versions.length - 1 ? versions[idx + 1] : undefined;
        const versionBefore = versionBeforeEntry?.id;
        const v1Source = (versionBeforeEntry as { source?: string })?.source;
        const v2Source = (versions[idx] as { source?: string })?.source;
        if (versionBefore == null) {
          setPayload(null);
          setLoading(false);
          return;
        }
        const params = new URLSearchParams({
          project_id: projectId,
          version1: versionBefore,
          version2: kgVersionSha,
        });
        if (v1Source === "organization") params.set("version1_source", "organization");
        if (v2Source === "organization") params.set("version2_source", "organization");
        const diffRes = await apiFetch(`/api/project/diff?${params.toString()}`);
        if (!diffRes.ok) {
          if (!cancelled && diffRes.status === 404) {
            setError("Version not found (may be from a different branch or project)");
          }
          setLoading(false);
          return;
        }
        if (cancelled) return;
        const diffData = await diffRes.json();
        if (diffData?.diff?.type === "kg_diff") setPayload(diffData.diff);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load KG diff");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, kgVersionSha]);

  if (error) return <div className="text-xs text-muted-foreground mt-2">KG diff: {error}</div>;
  if (loading) return <KgDiffDiagramView payload={null} isLoading />;
  if (!payload) return null;
  return (
    <div className="mt-4 border rounded-lg p-4 bg-muted/30">
      <div className="text-[10px] font-bold text-muted-foreground uppercase mb-2">
        {label ?? "KG diff (this decision)"}
      </div>
      <KgDiffDiagramView payload={payload} isLoading={false} />
    </div>
  );
}

function ProcessedRow({
  decision,
  projectId,
  orgId,
  displayTitle,
}: {
  decision: ProcessedDecision & { proposed_kg_version_sha?: string };
  projectId: string | undefined;
  orgId: string | undefined;
  displayTitle?: string;
}) {
  const router = useRouter();
  const title = displayTitle ?? decision.title;
  const versionSha = decision.kg_version_sha ?? decision.proposed_kg_version_sha;

  const openCompareOnMap = useCallback(() => {
    if (!projectId || !orgId || !versionSha) return;
    const params = new URLSearchParams({ version: versionSha });
    router.push(`/org/${encodeURIComponent(orgId)}/${encodeURIComponent(orgId)}/project/${encodeURIComponent(projectId)}/${encodeURIComponent(projectId)}/map?${params.toString()}`);
  }, [projectId, orgId, versionSha, router]);

  return (
    <div className="rounded-lg border bg-muted/20 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 text-sm">
        <div className="flex items-center gap-3 min-w-0">
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium shrink-0">
            {getTypeLabel(decision.type)}
          </span>
          <span className="truncate" title={title}>
            {title}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={cn(
              "text-xs font-medium",
              decision.status === "approved" && "text-green-600 dark:text-green-400",
              decision.status === "rejected" && "text-muted-foreground"
            )}
          >
            {decision.status}
          </span>
          <span className="text-muted-foreground text-xs">{relativeTime(decision.timestamp)}</span>
        </div>
      </div>
      {decision.outcome_description ? (
        <p className="px-4 pb-2 text-sm text-muted-foreground border-b border-border/50">{decision.outcome_description}</p>
      ) : null}
      {/* Decision context (what was shown when this was processed), for both approved and rejected */}
      {decision.preview_data?.decision_summary != null ? (
        <div className="px-4 pb-4">
          <DecisionSummaryView
            decisionSummary={decision.preview_data.decision_summary as DecisionSummary}
            className="mt-3"
          />
        </div>
      ) : null}
      {versionSha && projectId && (
        <div className="px-4 pb-4 space-y-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={openCompareOnMap}
              title="Open map timeline with this decision selected and its diff shown"
            >
              <GitCompare className="h-3.5 w-3.5" />
              Compare on map
            </Button>
          </div>
          <DecisionKgDiffView
            projectId={projectId}
            kgVersionSha={versionSha}
            label={decision.proposed_kg_version_sha && !decision.kg_version_sha ? "KG diff (proposed)" : undefined}
          />
        </div>
      )}
    </div>
  );
}
