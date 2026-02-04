"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Check, X, LoaderCircle, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "next-auth/react";
import { getApiKey } from "@/lib/api-key";
import { useQueryState } from "nuqs";
import { useStreamContext } from "@/providers/Stream";
import { KgDiffDiagramView } from "@/components/workbench/kg-diff-diagram-view";

// Available KG Artifact types (from backend)
const ARTIFACT_TYPES = [
  "PRD",
  "SOP",
  "Architecture",
  "Requirements",
  "Design",
  "Test Plan",
  "User Guide",
];

export interface EnrichmentProposal {
  artifact_id: string;
  cycle_id: string;
  enrichment: {
    extracted_category: string;
    extracted_title: string;
    artifact_types: string[];
    /** Base artifact types from upload inference (links to base artifacts in enrichment cycle) */
    base_artifact_types?: string[];
    key_concepts: string[];
    relationships: string[];
    summary: string;
    /** Entity types and instance IDs (e.g. ET-NEED → [NEED-01, NEED-02], ET-REQ → [SYS-REQ-01, ...]) */
    extracted_entities?: Record<string, string[]>;
  };
  status: "pending" | "approved" | "rejected";
  filename?: string;
  preview_data?: {
    diff?: any; // SemanticDiff structure from backend
    /** Traceability: KG coverage validation during enrichment (from backend) */
    coverage_valid?: boolean;
    coverage_results?: Array<{ entity_type_id: string; source_template_id: string; min_instances: number; count: number; satisfied: boolean; description?: string }>;
    coverage_errors?: string[];
    /** Issue #63: downstream templates that may need re-validation */
    impact_forecast?: { message?: string; downstream_template_ids?: string[] };
    /** Issue #63: uncovered CRITs (risks in scope); uncovered_crits_with_labels has id + label for display */
    coverage_analysis?: { message?: string; uncovered_crits?: string[]; uncovered_crits_with_labels?: Array<{ id: string; label: string }> };
  };
}

