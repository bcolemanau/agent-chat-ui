"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryState } from "nuqs";
import { useUnifiedPreviews, UnifiedPreviewItem } from "./hooks/use-unified-previews";
import { usePendingDecisions } from "./hooks/use-pending-decisions";
import { useProcessedDecisions, ProcessedDecision } from "./hooks/use-processed-decisions";
import { ApprovalCard } from "./approval-card";
import { KgDiffDiagramView } from "./kg-diff-diagram-view";
import { FullProposalContent } from "./full-proposal-modal";
import { useStreamContext } from "@/providers/Stream";
import { AlertCircle, LayoutGrid, Table2, Rows3, PanelRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const VIEW_STORAGE_KEY = "reflexion_decisions_view";
type ViewMode = "cards" | "table" | "hybrid" | "split";

function getStoredView(): ViewMode {
  if (typeof window === "undefined") return "cards";
  const v = localStorage.getItem(VIEW_STORAGE_KEY);
  if (v === "table" || v === "hybrid" || v === "split") return v;
  return "cards";
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

export function DecisionsPanel() {
  const stream = useStreamContext();
  const [threadIdFromUrl] = useQueryState("threadId");
  const threadId = (stream as any)?.threadId ?? threadIdFromUrl ?? undefined;

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

  const [viewMode, setViewModeState] = useState<ViewMode>("cards");
  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    setStoredView(mode);
  }, []);

  React.useEffect(() => {
    setViewModeState(getStoredView());
  }, []);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [proposalViewActive, setProposalViewActive] = useState(false);

  const onDecisionProcessed = useCallback(
    (
      item: UnifiedPreviewItem,
      status: "approved" | "rejected",
      extra?: { kg_version_sha?: string }
    ) => {
      addProcessed({
        id: item.id,
        type: item.type,
        title: item.title,
        status,
        timestamp: Date.now(),
        ...(extra?.kg_version_sha != null ? { kg_version_sha: extra.kg_version_sha } : {}),
      });
      refetchPending();
    },
    [addProcessed, refetchPending]
  );

  const allRows = useMemo(() => {
    const pendingRows: { id: string; type: string; title: string; status: "pending"; time: number; item?: UnifiedPreviewItem }[] = pending.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      status: "pending" as const,
      time: Date.now(),
      item,
    }));
    const processedRows: { id: string; type: string; title: string; status: "approved" | "rejected"; time: number }[] = processed.map((p) => ({
      id: p.id,
      type: p.type,
      title: p.title,
      status: p.status,
      time: p.timestamp,
    }));
    return [...pendingRows, ...processedRows];
  }, [pending, processed]);

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
        <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1">
          <Button
            variant={viewMode === "cards" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("cards")}
            title="Cards"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "table" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("table")}
            title="Table"
          >
            <Table2 className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "hybrid" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("hybrid")}
            title="Hybrid (table + expand)"
          >
            <Rows3 className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "split" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("split")}
            title="Split (table + detail)"
          >
            <PanelRight className="h-4 w-4" />
          </Button>
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
            viewMode === "split" && "flex-row"
          )}
        >
          {/* Table (for table / hybrid / split) */}
          {(viewMode === "table" || viewMode === "hybrid" || viewMode === "split") && (
            <div
              className={cn(
                "min-h-0 flex flex-col border rounded-lg bg-card overflow-hidden",
                viewMode === "split" ? "w-1/2 min-w-[320px] shrink-0" : "flex-1"
              )}
            >
              <div className="overflow-auto flex-1 min-h-0">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur border-b">
                    <tr>
                      <th className="text-left py-2 px-3 font-medium">Type</th>
                      <th className="text-left py-2 px-3 font-medium">Title</th>
                      <th className="text-left py-2 px-3 font-medium w-24">Status</th>
                      <th className="text-left py-2 px-3 font-medium w-24">Time</th>
                      {viewMode !== "table" && <th className="w-10" />}
                      <th className="text-right py-2 px-3 font-medium w-28">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allRows.map((row) => (
                      <React.Fragment key={row.id}>
                        <tr
                          className={cn(
                            "border-b border-border/50 hover:bg-muted/30",
                            (viewMode === "hybrid" || viewMode === "split") && "cursor-pointer",
                            (expandedId === row.id || selectedId === row.id) && "bg-muted/50"
                          )}
                          onClick={() => {
                            if (viewMode === "hybrid") setExpandedId((id) => (id === row.id ? null : row.id));
                            if (viewMode === "split") {
                              setSelectedId((id) => (id === row.id ? null : row.id));
                              setProposalViewActive(false);
                            }
                            if (viewMode === "table" && row.status === "pending" && "item" in row) {
                              setSelectedId(row.id);
                              setViewMode("split");
                            }
                          }}
                        >
                          <td className="py-2 px-3">
                            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium">
                              {getTypeLabel(row.type)}
                            </span>
                          </td>
                          <td className="py-2 px-3 truncate max-w-[200px]" title={row.title}>
                            {row.title}
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
                          {(viewMode === "hybrid" || viewMode === "split") && (
                            <td className="py-2 px-1">
                              {(expandedId === row.id || selectedId === row.id) && (
                                <span className="text-muted-foreground text-xs">▼</span>
                              )}
                            </td>
                          )}
                          <td className="py-2 px-3 text-right">
                            {row.status === "pending" && "item" in row && row.item && viewMode === "table" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedId(row.id);
                                  setViewMode("split");
                                }}
                              >
                                Open
                              </Button>
                            )}
                          </td>
                        </tr>
                        {viewMode === "hybrid" && expandedId === row.id && "item" in row && row.item && (
                          <tr className="bg-muted/20">
                            <td colSpan={6} className="p-4">
                              <ApprovalCard
                                item={row.item}
                                stream={stream}
                                onDecisionProcessed={onDecisionProcessed}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Cards area (cards view, or split detail) */}
          {(viewMode === "cards" || viewMode === "split") && (
            <div
              className={cn(
                "min-h-0 flex flex-col overflow-hidden",
                viewMode === "cards" ? "flex-1" : "w-1/2 min-w-[320px] flex-1"
              )}
            >
              {viewMode === "cards" ? (
                <div className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-6">
                  {pending.length > 0 && (
                    <section>
                      <h2 className="text-lg font-medium mb-3">Pending ({pending.length})</h2>
                      <div className="grid gap-4">
                        {pending.map((item) => (
                          <ApprovalCard
                            key={item.id}
                            item={item}
                            stream={stream}
                            onDecisionProcessed={onDecisionProcessed}
                          />
                        ))}
                      </div>
                    </section>
                  )}
                  {processed.length > 0 && (
                    <section>
                      <h2 className="text-lg font-medium mb-3">Processed ({processed.length})</h2>
                      <div className="grid gap-4">
                        {processed.map((p) => (
                          <ProcessedRow key={p.id} decision={p} threadId={threadId} />
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              ) : (
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
                      <ProcessedRow decision={selectedProcessed} threadId={threadId} />
                    </div>
                  ) : (
                    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                      Select a row to see details
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {viewMode === "hybrid" && pending.length > 0 && expandedId === null && (
            <p className="text-sm text-muted-foreground self-center">Expand a pending row to approve or reject.</p>
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

function ProcessedRow({ decision, threadId }: { decision: ProcessedDecision; threadId: string | undefined }) {
  return (
    <div className="rounded-lg border bg-muted/20 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 text-sm">
        <div className="flex items-center gap-3 min-w-0">
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium shrink-0">
            {getTypeLabel(decision.type)}
          </span>
          <span className="truncate">{decision.title}</span>
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
      {decision.kg_version_sha && threadId && (
        <div className="px-4 pb-4">
          <DecisionKgDiffView threadId={threadId} kgVersionSha={decision.kg_version_sha} />
        </div>
      )}
    </div>
  );
}
