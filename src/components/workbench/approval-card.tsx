"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Edit, LoaderCircle, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { UnifiedPreviewItem } from "./hooks/use-unified-previews";
import { toast } from "sonner";
import { contentRendererRegistry } from "./content-renderers";
import { FullProposalModal } from "./full-proposal-modal";
import "./content-renderers/diff-renderer";

interface ApprovalCardProps {
  item: UnifiedPreviewItem;
  stream: any;
  /** Called when user approves or rejects; used to persist in Decisions history (e.g. localStorage). */
  onDecisionProcessed?: (
    item: UnifiedPreviewItem,
    status: "approved" | "rejected",
    extra?: { kg_version_sha?: string }
  ) => void;
  /** When provided, "View full proposal" opens the proposal in the parent's detail pane instead of a modal. */
  onViewFullProposal?: () => void;
}

/** Resolve threadId to project id so decisions GET/POST use id, not name. */
async function resolveThreadIdToProjectId(threadId: string | undefined): Promise<string | undefined> {
  if (typeof window === "undefined" || !threadId?.trim()) return threadId;
  try {
    const orgContext = typeof localStorage !== "undefined" ? localStorage.getItem("reflexion_org_context") : null;
    const headers: Record<string, string> = {};
    if (orgContext) headers["X-Organization-Context"] = orgContext;
    const res = await fetch("/api/projects", { headers });
    if (!res.ok) return threadId;
    const projects = (await res.json()) as { id: string; name: string }[];
    if (!Array.isArray(projects)) return threadId;
    if (projects.some((p) => p.id === threadId)) return threadId;
    const byName = projects.find((p) => p.name === threadId);
    return byName ? byName.id : threadId;
  } catch {
    return threadId;
  }
}

/** Fetch latest KG version (commit sha) for a thread so we can link the decision to the version it produced. */
async function fetchLatestKgVersionSha(threadId: string | undefined): Promise<string | undefined> {
  if (!threadId) return undefined;
  try {
    const orgContext = typeof localStorage !== "undefined" ? localStorage.getItem("reflexion_org_context") : null;
    const headers: Record<string, string> = {};
    if (orgContext) headers["X-Organization-Context"] = orgContext;
    const res = await fetch(`/api/project/history?thread_id=${encodeURIComponent(threadId)}`, { headers });
    if (!res.ok) return undefined;
    const data = await res.json();
    const versions = data?.versions;
    if (Array.isArray(versions) && versions.length > 0 && versions[0]?.id) return versions[0].id;
    return undefined;
  } catch {
    return undefined;
  }
}

/** Persist decision record to backend for lineage / audit (survives refresh, enables revisit and retries). */
async function persistDecision(
  item: UnifiedPreviewItem,
  status: "approved" | "rejected",
  threadId: string | undefined,
  extra: { option_index?: number; artifact_id?: string; kg_version_sha?: string } = {},
  stream?: { values?: { workflow_run_id?: string } }
): Promise<void> {
  try {
    const projectId = await resolveThreadIdToProjectId(threadId) ?? threadId ?? "default";
    const args = item.data?.args ?? {};
    const generation_inputs =
      args.project_context != null || args.trigger_id != null || args.num_options != null
        ? {
            project_context: args.project_context,
            trigger_id: args.trigger_id,
            num_options: args.num_options,
            kg_version: (args as any).kg_version,
          }
        : undefined;
    const workflow_run_id = (stream as any)?.values?.workflow_run_id ?? undefined;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const orgContext = typeof localStorage !== "undefined" ? localStorage.getItem("reflexion_org_context") : null;
    if (orgContext) headers["X-Organization-Context"] = orgContext;
    await fetch("/api/decisions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        thread_id: projectId,
        decision: {
          id: item.id,
          type: item.type,
          title: item.title,
          status,
          cache_key: args.cache_key ?? (item.data as any)?.preview_data?.cache_key ?? undefined,
          generation_inputs,
          option_index: extra.option_index ?? args.option_index ?? args.selected_option_index ?? undefined,
          artifact_id: extra.artifact_id,
          args: { cache_key: args.cache_key, trigger_id: args.trigger_id },
          ...(extra.kg_version_sha != null ? { kg_version_sha: extra.kg_version_sha } : {}),
          ...(workflow_run_id != null && workflow_run_id !== "" ? { workflow_run_id } : {}),
        },
      }),
    });
  } catch (e) {
    console.warn("[ApprovalCard] Failed to persist decision:", e);
  }
}

const ARTIFACT_PROPOSAL_TYPES_WITH_FULL_CONTENT = [
  "generate_requirements_proposal",
  "generate_architecture_proposal",
  "generate_design_proposal",
] as const;

function hasFullProposalContent(item: UnifiedPreviewItem): boolean {
  const pd = item.data?.preview_data as Record<string, unknown> | undefined;
  if (!pd) return false;
  return (
    ARTIFACT_PROPOSAL_TYPES_WITH_FULL_CONTENT.includes(item.type as (typeof ARTIFACT_PROPOSAL_TYPES_WITH_FULL_CONTENT)[number]) &&
    (pd.requirements_data != null || pd.architecture_data != null || pd.design_data != null)
  );
}

