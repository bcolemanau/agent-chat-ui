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
    extra?: { kg_version_sha?: string; artifact_id?: string; outcome_description?: string }
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
          args: {
            cache_key: args.cache_key,
            trigger_id: args.trigger_id,
            ...(item.data?.preview_data != null ? { preview_data: item.data.preview_data } : {}),
          },
          ...(extra.kg_version_sha != null ? { kg_version_sha: extra.kg_version_sha } : {}),
        },
      }),
    });
  } catch (e) {
    console.warn("[ApprovalCard] Failed to persist decision:", e);
  }
}

const ARTIFACT_TYPE_FOR_FULL_PREVIEW = new Set([
  "concept_brief",
  "ux_brief",
  "requirements_package",
  "architecture",
  "design",
  "manufacturing_ops",
  "software_ops",
]);

function hasFullProposalContent(item: UnifiedPreviewItem): boolean {
  const pd = item.data?.preview_data as Record<string, unknown> | undefined;
  if (!pd) return false;
  const artifactType = item.type === "generate" ? (item.data?.args as Record<string, unknown> | undefined)?.artifact_type : null;
  const isArtifactProposal =
    item.type === "generate" && artifactType && ARTIFACT_TYPE_FOR_FULL_PREVIEW.has(artifactType as string);
  if (!isArtifactProposal) return false;
  const hasMarkdown = (pd.content as string)?.trim() || (pd.markdown as string)?.trim();
  const hasStructured =
    pd.requirements_data != null || pd.architecture_data != null || pd.design_data != null;
  return Boolean(hasMarkdown || hasStructured);
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

    // Preview-only tools: apply via API endpoints, not graph resume (no HITL/interrupts)
    if (item.type === "classify_intent") {
      if (decisionType === "reject") {
        setStatus("rejected");
        onDecisionProcessed?.(item, "rejected");
        await persistDecision(item, "rejected", item.threadId ?? (stream as any)?.threadId ?? threadIdFromUrl ?? undefined);
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
              decision_id: item.id,
              trigger_id: item.data?.args?.trigger_id ?? item.data?.preview_data?.trigger_id,
              project_id: threadId,
              thread_id: threadId,
              reasoning: item.data?.args?.reasoning,
              confidence: item.data?.args?.confidence,
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: res.statusText }));
            const d = (err as any).detail;
            const msg =
              typeof d === "string"
                ? d
                : Array.isArray(d)
                  ? d.map((e: any) => (e?.loc ? `${e.loc.join(".")}: ${e.msg ?? ""}` : String(e)).trim()).filter(Boolean).join("; ") || "Validation failed"
                  : d != null
                    ? JSON.stringify(d)
                    : res.statusText;
            throw new Error(msg || "Failed to apply classification");
          }
          const data = await res.json();
          setStatus("approved");
          // Backend returns kg_version_sha (every decision ↔ KG update)
          const kg_version_sha = (data as any).kg_version_sha ?? (await fetchLatestKgVersionSha(threadId));
          onDecisionProcessed?.(item, "approved", { kg_version_sha });
          await persistDecision(item, "approved", threadId, { ...(kg_version_sha != null ? { kg_version_sha } : {}) });
          toast.success("Approved", {
            description: "Classification applied.",
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

    // generate_project_configuration_summary (ex propose_hydration_complete) is preview-only; apply via API (transition to Concept), not graph resume
    if (item.type === "generate_project_configuration_summary" || item.type === "propose_hydration_complete") {
      if (decisionType === "reject") {
        setStatus("rejected");
        onDecisionProcessed?.(item, "rejected");
        await persistDecision(item, "rejected", item.threadId ?? (stream as any)?.threadId ?? threadIdFromUrl ?? undefined);
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
              decision_id: item.id,
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
          const kg_version_sha = (data as any).kg_version_sha;
          onDecisionProcessed?.(item, "approved", kg_version_sha != null ? { kg_version_sha } : undefined);
          await persistDecision(item, "approved", threadId, { ...(kg_version_sha != null ? { kg_version_sha } : {}) });
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
        await persistDecision(item, "rejected", item.threadId ?? (stream as any)?.threadId ?? threadIdFromUrl ?? undefined);
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
              decision_id: item.id,
              artifact_id: item.data?.args?.document_id ?? item.data?.preview_data?.artifact_id,
              artifact_type: item.data?.args?.artifact_type ?? item.data?.preview_data?.artifact_type,
              project_id: threadId,
              thread_id: threadId,
              trigger_id: item.data?.args?.trigger_id ?? item.data?.preview_data?.trigger_id,
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: res.statusText }));
            const detail = typeof (err as any).detail === "string" ? (err as any).detail : (err as any).detail?.message;
            const message =
              res.status === 404
                ? "Artifact link is not available. The backend may not support this action—check deployment."
                : detail || "Failed to apply artifact link";
            throw new Error(message);
          }
          const data = await res.json();
          setStatus("approved");
          const kg_version_sha = (data as any).kg_version_sha;
          onDecisionProcessed?.(item, "approved", kg_version_sha != null ? { kg_version_sha } : undefined);
          await persistDecision(item, "approved", threadId, { ...(kg_version_sha != null ? { kg_version_sha } : {}) });
          toast.success("Artifact Linked", {
            description: `Successfully linked ${data.filename || "artifact"} to ${data.artifact_type || "KG"}`,
          });
          (stream as any).triggerWorkbenchRefresh?.();
        } catch (error: any) {
          console.error("[ApprovalCard] Error applying artifact link:", error);
          setStatus("pending");
          toast.error("Artifact link failed", { description: error.message || "Failed to apply artifact link" });
        } finally {
          setIsLoading(false);
        }
        return;
      }
    }

    // Enrichment (from stream or from GET /decisions): apply via API so KG gets entity nodes + links, not just link deltas
    const isEnrichmentType =
      item.type === "enrichment" || item.type === "propose_enrichment" || item.type === "approve_enrichment";
    if (isEnrichmentType) {
      const artifactId =
        item.data?.args?.artifact_id ?? item.data?.preview_data?.artifact_id;
      const cycleId =
        item.data?.args?.cycle_id ?? item.data?.preview_data?.cycle_id;
      const enrichmentData =
        item.data?.args?.enrichment_data ?? item.data?.preview_data?.enrichment_data;
      const artifactTypes =
        enrichmentData?.artifact_types ?? item.data?.args?.artifact_types ?? ["Requirements"];

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
          await persistDecision(item, "rejected", threadId);
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
          const projectId = threadId; // backend uses project_id for KG load/save
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
                project_id: projectId,
                decision_id: item.id,
              }),
            }
          );
          if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error((err as any).detail || "Failed to apply enrichment");
          }
          const data = await res.json();
          setStatus("approved");
          const kg_version_sha = (data as any).kg_version_sha;
          onDecisionProcessed?.(item, "approved", kg_version_sha != null ? { kg_version_sha } : undefined);
          await persistDecision(item, "approved", threadId, { ...(kg_version_sha != null ? { kg_version_sha } : {}) });
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

    // Artifact edit proposal: approve = persist edit and bump version (no propose_only)
    if (item.type === "artifact_edit") {
      if (decisionType === "reject") {
        setStatus("rejected");
        onDecisionProcessed?.(item, "rejected");
        await persistDecision(
          item,
          "rejected",
          item.threadId ?? (stream as any)?.threadId ?? threadIdFromUrl ?? undefined
        );
        toast.info("Edit proposal rejected");
        setIsLoading(false);
        return;
      }
      if (decisionType === "approve") {
        const args = item.data?.args ?? {};
        const sourceNodeId = args.source_node_id;
        const draftContent = args.draft_content;
        const artifactType = args.artifact_type;
        const cacheKey = args.cache_key;
        const threadId = item.threadId ?? (stream as any)?.threadId ?? threadIdFromUrl ?? undefined;
        const projectId = args.project_id ?? threadId;
        if (!sourceNodeId || (draftContent == null || draftContent === "")) {
          toast.error("Error", { description: "Missing source_node_id or draft_content for this edit proposal" });
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
              decision_id: item.id,
              cache_key: cacheKey ?? `edit:${sourceNodeId}`,
              option_index: 0,
              thread_id: threadId,
              project_id: projectId,
              artifact_type: artifactType ?? "concept_brief",
              source_node_id: sourceNodeId,
              draft_content: draftContent,
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error((err as any).detail || "Failed to apply artifact edit");
          }
          const data = await res.json();
          setStatus("approved");
          const apiData = data as { artifact_id?: string; message?: string; outcome_description?: string };
          const outcomeDesc = apiData.outcome_description ?? apiData.message ?? "Artifact edit applied, draft removed.";
          onDecisionProcessed?.(item, "approved", {
            ...(apiData.artifact_id != null ? { artifact_id: apiData.artifact_id } : {}),
            outcome_description: outcomeDesc,
          });
          await persistDecision(item, "approved", threadId, { artifact_id: apiData.artifact_id });
          toast.success("Artifact edit applied, draft removed.", { description: outcomeDesc !== "Artifact edit applied, draft removed." ? outcomeDesc : "Content updated and draft node removed from graph." });
          (stream as any).triggerWorkbenchRefresh?.();
        } catch (error: any) {
          console.error("[ApprovalCard] Error applying artifact edit:", error);
          setStatus("pending");
          toast.error("Error", { description: error.message || "Failed to apply artifact edit" });
        } finally {
          setIsLoading(false);
        }
        return;
      }
    }

    // Artifact proposals: tool_name "generate" with args.artifact_type (concept_brief, ux_brief, requirements_package, architecture, design, manufacturing_ops, software_ops)
    const artifactType =
      item.type === "generate"
        ? ((item.data?.args as Record<string, unknown> | undefined)?.artifact_type as string | undefined)
        : undefined;
    if (artifactType) {
      if (decisionType === "reject") {
        setStatus("rejected");
        onDecisionProcessed?.(item, "rejected");
        await persistDecision(
          item,
          "rejected",
          item.threadId ?? (stream as any)?.threadId ?? threadIdFromUrl ?? undefined
        );
        toast.info("Proposal rejected");
        setIsLoading(false);
        return;
      }
      if (decisionType === "approve") {
        const cacheKey = item.data?.args?.cache_key ?? item.data?.preview_data?.cache_key;
        // For concept/UX brief, backend needs option_index (0, 1, or 2). Use selected, else recommended from proposal.
        const optionIndex =
          item.data?.args?.option_index ??
          item.data?.args?.selected_option_index ??
          (item.data?.preview_data?.diff as { recommended_index?: number } | undefined)?.recommended_index ??
          (item.data?.preview_data as { best_option_index?: number } | undefined)?.best_option_index ??
          -1;
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
          let draftContent: string | undefined;
          if (artifactType === "concept_brief" || artifactType === "ux_brief") {
            try {
              const draftParams = new URLSearchParams({ cache_key: cacheKey, option_index: String(typeof optionIndex === "number" ? optionIndex : 0) });
              if (threadId) draftParams.set("thread_id", threadId);
              const draftRes = await fetch(`/api/artifact/draft-content?${draftParams.toString()}`, { headers });
              if (draftRes.ok) {
                const draftData = (await draftRes.json()) as { content?: string };
                if (typeof draftData?.content === "string" && draftData.content.trim()) draftContent = draftData.content.trim();
              }
            } catch (_e) {
              /* optional: use cached/generated content on apply */
            }
          }
          const res = await fetch("/api/artifact/apply", {
            method: "POST",
            headers,
            body: JSON.stringify({
              decision_id: item.id,
              cache_key: cacheKey,
              option_index: typeof optionIndex === "number" ? optionIndex : -1,
              thread_id: threadId,
              artifact_type: artifactType,
              ...(draftContent != null ? { draft_content: draftContent } : {}),
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error((err as any).detail || "Failed to apply artifact");
          }
          const data = await res.json();
          setStatus("approved");
          const kg_version_sha = (data as any).kg_version_sha;
          onDecisionProcessed?.(item, "approved", kg_version_sha != null ? { kg_version_sha } : undefined);
          const effectiveOptionIndex = typeof optionIndex === "number" ? optionIndex : -1;
          await persistDecision(item, "approved", threadId, {
            option_index: effectiveOptionIndex >= 0 ? effectiveOptionIndex : undefined,
            artifact_id: (data as any).artifact_id,
            ...(kg_version_sha != null ? { kg_version_sha } : {}),
          });
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
      case "generate_project_configuration_summary":
      case "propose_hydration_complete":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "generate":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "propose_enrichment":
      case "approve_enrichment":
      case "enrichment":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      case "link_uploaded_document":
        return "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200";
      case "artifact_edit":
        return "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200";
      case "propose_organization":
      case "propose_user_add":
      case "propose_user_edit":
      case "propose_user_remove":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
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
        {/* Diff Preview — same container for all artifact proposal types (Decisions panel scroll) */}
        {(item.data.diff || item.data.preview_data?.diff) && (
          <div className="border rounded-lg p-4 bg-muted/50 min-h-0">
            {contentRendererRegistry.get("diff")?.render("", {
              diff: item.data.diff || item.data.preview_data?.diff,
              previewData: item.data.preview_data,
              threadId: item.threadId ?? (stream as any)?.threadId ?? threadIdFromUrl ?? undefined,
              proposalType: item.type,
            })}
          </div>
        )}

        {/* Artifact edit: show extraction details (regex vs LLM) and upstream/downstream impact */}
        {item.type === "artifact_edit" && item.data?.preview_data && (
          <div className="border rounded-lg p-4 bg-muted/30 space-y-3 text-sm">
            {(() => {
              const pd = item.data.preview_data as {
                extraction_summary_line?: string;
                entity_extraction_summary?: {
                  totals?: { regex: number; llm: number; total: number };
                  by_type?: Record<string, { regex: number; llm: number; total: number }>;
                };
                downstream_impact?: { id: string; name: string }[];
                upstream_impact?: { id: string; name: string }[];
              };
              return (
                <>
                  {(pd.extraction_summary_line || (pd.entity_extraction_summary?.totals && (pd.entity_extraction_summary.totals.regex > 0 || pd.entity_extraction_summary.totals.llm > 0))) && (
                    <div>
                      <span className="font-medium text-muted-foreground">Extraction (this artifact):</span>
                      <p className="mt-1 text-muted-foreground">
                        {pd.extraction_summary_line ?? (
                          pd.entity_extraction_summary?.totals
                            ? `${pd.entity_extraction_summary.totals.total} entities (${pd.entity_extraction_summary.totals.regex} regex, ${pd.entity_extraction_summary.totals.llm} LLM)`
                            : null
                        )}
                      </p>
                      {pd.entity_extraction_summary?.by_type && Object.keys(pd.entity_extraction_summary.by_type).length > 0 && (
                        <ul className="mt-1 list-disc list-inside text-muted-foreground text-xs">
                          {Object.entries(pd.entity_extraction_summary.by_type).map(([et, counts]) => (
                            <li key={et}>{et}: {counts.total} total ({counts.regex} regex, {counts.llm} LLM)</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {(pd.downstream_impact?.length ?? 0) > 0 && (
                    <div>
                      <span className="font-medium text-muted-foreground">Downstream impact (artifacts that reference this):</span>
                      <ul className="mt-1 list-disc list-inside text-muted-foreground">
                        {(pd.downstream_impact!.slice(0, 10)).map((d) => (
                          <li key={d.id}>{d.name || d.id}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(pd.upstream_impact?.length ?? 0) > 0 && (
                    <div>
                      <span className="font-medium text-muted-foreground">Upstream (this artifact references):</span>
                      <ul className="mt-1 list-disc list-inside text-muted-foreground">
                        {(pd.upstream_impact ?? []).slice(0, 10).map((u) => (
                          <li key={u.id}>{u.name || u.id}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!(pd.downstream_impact?.length) && !(pd.upstream_impact?.length) && !pd.extraction_summary_line && !(pd.entity_extraction_summary?.totals && (pd.entity_extraction_summary.totals.regex > 0 || pd.entity_extraction_summary.totals.llm > 0)) && (
                    <p className="text-muted-foreground">No upstream/downstream links in this project.</p>
                  )}
                </>
              );
            })()}
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

