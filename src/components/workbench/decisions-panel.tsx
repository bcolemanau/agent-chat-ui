"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { useUnifiedPreviews, UnifiedPreviewItem } from "./hooks/use-unified-previews";
import { usePendingDecisions } from "./hooks/use-pending-decisions";
import { useProcessedDecisions, ProcessedDecision } from "./hooks/use-processed-decisions";
import { ApprovalCard } from "./approval-card";
import { KgDiffDiagramView } from "./kg-diff-diagram-view";
import { DecisionSummaryView } from "./decision-summary-view";
import { FullProposalContent } from "./full-proposal-modal";
import { WorldMapView } from "./world-map-view";
import { useStreamContext } from "@/providers/Stream";
import type { DecisionSummary } from "@/lib/diff-types";
import { AlertCircle, PanelRight, ArrowLeft, GitCompare, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    classify_intent: "Project Classification",
    generate_project_configuration_summary: "Project Configuration",
    propose_hydration_complete: "Hydration Complete",
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

type DecisionRow = {
  id: string;
  type: string;
  title: string;
  status: "pending" | "approved" | "rejected";
  time: number;
  item?: UnifiedPreviewItem;
  kg_version_sha?: string;
  args?: Record<string, unknown>;
};

function getArtifactDisplayName(row: DecisionRow): string | undefined {
  const args = row.args ?? row.item?.data?.args;
  if (!args) return undefined;
  const filename =
    (args.preview_data as Record<string, unknown> | undefined)?.filename as string | undefined ||
    (args.filename as string | undefined);
  if (filename) return filename;
  if (row.type === "link_uploaded_document") return (args.document_id as string) || undefined;
  return undefined;
}

function getDecisionDisplayTitle(row: DecisionRow): string {
  const args = row.args ?? row.item?.data?.args;
  const artifactName = getArtifactDisplayName(row);
  const isEnrichment =
    row.type === "enrichment" || row.type === "approve_enrichment" || row.type === "propose_enrichment";
  const isLink = row.type === "link_uploaded_document";

  if (isEnrichment && artifactName) {
    const cycleId = (args as Record<string, unknown> | undefined)?.cycle_id as string | undefined;
    const cycleSuffix =
      cycleId && typeof cycleId === "string"
        ? ` (${cycleId.length > 12 ? "…" + cycleId.slice(-8) : cycleId})`
        : "";
    return `Enrichment${cycleSuffix}: ${artifactName}`;
  }
  if (isLink && artifactName) return `Link: ${artifactName}`;
  if (artifactName && (isEnrichment || isLink)) return artifactName;
  return row.title;
}

export function DecisionsPanel() {
  const stream = useStreamContext();
  const router = useRouter();
  const [threadIdFromUrl] = useQueryState("threadId");
  const threadId = (stream as any)?.threadId ?? threadIdFromUrl ?? undefined;
  const [versionParam, setVersionParam] = useQueryState("version"); // In map layout: selected decision's KG version → map shows that version + diff

  const mapCompareHref = threadId
    ? `/workbench/map?threadId=${encodeURIComponent(threadId)}&compare=1`
    : "/workbench/map?compare=1";

  const allPreviews = useUnifiedPreviews();
  const { pending: pendingFromApi, isLoading: pendingApiLoading, refetch: refetchPending } = usePendingDecisions(threadId);
  const { processed, addProcessed, isLoading } = useProcessedDecisions(threadId);

  // When thread/upload triggers a workbench refresh, refetch persisted pending so we see new decisions from GET /decisions
  const workbenchRefreshKey = (stream as any)?.workbenchRefreshKey ?? 0;
  useEffect(() => {
    if (threadId && workbenchRefreshKey > 0) refetchPending();
  }, [threadId, workbenchRefreshKey, refetchPending]);

  const processedIds = useMemo(() => new Set(processed.map((p) => p.id)), [processed]);
  // Merge persisted pending (GET /decisions) with stream-based pending; dedupe by id so we don't rely on refetch timing
  const pending = useMemo(() => {
    const byId = new Map<string, UnifiedPreviewItem>();
    pendingFromApi.forEach((p) => byId.set(p.id, p));
    allPreviews.forEach((p) => {
      if (!byId.has(p.id)) byId.set(p.id, p);
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
      addProcessed({
        id: item.id,
        type: item.type,
        title: item.title,
        status,
        timestamp: Date.now(),
        ...(extra?.kg_version_sha != null ? { kg_version_sha: extra.kg_version_sha } : {}),
        ...(extra?.outcome_description != null ? { outcome_description: extra.outcome_description } : {}),
        ...(item.data?.preview_data != null ? { preview_data: item.data.preview_data as Record<string, unknown> } : {}),
        ...(item.data?.args != null ? { args: item.data.args as Record<string, unknown> } : {}),
      });
      refetchPending();
    },
    [addProcessed, refetchPending]
  );

  const allRows = useMemo((): DecisionRow[] => {
    const pendingRows: DecisionRow[] = pending.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      status: "pending" as const,
      time: Date.now(),
      item,
      args: item.data?.args as Record<string, unknown> | undefined,
    }));
    const processedRows: DecisionRow[] = processed.map((p) => ({
      id: p.id,
      type: p.type,
      title: p.title,
      status: p.status,
      time: p.timestamp,
      kg_version_sha: p.kg_version_sha,
      args: p.args,
    }));
    return [...pendingRows, ...processedRows];
  }, [pending, processed]);

  // In map layout, sync selected row from URL version (e.g. opened via "Compare on map" from a decision)
  const prevVersionParam = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (viewMode !== "map" || !versionParam) return;
    if (prevVersionParam.current === versionParam) return;
    prevVersionParam.current = versionParam;
    const row = allRows.find((r) => "kg_version_sha" in r && (r as { kg_version_sha?: string }).kg_version_sha === versionParam);
    if (row) setSelectedId(row.id);
  }, [viewMode, versionParam, allRows]);

  const selectedItem = useMemo(() => pending.find((p) => p.id === selectedId) ?? null, [pending, selectedId]);
  const selectedProcessed = useMemo(
    () => processed.find((p) => p.id === selectedId) ?? null,
    [processed, selectedId]
  );

  const _hasAny = pending.length > 0 || processed.length > 0;
  const emptyMessage = !isLoading && !pendingApiLoading && pending.length === 0 && processed.length === 0;

  return (
    <div className="flex flex-col h-full min-h-0 p-6">
      <div className="mb-4 shrink-0 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Decisions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and approve pending actions; view processed decisions below.
          </p>
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
                              const sha = "kg_version_sha" in row ? (row as { kg_version_sha?: string }).kg_version_sha : undefined;
                              setVersionParam(sha ?? null);
                            }
                          }
                        }}
                      >
                        <td className="py-2 px-3">
                          <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium">
                            {getTypeLabel(row.type)}
                          </span>
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
                          {relativeTime(row.time)}
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
              <WorldMapView key={threadId ?? "no-thread"} embeddedInDecisions />
            </div>
          )}

          {/* Split detail pane */}
          {viewMode === "split" && (
            <div className="min-h-0 flex flex-col overflow-hidden w-1/2 min-w-[320px] flex-1">
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden border rounded-lg bg-card">
                  {proposalViewActive && selectedItem ? (
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
                    <div className="flex-1 min-h-0 overflow-y-auto p-4">
                      <ApprovalCard
                        item={selectedItem}
                        stream={stream}
                        onDecisionProcessed={onDecisionProcessed}
                        onViewFullProposal={() => setProposalViewActive(true)}
                      />
                    </div>
                  ) : selectedProcessed ? (
                    <div className="flex-1 min-h-0 overflow-y-auto p-4">
                      <ProcessedRow
                        decision={selectedProcessed}
                        threadId={threadId}
                        displayTitle={getDecisionDisplayTitle({
                          ...selectedProcessed,
                          time: selectedProcessed.timestamp,
                          args: selectedProcessed.args,
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

/** Fetches and shows KG diff for a decision that produced a KG version (kg_version_sha). */
function DecisionKgDiffView({
  threadId,
  kgVersionSha,
}: {
  threadId: string | undefined;
  kgVersionSha: string;
}) {
  const [payload, setPayload] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!threadId || !kgVersionSha) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const headers: Record<string, string> = {};
    const orgContext = typeof localStorage !== "undefined" ? localStorage.getItem("reflexion_org_context") : null;
    if (orgContext) headers["X-Organization-Context"] = orgContext;

    (async () => {
      try {
        const historyRes = await fetch(`/api/project/history?thread_id=${encodeURIComponent(threadId)}`, { headers });
        if (!historyRes.ok || cancelled) return;
        const historyData = await historyRes.json();
        const versions = Array.isArray(historyData?.versions) ? historyData.versions : [];
        const idx = versions.findIndex((v: { id?: string }) => v.id === kgVersionSha);
        const versionBefore = idx >= 0 && idx < versions.length - 1 ? versions[idx + 1]?.id : undefined;
        if (versionBefore == null) {
          setPayload(null);
          setLoading(false);
          return;
        }
        const diffRes = await fetch(
          `/api/project/diff?thread_id=${encodeURIComponent(threadId)}&version1=${encodeURIComponent(versionBefore)}&version2=${encodeURIComponent(kgVersionSha)}`,
          { headers }
        );
        if (!diffRes.ok || cancelled) return;
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
  }, [threadId, kgVersionSha]);

  if (error) return <div className="text-xs text-muted-foreground mt-2">KG diff: {error}</div>;
  if (loading) return <KgDiffDiagramView payload={null} isLoading />;
  if (!payload) return null;
  return (
    <div className="mt-4 border rounded-lg p-4 bg-muted/30">
      <div className="text-[10px] font-bold text-muted-foreground uppercase mb-2">KG diff (this decision)</div>
      <KgDiffDiagramView payload={payload} isLoading={false} />
    </div>
  );
}

function ProcessedRow({
  decision,
  threadId,
  displayTitle,
}: {
  decision: ProcessedDecision;
  threadId: string | undefined;
  displayTitle?: string;
}) {
  const router = useRouter();
  const title = displayTitle ?? decision.title;

  const openCompareOnMap = useCallback(() => {
    if (!threadId || !decision.kg_version_sha) return;
    const params = new URLSearchParams({
      threadId,
      version: decision.kg_version_sha,
    });
    router.push(`/workbench/map?${params.toString()}`);
  }, [threadId, decision.kg_version_sha, router]);

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
      {decision.kg_version_sha && threadId && (
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
          <DecisionKgDiffView threadId={threadId} kgVersionSha={decision.kg_version_sha} />
        </div>
      )}
    </div>
  );
}