export function EnrichmentView() {
  const { data: session } = useSession();
  const stream = useStreamContext();
  const [pendingArtifactIds, setPendingArtifactIds] = useQueryState<string[]>("pendingArtifacts", {
    parse: (value) => value ? value.split(",").filter(Boolean) : [],
    serialize: (value) => value && value.length > 0 ? value.join(",") : "",
    defaultValue: []
  });
  
  const [proposals, setProposals] = useState<Map<string, EnrichmentProposal>>(
    new Map()
  );
  const [selectedTypes, setSelectedTypes] = useState<
    Map<string, string[]>
  >(new Map());
  const [_loading, _setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [threadId] = useQueryState("threadId");
  const rawApiUrl = (stream as any)?.apiUrl || "http://localhost:8080";
  
  // Helper function to get the direct backend URL, bypassing Next.js proxy
  // This ensures enrichment requests go directly to the backend, not through the proxy
  function getDirectBackendUrl(apiUrl: string): string {
    // If apiUrl is already an absolute URL and it's a backend URL, use it
    if (apiUrl.startsWith("http://") || apiUrl.startsWith("https://")) {
      if (apiUrl.includes('reflexion-ui') || apiUrl.includes('/api')) {
        // Redirect to backend
        if (apiUrl.includes('railway.app')) {
          return "https://reflexion-staging.up.railway.app";
        }
        return apiUrl.replace('reflexion-ui', 'reflexion').replace(':3000', ':8080').replace('/api', '');
      }
      return apiUrl;
    }
    
    // If apiUrl is relative, construct direct backend URL
    if (apiUrl.startsWith("/") || apiUrl.startsWith("/api")) {
      if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        if (hostname.includes('railway.app') || hostname.includes('reflexion-ui') || hostname.includes('reflexion-staging')) {
          return "https://reflexion-staging.up.railway.app";
        }
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
          return "http://localhost:8080";
        }
        const origin = window.location.origin;
        return origin.replace('reflexion-ui', 'reflexion').replace(':3000', ':8080');
      }
      return process.env.NEXT_PUBLIC_API_URL || "https://reflexion-staging.up.railway.app";
    }
    
    return apiUrl;
  }
  
  const apiUrl = getDirectBackendUrl(rawApiUrl);
  
  // Debug logging
  useEffect(() => {
    if (pendingArtifactIds.length > 0) {
      console.log("[EnrichmentView] Fetching proposals for artifacts:", pendingArtifactIds, "with threadId:", threadId);
    }
  }, [pendingArtifactIds, threadId]);

  // Fetch enrichment proposals for all artifacts
  useEffect(() => {
    if (pendingArtifactIds.length === 0) return;

    const fetchProposals = async () => {
      console.log("[EnrichmentView] ENTER fetchProposals", { pendingArtifactIds, threadId });
      setFetching(true);
      const newProposals = new Map<string, EnrichmentProposal>();
      const newSelectedTypes = new Map<string, string[]>();

      try {
        // Build authentication headers
        const headers: Record<string, string> = {};
        const token = session?.user?.idToken || getApiKey();
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const orgContext =
          typeof window !== "undefined"
            ? localStorage.getItem("reflexion_org_context")
            : null;
        if (orgContext) {
          headers["X-Organization-Context"] = orgContext;
        }

        // Fetch proposals for each artifact
        for (const artifactId of pendingArtifactIds) {
          try {
            // Include thread_id as query parameter so backend can find the artifact
            const url = `${apiUrl}/artifacts/${artifactId}/enrichment${threadId ? `?thread_id=${threadId}` : ''}`;
            const res = await fetch(url, { headers });

            if (res.ok) {
              const data = await res.json();
              if (data.cycle_id && data.enrichment) {
                newProposals.set(artifactId, {
                  artifact_id: artifactId,
                  cycle_id: data.cycle_id,
                  enrichment: data.enrichment,
                  status: "pending",
                  filename: data.filename,
                  preview_data: data.preview_data, // Include diff data if available
                });
                // Pre-select first artifact type if available
                if (data.enrichment.artifact_types?.length > 0) {
                  newSelectedTypes.set(artifactId, [data.enrichment.artifact_types[0]]);
                }
              }
            } else if (res.status === 404) {
              // No enrichment cycle yet - trigger creation
              const createRes = await fetch(`${apiUrl}/artifacts/${artifactId}/enrichment${threadId ? `?thread_id=${threadId}` : ''}`, {
                method: "POST",
                headers: { ...headers, "Content-Type": "application/json" },
                body: JSON.stringify({ trigger: true, thread_id: threadId }),
              });
              if (createRes.ok) {
                const createData = await createRes.json();
                if (createData.cycle_id && createData.enrichment) {
                  newProposals.set(artifactId, {
                    artifact_id: artifactId,
                    cycle_id: createData.cycle_id,
                    enrichment: createData.enrichment,
                    status: "pending",
                    filename: createData.filename,
                    preview_data: createData.preview_data, // Include diff data if available
                  });
                  if (createData.enrichment.artifact_types?.length > 0) {
                    newSelectedTypes.set(artifactId, [createData.enrichment.artifact_types[0]]);
                  }
                }
              }
            }
          } catch (error) {
            console.error(`[Enrichment] Failed to fetch proposal for ${artifactId}:`, error);
          }
        }

        setProposals(newProposals);
        setSelectedTypes(newSelectedTypes);
        console.log("[EnrichmentView] EXIT fetchProposals: SUCCESS", { proposalsCount: newProposals.size });
      } catch (error) {
        console.error("[EnrichmentView] EXIT fetchProposals: ERROR", error);
        toast.error("Failed to load enrichment proposals");
      } finally {
        setFetching(false);
      }
    };

    fetchProposals();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apiUrl derived from rawApiUrl, stable
  }, [pendingArtifactIds, session, rawApiUrl, threadId]);

  const handleTypeToggle = (artifactId: string, type: string) => {
    setSelectedTypes((prev) => {
      const current = prev.get(artifactId) || [];
      const updated = current.includes(type)
        ? current.filter((t) => t !== type)
        : [...current, type];
      const newMap = new Map(prev);
      newMap.set(artifactId, updated);
      return newMap;
    });
  };

  const handleApprove = async (artifactId: string) => {
    const proposal = proposals.get(artifactId);
    if (!proposal) return;

    const selected = selectedTypes.get(artifactId) || [];
    if (selected.length === 0) {
      toast.error("Please select at least one artifact type");
      return;
    }

    setProcessing((prev) => new Set(prev).add(artifactId));
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const token = session?.user?.idToken || getApiKey();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const orgContext =
        typeof window !== "undefined"
          ? localStorage.getItem("reflexion_org_context")
          : null;
      if (orgContext) {
        headers["X-Organization-Context"] = orgContext;
      }

      const url = `${apiUrl}/artifacts/${artifactId}/enrichment/${proposal.cycle_id}/approve`;
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          artifact_types: selected,
          thread_id: threadId,
        }),
      });

      if (res.ok) {
        const result = await res.json().catch(() => ({}));
        const kgDiff = result?.diff?.type === "kg_diff" ? result.diff : undefined;
        setProposals((prev) => {
          const newMap = new Map(prev);
          const updated = {
            ...proposal,
            status: "approved" as const,
            preview_data: {
              ...proposal.preview_data,
              ...(kgDiff ? { diff: kgDiff } : {}),
            },
          };
          newMap.set(artifactId, updated);
          return newMap;
        });
        toast.success(`Enrichment approved for ${proposal.enrichment.extracted_title || artifactId}`);
        
        // Remove from pending list
        setPendingArtifactIds((prev) => prev.filter(id => id !== artifactId));
      } else {
        const error = await res.text();
        throw new Error(error || "Approval failed");
      }
    } catch (error: any) {
      console.error("[Enrichment] Approval failed:", error);
      toast.error(`Failed to approve: ${error.message || "Unknown error"}`);
    } finally {
      setProcessing((prev) => {
        const newSet = new Set(prev);
        newSet.delete(artifactId);
        return newSet;
      });
    }
  };

  const handleReject = async (artifactId: string) => {
    const proposal = proposals.get(artifactId);
    if (!proposal) return;

    setProcessing((prev) => new Set(prev).add(artifactId));
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const token = session?.user?.idToken || getApiKey();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const orgContext =
        typeof window !== "undefined"
          ? localStorage.getItem("reflexion_org_context")
          : null;
      if (orgContext) {
        headers["X-Organization-Context"] = orgContext;
      }

      const url = `${apiUrl}/artifacts/${artifactId}/enrichment/${proposal.cycle_id}/reject`;
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ thread_id: threadId }),
      });

      if (res.ok) {
        setProposals((prev) => {
          const newMap = new Map(prev);
          const updated = { ...proposal, status: "rejected" as const };
          newMap.set(artifactId, updated);
          return newMap;
        });
        toast.success(`Enrichment rejected for ${proposal.enrichment.extracted_title || artifactId}`);
        
        // Remove from pending list
        setPendingArtifactIds((prev) => prev.filter(id => id !== artifactId));
      } else {
        throw new Error("Rejection failed");
      }
    } catch (error: any) {
      console.error("[Enrichment] Rejection failed:", error);
      toast.error(`Failed to reject: ${error.message || "Unknown error"}`);
    } finally {
      setProcessing((prev) => {
        const newSet = new Set(prev);
        newSet.delete(artifactId);
        return newSet;
      });
    }
  };

  const handleSkip = (artifactId: string) => {
    setProposals((prev) => {
      const newMap = new Map(prev);
      newMap.delete(artifactId);
      return newMap;
    });
    setPendingArtifactIds((prev) => prev.filter(id => id !== artifactId));
    toast.info("Enrichment skipped");
  };

  const proposalList = Array.from(proposals.values());

  if (pendingArtifactIds.length === 0 && proposalList.length === 0) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground p-8">
        <FileText className="w-16 h-16 opacity-20 mb-4" />
        <h3 className="text-lg font-semibold mb-2">No Pending Enrichments</h3>
        <p className="text-sm text-center max-w-md">
          Upload documents or artifacts to see enrichment proposals here.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="h-14 border-b flex items-center justify-between px-6 bg-muted/30 shrink-0">
        <div>
          <h2 className="text-lg font-semibold">Review Artifact Enrichments</h2>
          <p className="text-xs text-muted-foreground">
            {proposalList.length} {proposalList.length === 1 ? "artifact" : "artifacts"} pending review
          </p>
        </div>
        {fetching && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="w-4 h-4 animate-spin" />
            <span>Loading proposals...</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {proposalList.map((proposal) => {
            const selected = selectedTypes.get(proposal.artifact_id) || [];
            const isProcessing = processing.has(proposal.artifact_id);
            const isApproved = proposal.status === "approved";
            const isRejected = proposal.status === "rejected";

            return (
              <div
                key={proposal.artifact_id}
                className={cn(
                  "border rounded-lg p-6 bg-card shadow-sm transition-all",
                  isApproved && "border-green-500/50 bg-green-500/5",
                  isRejected && "border-red-500/50 bg-red-500/5"
                )}
              >
                {/* Artifact Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="w-5 h-5 text-muted-foreground" />
                      <h3 className="text-lg font-semibold">
                        {proposal.enrichment.extracted_title || proposal.filename || proposal.artifact_id}
                      </h3>
                      {isApproved && (
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      )}
                      {isRejected && (
                        <X className="w-5 h-5 text-red-500" />
                      )}
                    </div>
                    {proposal.enrichment.extracted_category && (
                      <p className="text-sm text-muted-foreground">
                        Category: {proposal.enrichment.extracted_category}
                      </p>
                    )}
                  </div>
                </div>

                {/* Extracted entity types (nodes) and link types */}
                {proposal.enrichment.extracted_entities && Object.keys(proposal.enrichment.extracted_entities).length > 0 && (
                  <div className="mb-4 p-3 border border-border rounded-lg bg-muted/20 text-sm space-y-2">
                    <p className="font-medium text-foreground">Extracted entity types (nodes)</p>
                    <ul className="list-none space-y-1.5 text-muted-foreground">
                      {Object.entries(proposal.enrichment.extracted_entities).map(([entityTypeId, ids]) => (
                        <li key={entityTypeId}>
                          <span className="font-mono text-foreground">{entityTypeId}</span>
                          {" → "}
                          <span className="font-mono text-xs">{(ids ?? []).join(", ")}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground pt-1 border-t border-border/50 mt-2">
                      Link type: <code className="font-mono">addresses_entity_type</code> (artifact → entity types for traceability)
                    </p>
                  </div>
                )}

                {/* Diff Preview (if available): KG diff (nodes/links added) after approve, or progression diff before */}
                {proposal.preview_data?.diff && (
                  <div className="mb-4 p-4 border rounded-lg bg-muted/30">
                    {proposal.preview_data.diff.type === "kg_diff" ? (
                      <KgDiffDiagramView payload={proposal.preview_data.diff} isLoading={false} />
                    ) : (
                      renderEnrichmentDiff(proposal.preview_data.diff)
                    )}
                  </div>
                )}

                {/* Traceability / Coverage (during enrichment) */}
                {proposal.preview_data && "coverage_valid" in proposal.preview_data && (
                  <div className={cn(
                    "mb-4 p-3 border rounded-lg text-sm",
                    proposal.preview_data.coverage_valid === true
                      ? "border-green-500/50 bg-green-500/10"
                      : "border-amber-500/50 bg-amber-500/10"
                  )}>
                    <span className="font-medium">
                      {proposal.preview_data.coverage_valid === true ? (
                        <><CheckCircle2 className="inline h-4 w-4 mr-1.5 text-green-600" /> Coverage OK</>
                      ) : (
                        <><AlertCircle className="inline h-4 w-4 mr-1.5 text-amber-600" /> Coverage gaps</>
                      )}
                    </span>
                    {proposal.preview_data.coverage_errors?.length ? (
                      <ul className="mt-2 list-disc list-inside text-muted-foreground">
                        {proposal.preview_data.coverage_errors.slice(0, 5).map((err: string, i: number) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                )}

                {/* Issue #63: Impact forecast and coverage analysis (risks in scope) */}
                {(proposal.preview_data?.impact_forecast || proposal.preview_data?.coverage_analysis) && (
                  <div className="mb-4 p-3 border border-border rounded-lg bg-muted/30 text-sm space-y-3">
                    {proposal.preview_data.impact_forecast && (
                      <div>
                        <p className="font-medium text-foreground">Impact forecast</p>
                        <p className="text-muted-foreground text-xs mt-0.5">{proposal.preview_data.impact_forecast.message}</p>
                        {(proposal.preview_data.impact_forecast.downstream_template_ids?.length ?? 0) > 0 ? (
                          <ul className="list-disc list-inside text-xs text-muted-foreground mt-1">
                            {(proposal.preview_data.impact_forecast.downstream_template_ids ?? []).map((id: string) => (
                              <li key={id}>{id}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    )}
                    {proposal.preview_data.coverage_analysis && (
                      <div>
                        <p className="font-medium text-foreground">Coverage (risks in scope)</p>
                        <p className="text-muted-foreground text-xs mt-0.5">{proposal.preview_data.coverage_analysis.message}</p>
                        {(proposal.preview_data.coverage_analysis.uncovered_crits_with_labels?.length ?? proposal.preview_data.coverage_analysis.uncovered_crits?.length ?? 0) > 0 ? (
                          <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                            <span className="font-medium">Uncovered:</span>
                            <ul className="list-disc list-inside mt-0.5 space-y-0.5">
                              {(proposal.preview_data.coverage_analysis.uncovered_crits_with_labels?.length
                                ? proposal.preview_data.coverage_analysis.uncovered_crits_with_labels
                                : (proposal.preview_data.coverage_analysis.uncovered_crits ?? []).map((id: string) => ({ id, label: id }))
                              ).map((item: { id: string; label: string }) => (
                                <li key={item.id}>
                                  {item.label === item.id ? item.id : `${item.id}: ${item.label}`}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}

                {/* Summary */}
                {proposal.enrichment.summary && (
                  <div className="mb-4 p-3 bg-muted/50 rounded-md">
                    <p className="text-sm">{proposal.enrichment.summary}</p>
                  </div>
                )}

                {/* Artifact Type Selection */}
                <div className="mb-4">
                  <Label className="text-sm font-semibold mb-2 block">
                    Artifact Type <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {ARTIFACT_TYPES.map((type) => {
                      const isSelected = selected.includes(type);
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => handleTypeToggle(proposal.artifact_id, type)}
                          disabled={isProcessing || isApproved || isRejected}
                          className={cn(
                            "px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                            isSelected
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "bg-muted text-muted-foreground hover:bg-muted/80",
                            (isProcessing || isApproved || isRejected) && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          {isSelected && <Check className="w-3 h-3 inline mr-1" />}
                          {type}
                        </button>
                      );
                    })}
                  </div>
                  {selected.length === 0 && !isApproved && !isRejected && (
                    <p className="text-xs text-destructive mt-1">
                      Please select at least one artifact type
                    </p>
                  )}
                </div>

                {/* Key Concepts */}
                {proposal.enrichment.key_concepts?.length > 0 && (
                  <div className="mb-4">
                    <Label className="text-sm font-semibold mb-2 block">Key Concepts</Label>
                    <div className="flex flex-wrap gap-2">
                      {proposal.enrichment.key_concepts.map((concept, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 bg-muted rounded-md text-xs"
                        >
                          {concept}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-3 pt-4 border-t">
                  {!isApproved && !isRejected && (
                    <>
                      <Button
                        onClick={() => handleApprove(proposal.artifact_id)}
                        disabled={selected.length === 0 || isProcessing}
                        className="flex-1"
                      >
                        {isProcessing ? (
                          <>
                            <LoaderCircle className="w-4 h-4 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4 mr-2" />
                            Approve
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleReject(proposal.artifact_id)}
                        disabled={isProcessing}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Reject
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => handleSkip(proposal.artifact_id)}
                        disabled={isProcessing}
                      >
                        Skip
                      </Button>
                    </>
                  )}
                  {(isApproved || isRejected) && (
                    <div className="flex-1 text-sm text-muted-foreground">
                      {isApproved && "✓ Enrichment approved and linked to Knowledge Graph"}
                      {isRejected && "✗ Enrichment rejected"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Render enrichment diff view (similar to ApprovalCard)
function renderEnrichmentDiff(diff: any): React.ReactNode {
  if (!diff || diff.type !== "progression") {
    return null;
  }

  const metadata = diff.metadata || {};
  const progression = metadata.progression || {};
  
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold">{metadata.title || "Enrichment Proposal"}</div>
      {metadata.description && (
        <div className="text-xs text-muted-foreground">{metadata.description}</div>
      )}
      <div className="grid grid-cols-2 gap-4 text-xs border-t pt-3">
        <div>
          <div className="font-medium mb-2 text-muted-foreground">{metadata.leftLabel || "Previous State"}</div>
          {diff.left && (
            <div className="space-y-1 text-muted-foreground">
              {diff.left.artifact_types?.length > 0 ? (
                <div>Types: {diff.left.artifact_types.join(", ") || "None"}</div>
              ) : (
                <div className="italic">No previous enrichment</div>
              )}
              {diff.left.category && <div>Category: {diff.left.category}</div>}
              {diff.left.title && <div>Title: {diff.left.title}</div>}
            </div>
          )}
        </div>
        <div>
          <div className="font-medium mb-2">{metadata.rightLabel || "Proposed Enrichment"}</div>
          {diff.right && (
            <div className="space-y-1">
              {(diff.right.base_artifact_types?.length ?? 0) > 0 && (
                <div className="text-muted-foreground text-xs">
                  Links to base artifacts: {diff.right.base_artifact_types.join(", ")}
                </div>
              )}
              {diff.right.artifact_types?.length > 0 && (
                <div className="text-green-600 dark:text-green-400 font-medium">
                  Types: {diff.right.artifact_types.join(", ")}
                </div>
              )}
              {diff.right.category && (
                <div>Category: {diff.right.category}</div>
              )}
              {diff.right.title && (
                <div>Title: {diff.right.title}</div>
              )}
              {diff.right.key_concepts?.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs text-muted-foreground mb-1">Key Concepts:</div>
                  <div className="flex flex-wrap gap-1">
                    {diff.right.key_concepts.slice(0, 5).map((concept: string, idx: number) => (
                      <span key={idx} className="px-1.5 py-0.5 bg-muted rounded text-xs">
                        {concept}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {progression.completionPercentage !== undefined && (
        <div className="text-xs text-muted-foreground pt-2 border-t">
          Completion: {progression.completionPercentage.toFixed(0)}%
        </div>
      )}
    </div>
  );
}