export function ApprovalCard({ item, stream, onDecisionProcessed, onViewFullProposal }: ApprovalCardProps) {
  const router = useRouter();
  const [threadIdFromUrl] = useQueryState("threadId");
  const [status, setStatus] = useState<"pending" | "processing" | "approved" | "rejected">(item.status);
  const [isLoading, setIsLoading] = useState(false);
  const [showFullProposal, setShowFullProposal] = useState(false);

  const handleDecision = async (decisionType: "approve" | "reject" | "edit") => {
    setIsLoading(true);
    setStatus("processing");

    if (decisionType === "edit") {
      setShowFullProposal(true);
      setIsLoading(false);
      return;
    }

    const threadId = item.threadId ?? (stream as any)?.threadId ?? threadIdFromUrl ?? undefined;
    const status = decisionType === "approve" ? "approved" : "rejected";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const orgContext = typeof localStorage !== "undefined" ? localStorage.getItem("reflexion_org_context") : null;
    if (orgContext) headers["X-Organization-Context"] = orgContext;

    try {
      const res = await fetch("/api/decisions/apply", {
        method: "POST",
        headers,
        body: JSON.stringify({
          type: item.type,
          status,
          thread_id: threadId,
          decision_id: item.id,
          item: {
            args: item.data?.args,
            preview_data: item.data?.preview_data,
            title: item.title,
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error((err as any).detail || "Failed to apply decision");
      }
      const data = (await res.json()) as {
        status?: string;
        message?: string;
        kg_version_sha?: string;
        active_agent?: string;
        active_mode?: string;
        current_trigger_id?: string;
        visualization_html?: string;
        project_name?: string;
        messages?: unknown[];
        graph_run_triggered?: boolean;
      };
      const resolvedStatus = (data.status === "approved" || data.status === "rejected" ? data.status : status) as "approved" | "rejected";
      setStatus(resolvedStatus);
      onDecisionProcessed?.(item, resolvedStatus, data.kg_version_sha != null ? { kg_version_sha: data.kg_version_sha } : undefined);
      if (resolvedStatus === "approved") {
        toast.success("Approved", { description: data.message ?? "Decision applied." });
      } else {
        toast.info("Rejected", { description: data.message ?? "Proposal not applied." });
      }
      if (typeof (stream as any).updateState === "function" && (data.active_agent ?? data.active_mode)) {
        const values: Record<string, unknown> = {};
        if (data.active_agent) values.active_agent = data.active_agent;
        if (data.active_mode) values.active_mode = data.active_mode;
        if (data.current_trigger_id != null) values.current_trigger_id = data.current_trigger_id;
        if (data.visualization_html) values.visualization_html = data.visualization_html;
        if (data.project_name) values.project_name = data.project_name;
        if (Array.isArray(data.messages) && data.messages.length) values._appendMessages = data.messages;
        if (Object.keys(values).length) await (stream as any).updateState({ values });
      }
      if (data.graph_run_triggered && typeof (stream as any).refetchThreadState === "function") {
        setTimeout(() => (stream as any).refetchThreadState(), 3500);
      }
      (stream as any).triggerWorkbenchRefresh?.();
      if (
        resolvedStatus === "approved" &&
        (item.type === "classify_intent" || item.type === "generate_project_configuration_summary" || item.type === "propose_hydration_complete")
      ) {
        const href = threadId ? `/workbench/map?threadId=${encodeURIComponent(threadId)}&view=artifacts` : "/workbench/map?view=artifacts";
        router.push(href);
      }
    } catch (error: any) {
      console.error("[ApprovalCard] Error applying decision:", error);
      setStatus("pending");
      toast.error("Error", { description: error.message ?? "Failed to apply decision" });
    } finally {
      setIsLoading(false);
    }
  };
  
  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case "classify_intent":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "generate_project_configuration_summary":
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
      case "propose_organization":
      case "propose_user_add":
      case "propose_user_edit":
      case "propose_user_remove":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
      case "generate_manufacturing_ops_proposal":
        return "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200";
      case "generate_software_ops_proposal":
        return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200";
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
        {/* View full proposal — for requirements/architecture/design (concept has "View full draft" per option in diff view) */}
        {hasFullProposalContent(item) && (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => (onViewFullProposal ? onViewFullProposal() : setShowFullProposal(true))}
            >
              <FileText className="h-3.5 w-3.5" />
              View full proposal
            </Button>
          </div>
        )}
        {!onViewFullProposal && (
          <FullProposalModal
            open={showFullProposal}
            onOpenChange={setShowFullProposal}
            title={item.title}
            proposalType={item.type}
            previewData={item.data?.preview_data as Record<string, unknown> | undefined}
          />
        )}
        {/* Diff Preview — Concept Brief / UX Brief: no inner scroll so Decisions panel scroll shows all options */}
        {(item.data.diff || item.data.preview_data?.diff) && (
          <div
            className={cn(
              "border rounded-lg p-4 bg-muted/50",
              item.type === "generate_concept_brief" || item.type === "generate_ux_brief"
                ? "min-h-0"
                : "max-h-[600px] overflow-y-auto"
            )}
          >
            {contentRendererRegistry.get("diff")?.render("", {
              diff: item.data.diff || item.data.preview_data?.diff,
              previewData: item.data.preview_data,
              threadId: item.threadId ?? (stream as any)?.threadId ?? threadIdFromUrl ?? undefined,
              proposalType: item.type,
            })}
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
              Approve
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

