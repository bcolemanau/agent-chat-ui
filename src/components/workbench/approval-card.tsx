"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Edit, LoaderCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { UnifiedPreviewItem } from "./hooks/use-unified-previews";
import { toast } from "sonner";
import { HydrationDiffView } from "./hydration-diff-view";
import { ConceptBriefDiffView as ConceptBriefDiffViewComponent } from "./concept-brief-diff-view";
import { HydrationDiffView as HydrationDiffViewType, ConceptBriefDiffView } from "@/lib/diff-types";

interface ApprovalCardProps {
  item: UnifiedPreviewItem;
  stream: any;
  /** Called when user approves or rejects; used to persist in Decisions history (e.g. localStorage). */
  onDecisionProcessed?: (item: UnifiedPreviewItem, status: "approved" | "rejected") => void;
}

export function ApprovalCard({ item, stream, onDecisionProcessed }: ApprovalCardProps) {
  const router = useRouter();
  const [threadIdFromUrl] = useQueryState("threadId");
  const [status, setStatus] = useState<"pending" | "processing" | "approved" | "rejected">(item.status);
  const [isLoading, setIsLoading] = useState(false);

  const handleDecision = async (decisionType: "approve" | "reject" | "edit") => {
    setIsLoading(true);
    setStatus("processing");

    // Preview-only tools: apply via API endpoints, not graph resume (no HITL/interrupts)
    if (item.type === "classify_intent") {
      if (decisionType === "reject") {
        setStatus("rejected");
        onDecisionProcessed?.(item, "rejected");
        toast.info("Classification not applied");
        setIsLoading(false);
        return;
      }
      if (decisionType === "approve") {
        try {
          // Prefer item/stream; fallback to URL so we never lose thread context when navigating
          const threadId = item.threadId ?? (stream as any)?.threadId ?? threadIdFromUrl ?? undefined;
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          const orgContext = typeof localStorage !== "undefined" ? localStorage.getItem("reflexion_org_context") : null;
          if (orgContext) headers["X-Organization-Context"] = orgContext;
          const res = await fetch("/api/project/classification/apply", {
            method: "POST",
            headers,
            body: JSON.stringify({
              trigger_id: item.data?.args?.trigger_id,
              thread_id: threadId,
              reasoning: item.data?.args?.reasoning,
              confidence: item.data?.args?.confidence,
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error((err as any).detail || "Failed to apply classification");
          }
          const data = await res.json();
          setStatus("approved");
          onDecisionProcessed?.(item, "approved");
          toast.success("Begin Enriching", {
            description: "Classification applied. You can now work with the Enrichment agent.",
          });
          if (typeof (stream as any).updateState === "function") {
            const values: Record<string, unknown> = {};
            if ((data as any).active_agent) values.active_agent = (data as any).active_agent;
            if ((data as any).active_mode) values.active_mode = (data as any).active_mode;
            if ((data as any).current_trigger_id != null) values.current_trigger_id = (data as any).current_trigger_id;
            if ((data as any).visualization_html) values.visualization_html = (data as any).visualization_html;
            if ((data as any).project_name) values.project_name = (data as any).project_name;
            if (Array.isArray((data as any).messages) && (data as any).messages.length)
              values._appendMessages = (data as any).messages;
            if (Object.keys(values).length) await (stream as any).updateState({ values });
          }
          if ((data as any).graph_run_triggered && typeof (stream as any).refetchThreadState === "function") {
            setTimeout(() => (stream as any).refetchThreadState(), 3500);
          }
          (stream as any).triggerWorkbenchRefresh?.();
          // Land on map with Artifacts tab so user sees project content; /workbench/hydration only shows proposal diff (often empty)
          const href = threadId
            ? `/workbench/map?threadId=${encodeURIComponent(threadId)}&view=artifacts`
            : "/workbench/map?view=artifacts";
          router.push(href);
        } catch (error: any) {
          console.error("[ApprovalCard] Error applying classification:", error);
          setStatus("pending");
          toast.error("Error", { description: error.message || "Failed to apply classification" });
        } finally {
          setIsLoading(false);
        }
        return;
      }
    }

    // propose_hydration_complete is preview-only; apply via API (transition to Concept), not graph resume
    if (item.type === "propose_hydration_complete") {
      if (decisionType === "reject") {
        setStatus("rejected");
        onDecisionProcessed?.(item, "rejected");
        toast.info("Hydration completion not applied");
        setIsLoading(false);
        return;
      }
      if (decisionType === "approve") {
        try {
          const threadId = item.threadId ?? (stream as any)?.threadId ?? threadIdFromUrl ?? undefined;
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          const orgContext = typeof localStorage !== "undefined" ? localStorage.getItem("reflexion_org_context") : null;
          if (orgContext) headers["X-Organization-Context"] = orgContext;
          const res = await fetch("/api/hydration/apply", {
            method: "POST",
            headers,
            body: JSON.stringify({
              trigger_id: item.data?.args?.trigger_id ?? item.data?.preview_data?.trigger_id,
              thread_id: threadId,
              readiness_assessment: item.data?.args?.readiness_assessment ?? item.data?.preview_data?.readiness_assessment,
              confidence: item.data?.args?.confidence ?? item.data?.preview_data?.confidence,
              reasoning: item.data?.args?.reasoning,
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error((err as any).detail || "Failed to apply hydration completion");
          }
          const data = await res.json();
          setStatus("approved");
          onDecisionProcessed?.(item, "approved");
          toast.success("Hydration Complete", {
            description: "Transitioning to Concept phase. The Concept agent will now help generate Concept Briefs.",
          });
          if (typeof (stream as any).updateState === "function") {
            const values: Record<string, unknown> = {};
            if ((data as any).active_agent) values.active_agent = (data as any).active_agent;
            if ((data as any).active_mode) values.active_mode = (data as any).active_mode;
            if ((data as any).current_trigger_id != null) values.current_trigger_id = (data as any).current_trigger_id;
            if ((data as any).visualization_html) values.visualization_html = (data as any).visualization_html;
            if ((data as any).project_name) values.project_name = (data as any).project_name;
            if (Array.isArray((data as any).messages) && (data as any).messages.length)
              values._appendMessages = (data as any).messages;
            if (Object.keys(values).length) await (stream as any).updateState({ values });
          }
          if ((data as any).graph_run_triggered && typeof (stream as any).refetchThreadState === "function") {
            setTimeout(() => (stream as any).refetchThreadState(), 3500);
          }
          (stream as any).triggerWorkbenchRefresh?.();
          // Navigate to map view to see the transition
          const href = threadId
            ? `/workbench/map?threadId=${encodeURIComponent(threadId)}&view=artifacts`
            : "/workbench/map?view=artifacts";
          router.push(href);
        } catch (error: any) {
          console.error("[ApprovalCard] Error applying hydration completion:", error);
          setStatus("pending");
          toast.error("Error", { description: error.message || "Failed to apply hydration completion" });
        } finally {
          setIsLoading(false);
        }
        return;
      }
    }

    // link_uploaded_document is preview-only; apply via API (persist KG changes), not graph resume
    if (item.type === "link_uploaded_document") {
      if (decisionType === "reject") {
        setStatus("rejected");
        onDecisionProcessed?.(item, "rejected");
        toast.info("Artifact link not applied");
        setIsLoading(false);
        return;
      }
      if (decisionType === "approve") {
        try {
          const threadId = item.threadId ?? (stream as any)?.threadId ?? threadIdFromUrl ?? undefined;
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          const orgContext = typeof localStorage !== "undefined" ? localStorage.getItem("reflexion_org_context") : null;
          if (orgContext) headers["X-Organization-Context"] = orgContext;
          const res = await fetch("/api/artifact/link/apply", {
            method: "POST",
            headers,
            body: JSON.stringify({
              artifact_id: item.data?.args?.document_id ?? item.data?.preview_data?.artifact_id,
              artifact_type: item.data?.args?.artifact_type ?? item.data?.preview_data?.artifact_type,
              thread_id: threadId,
              trigger_id: item.data?.args?.trigger_id ?? item.data?.preview_data?.trigger_id,
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error((err as any).detail || "Failed to apply artifact link");
          }
          const data = await res.json();
          setStatus("approved");
          onDecisionProcessed?.(item, "approved");
          toast.success("Artifact Linked", {
            description: `Successfully linked ${data.filename || "artifact"} to ${data.artifact_type || "KG"}`,
          });
          (stream as any).triggerWorkbenchRefresh?.();
        } catch (error: any) {
          console.error("[ApprovalCard] Error applying artifact link:", error);
          setStatus("pending");
          toast.error("Error", { description: error.message || "Failed to apply artifact link" });
        } finally {
          setIsLoading(false);
        }
        return;
      }
    }

    // Enrichment from ToolMessages (upload/folder): apply via API; no LangGraph interrupt
    const isEnrichmentType =
      item.type === "enrichment" || item.type === "propose_enrichment" || item.type === "approve_enrichment";
    if (isEnrichmentType && item.fromMessages) {
      const artifactId =
        item.data?.args?.artifact_id ?? item.data?.preview_data?.artifact_id;
      const cycleId =
        item.data?.args?.cycle_id ?? item.data?.preview_data?.cycle_id;
      const enrichmentData =
        item.data?.args?.enrichment_data ?? item.data?.preview_data?.enrichment_data;
      const artifactTypes =
        enrichmentData?.artifact_types ?? ["Requirements"];

      if (decisionType === "reject") {
        try {
          const threadId = item.threadId ?? (stream as any)?.threadId ?? threadIdFromUrl ?? undefined;
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          const orgContext = typeof localStorage !== "undefined" ? localStorage.getItem("reflexion_org_context") : null;
          if (orgContext) headers["X-Organization-Context"] = orgContext;
          const res = await fetch(
            `/api/artifacts/${encodeURIComponent(artifactId)}/enrichment/${encodeURIComponent(cycleId)}/reject`,
            { method: "POST", headers, body: JSON.stringify({ thread_id: threadId }) }
          );
          if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error((err as any).detail || "Failed to reject enrichment");
          }
          setStatus("rejected");
          onDecisionProcessed?.(item, "rejected");
          toast.info("Enrichment rejected");
        } catch (error: any) {
          console.error("[ApprovalCard] Error rejecting enrichment:", error);
          setStatus("pending");
          toast.error("Error", { description: error.message || "Failed to reject enrichment" });
        } finally {
          setIsLoading(false);
        }
        return;
      }
      if (decisionType === "approve" && artifactId && cycleId) {
        try {
          const threadId = item.threadId ?? (stream as any)?.threadId ?? threadIdFromUrl ?? undefined;
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          const orgContext = typeof localStorage !== "undefined" ? localStorage.getItem("reflexion_org_context") : null;
          if (orgContext) headers["X-Organization-Context"] = orgContext;
          const res = await fetch(
            `/api/artifacts/${encodeURIComponent(artifactId)}/enrichment/${encodeURIComponent(cycleId)}/approve`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({
                artifact_types: Array.isArray(artifactTypes) ? artifactTypes : [artifactTypes],
                thread_id: threadId,
              }),
            }
          );
          if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error((err as any).detail || "Failed to apply enrichment");
          }
          setStatus("approved");
          onDecisionProcessed?.(item, "approved");
          toast.success("Enrichment applied", {
            description: "Metadata and artifact types have been saved.",
          });
          (stream as any).triggerWorkbenchRefresh?.();
        } catch (error: any) {
          console.error("[ApprovalCard] Error applying enrichment:", error);
          setStatus("pending");
          toast.error("Error", { description: error.message || "Failed to apply enrichment" });
        } finally {
          setIsLoading(false);
        }
        return;
      }
      if (decisionType === "approve" && (!artifactId || !cycleId)) {
        toast.error("Error", { description: "Missing artifact_id or cycle_id for this enrichment" });
        setIsLoading(false);
        return;
      }
    }

    // Artifact proposals (concept, UX, requirements, architecture, design): apply via API (preview-only, no interrupt)
    const ARTIFACT_TOOL_TO_TYPE: Record<string, string> = {
      generate_concept_brief: "concept_brief",
      generate_ux_brief: "ux_brief",
      generate_requirements_proposal: "requirements_package",
      generate_architecture_proposal: "architecture",
      generate_design_proposal: "design",
    };
    const artifactType = ARTIFACT_TOOL_TO_TYPE[item.type];
    if (artifactType) {
      if (decisionType === "reject") {
        setStatus("rejected");
        onDecisionProcessed?.(item, "rejected");
        toast.info("Proposal rejected");
        setIsLoading(false);
        return;
      }
      if (decisionType === "approve") {
        const cacheKey = item.data?.args?.cache_key ?? item.data?.preview_data?.cache_key;
        const optionIndex = item.data?.args?.option_index ?? item.data?.args?.selected_option_index ?? -1;
        const threadId = item.threadId ?? (stream as any)?.threadId ?? threadIdFromUrl ?? undefined;
        if (!cacheKey) {
          toast.error("Error", { description: "Missing cache_key for this artifact proposal" });
          setIsLoading(false);
          return;
        }
        try {
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          const orgContext = typeof localStorage !== "undefined" ? localStorage.getItem("reflexion_org_context") : null;
          if (orgContext) headers["X-Organization-Context"] = orgContext;
          const res = await fetch("/api/artifact/apply", {
            method: "POST",
            headers,
            body: JSON.stringify({
              cache_key: cacheKey,
              option_index: typeof optionIndex === "number" ? optionIndex : -1,
              thread_id: threadId,
              artifact_type: artifactType,
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error((err as any).detail || "Failed to apply artifact");
          }
          const data = await res.json();
          setStatus("approved");
          onDecisionProcessed?.(item, "approved");
          toast.success("Artifact applied", {
            description: `Saved ${artifactType.replace(/_/g, " ")}.`,
          });
          if (typeof (stream as any).updateState === "function" && (data as any).active_agent) {
            await (stream as any).updateState({ values: { active_agent: (data as any).active_agent } });
          }
          (stream as any).triggerWorkbenchRefresh?.();
        } catch (error: any) {
          console.error("[ApprovalCard] Error applying artifact:", error);
          setStatus("pending");
          toast.error("Error", { description: error.message || "Failed to apply artifact" });
        } finally {
          setIsLoading(false);
        }
        return;
      }
    }

    // Preview-only: no interrupt path. All proposals are applied via API branches above.
    setStatus("pending");
    toast.info("Apply not available", {
      description: "This proposal type is not configured for apply from the Decisions pane.",
    });
    setIsLoading(false);
  };
  
  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case "classify_intent":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "propose_hydration_complete":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "generate_concept_brief":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "propose_enrichment":
      case "approve_enrichment":
      case "enrichment":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      case "link_uploaded_document":
        return "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };
  
  return (
    <Card className={cn(
      "transition-all",
      status === "approved" && "border-green-500 bg-green-50 dark:bg-green-950",
      status === "rejected" && "border-red-500 bg-red-50 dark:bg-red-950",
      status === "processing" && "border-yellow-500"
    )}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <CardTitle className="text-lg">{item.title}</CardTitle>
              {item.type === "classify_intent" && item.data?.args?.trigger_id != null && (
                <Badge variant="secondary" className="font-mono">
                  Trigger: {String(item.data.args.trigger_id)}
                </Badge>
              )}
              <Badge className={getTypeBadgeColor(item.type)}>
                {item.type.replace(/_/g, " ")}
              </Badge>
            </div>
            <CardDescription>{item.summary}</CardDescription>
          </div>
          {status === "approved" && (
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
          )}
          {status === "rejected" && (
            <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
          )}
          {status === "processing" && (
            <LoaderCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 animate-spin" />
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Diff Preview */}
        {(item.data.diff || item.data.preview_data?.diff) && (
          <div className="border rounded-lg p-4 bg-muted/50 max-h-[600px] overflow-y-auto">
            {renderDiffPreview(item.type, item.data.diff || item.data.preview_data?.diff, item.data.preview_data)}
          </div>
        )}
        
        {/* Action Buttons */}
        {status === "pending" && (
          <div className="flex gap-2">
            <Button
              onClick={() => handleDecision("approve")}
              disabled={isLoading}
              className="flex-1"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {item.type === "classify_intent" ? "Begin Enriching" : "Approve"}
            </Button>
            <Button
              onClick={() => handleDecision("reject")}
              disabled={isLoading}
              variant="destructive"
              className="flex-1"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Reject
            </Button>
            <Button
              onClick={() => handleDecision("edit")}
              disabled={isLoading}
              variant="outline"
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </div>
        )}
        
        {status === "processing" && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Processing...
          </div>
        )}
        
        {status === "approved" && (
          <div className="flex items-center justify-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            Approved
          </div>
        )}
        
        {status === "rejected" && (
          <div className="flex items-center justify-center gap-2 text-sm text-red-600 dark:text-red-400">
            <XCircle className="h-4 w-4" />
            Rejected
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function renderDiffPreview(
  type: string,
  diff: any,
  previewData?: any
): React.ReactNode {
  switch (type) {
    case "propose_hydration_complete":
      // Hydration diff view expects HydrationDiffViewType
      if (diff?.type === "progression" && diff.progress_diff) {
        return (
          <HydrationDiffView
            diffData={diff as HydrationDiffViewType}
            isLoading={false}
          />
        );
      }
      break;
      
    case "generate_concept_brief":
      // Concept brief diff view expects ConceptBriefDiffView
      if (diff?.type === "similarity" && diff.options) {
        return (
          <ConceptBriefDiffViewComponent
            diffData={diff as ConceptBriefDiffView}
            isLoading={false}
          />
        );
      }
      break;
      
    case "classify_intent":
      // Classify intent uses subset diff - render summary
      if (diff?.type === "subset" && diff.metadata) {
        const metadata = diff.metadata;
        return (
          <div className="space-y-2">
            <div className="text-sm font-medium">{metadata.title}</div>
            <div className="text-xs text-muted-foreground">{metadata.description}</div>
            {metadata.subset && (
              <div className="flex gap-4 text-xs">
                <span>Active: {metadata.subset.activeCount} nodes</span>
                <span>Inactive: {metadata.subset.inactiveCount} nodes</span>
                <span>Reduction: {metadata.subset.reductionPercentage.toFixed(1)}%</span>
              </div>
            )}
          </div>
        );
      }
      break;
      
    case "link_uploaded_document":
      // Link artifact uses subset diff - render KG changes
      if (diff?.type === "subset" && diff.metadata) {
        const metadata = diff.metadata;
        const kgChanges = metadata.kg_changes || {};
        return (
          <div className="space-y-3">
            <div className="text-sm font-medium">{metadata.title}</div>
            {metadata.description && (
              <div className="text-xs text-muted-foreground">{metadata.description}</div>
            )}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="font-medium mb-1">{metadata.leftLabel || "Current KG State"}</div>
                {diff.left && (
                  <div className="space-y-1 text-muted-foreground">
                    {diff.left.kg_node_id && (
                      <div>Node: {diff.left.kg_node_id}</div>
                    )}
                    {diff.left.kg_artifact_types?.length > 0 && (
                      <div>Types: {diff.left.kg_artifact_types.join(", ")}</div>
                    )}
                    {!diff.left.kg_node_exists && (
                      <div className="text-xs italic">No KG node</div>
                    )}
                  </div>
                )}
              </div>
              <div>
                <div className="font-medium mb-1">{metadata.rightLabel || "Proposed KG Changes"}</div>
                {diff.right && (
                  <div className="space-y-1">
                    {diff.right.kg_node_id && (
                      <div className="text-green-600 dark:text-green-400">
                        Node: {diff.right.kg_node_id} {kgChanges.node_action === "create" && "(new)"}
                      </div>
                    )}
                    {diff.right.kg_artifact_types?.length > 0 && (
                      <div className="text-green-600 dark:text-green-400">
                        Types: {diff.right.kg_artifact_types.join(", ")}
                      </div>
                    )}
                    {diff.right.trigger_link && (
                      <div className="text-blue-600 dark:text-blue-400">
                        Link: {diff.right.trigger_link}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            {kgChanges.artifact_types_added?.length > 0 && (
              <div className="text-xs text-muted-foreground">
                Adding artifact types: {kgChanges.artifact_types_added.join(", ")}
              </div>
            )}
          </div>
        );
      }
      break;
      
    case "propose_enrichment":
    case "approve_enrichment":
    case "enrichment":
      // Enrichment uses progression diff - similar to hydration
      if (diff?.type === "progression" && diff.metadata) {
        const metadata = diff.metadata;
        const progression = metadata.progression || {};
        return (
          <div className="space-y-3">
            <div className="text-sm font-medium">{metadata.title}</div>
            {metadata.description && (
              <div className="text-xs text-muted-foreground">{metadata.description}</div>
            )}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="font-medium mb-1">{metadata.leftLabel || "Previous"}</div>
                {diff.left && (
                  <div className="space-y-1 text-muted-foreground">
                    {diff.left.artifact_types?.length > 0 && (
                      <div>Types: {diff.left.artifact_types.join(", ")}</div>
                    )}
                    {diff.left.category && <div>Category: {diff.left.category}</div>}
                    {diff.left.title && <div>Title: {diff.left.title}</div>}
                  </div>
                )}
              </div>
              <div>
                <div className="font-medium mb-1">{metadata.rightLabel || "Proposed"}</div>
                {diff.right && (
                  <div className="space-y-1">
                    {diff.right.artifact_types?.length > 0 && (
                      <div className="text-green-600 dark:text-green-400">
                        Types: {diff.right.artifact_types.join(", ")}
                      </div>
                    )}
                    {diff.right.category && (
                      <div>Category: {diff.right.category}</div>
                    )}
                    {diff.right.title && (
                      <div>Title: {diff.right.title}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
            {progression.completionPercentage !== undefined && (
              <div className="text-xs text-muted-foreground">
                Completion: {progression.completionPercentage.toFixed(0)}%
              </div>
            )}
          </div>
        );
      }
      break;
      
    default:
      // Fallback: show diff summary
      return (
        <div className="text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 inline mr-2" />
          Preview not available for {type}
        </div>
      );
  }
  
  return null;
}
