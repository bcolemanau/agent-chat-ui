"use client";

import { useCallback, useEffect, useState } from "react";
import { useStreamContext } from "@/providers/Stream";
import { useQueryState } from "nuqs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { contentRendererRegistry } from "./content-renderers";
import "./content-renderers/diff-renderer";
import { toast } from "sonner";
import { Loader2, FileText } from "lucide-react";

export interface SingleProposalApprovalPageProps {
  /** Tool name to find in pending decisions (e.g. generate_requirements_proposal) */
  toolName: string;
  /** artifact_type for POST /api/artifact/apply (e.g. requirements_package) */
  artifactType: string;
  /** Message when user rejects */
  rejectMessage: string;
  /** Page title (e.g. "Requirements Proposal") */
  pageTitle?: string;
}

interface PendingItem {
  id: string;
  type: string;
  title: string;
  status: string;
  args?: Record<string, unknown>;
}

async function persistDecisionRejected(
  item: PendingItem,
  threadId: string | undefined
): Promise<void> {
  if (!threadId) return;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const orgContext =
    typeof localStorage !== "undefined" ? localStorage.getItem("reflexion_org_context") : null;
  if (orgContext) headers["X-Organization-Context"] = orgContext;
  await fetch("/api/decisions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      thread_id: threadId,
      decision: {
        id: item.id,
        type: item.type,
        title: item.title,
        status: "rejected",
        args: item.args,
      },
    }),
  });
}

/**
 * Page content for single-proposal tools (Requirements, Architecture, Design).
 * Loads the pending proposal from GET /decisions, shows the diff, and applies via POST /api/artifact/apply.
 */
export function SingleProposalApprovalPage({
  toolName,
  artifactType,
  rejectMessage,
  pageTitle = "Proposal",
}: SingleProposalApprovalPageProps) {
  const stream = useStreamContext();
  const [threadIdFromUrl] = useQueryState("threadId");
  const threadId = (stream as any)?.threadId ?? threadIdFromUrl ?? undefined;

  const [item, setItem] = useState<PendingItem | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);

  const loadPending = useCallback(async () => {
    if (!threadId?.trim()) {
      setItem(null);
      setPreviewData(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ thread_id: threadId });
      const headers: Record<string, string> = {};
      const orgContext = localStorage.getItem("reflexion_org_context");
      if (orgContext) headers["X-Organization-Context"] = orgContext;
      const res = await fetch(`/api/decisions?${params}`, { headers });
      if (!res.ok) {
        setItem(null);
        setPreviewData(null);
        return;
      }
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      const pending = list.find(
        (r: PendingItem) => r?.type === toolName && r?.status === "pending"
      ) as PendingItem | undefined;
      if (pending) {
        setItem(pending);
        setPreviewData((pending.args?.preview_data as Record<string, unknown>) ?? null);
      } else {
        setItem(null);
        setPreviewData(null);
      }
    } catch (e) {
      console.warn("[SingleProposalApprovalPage] Load failed", e);
      setItem(null);
      setPreviewData(null);
    } finally {
      setIsLoading(false);
    }
  }, [threadId, toolName]);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  const handleApprove = async () => {
    if (!item || !threadId) return;
    const cacheKey =
      (item.args?.cache_key as string) ??
      (previewData?.cache_key as string) ??
      (item.args?.preview_data as Record<string, unknown>)?.cache_key as string | undefined;
    if (!cacheKey) {
      toast.error("Error", { description: "Missing cache_key for this proposal" });
      return;
    }
    setIsApplying(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const orgContext = localStorage.getItem("reflexion_org_context");
      if (orgContext) headers["X-Organization-Context"] = orgContext;
      const res = await fetch("/api/artifact/apply", {
        method: "POST",
        headers,
        body: JSON.stringify({
          decision_id: item.id,
          cache_key: cacheKey,
          option_index: -1,
          thread_id: threadId,
          artifact_type: artifactType,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error((err as { detail?: string }).detail ?? "Failed to apply");
      }
      const data = (await res.json()) as Record<string, unknown>;
      const kg_version_sha = data.kg_version_sha as string | undefined;
      if (threadId) {
        const postHeaders: Record<string, string> = { "Content-Type": "application/json" };
        const orgContext = typeof localStorage !== "undefined" ? localStorage.getItem("reflexion_org_context") : null;
        if (orgContext) postHeaders["X-Organization-Context"] = orgContext;
        await fetch("/api/decisions", {
          method: "POST",
          headers: postHeaders,
          body: JSON.stringify({
            thread_id: threadId,
            decision: {
              id: item.id,
              type: item.type,
              title: item.title,
              status: "approved",
              args: item.args,
              kg_version_sha: kg_version_sha ?? undefined,
            },
          }),
        });
      }
      toast.success("Proposal applied", {
        description: `Saved ${artifactType.replace(/_/g, " ")}.`,
      });
      if (typeof (stream as any).updateState === "function" && data.active_agent) {
        await (stream as any).updateState({
          values: { active_agent: data.active_agent },
        });
      }
      (stream as any).triggerWorkbenchRefresh?.();
      setItem(null);
      setPreviewData(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to apply proposal";
      toast.error("Error", { description: message });
    } finally {
      setIsApplying(false);
    }
  };

  const handleReject = async () => {
    if (!item || !threadId) return;
    setIsApplying(true);
    try {
      await persistDecisionRejected(item, threadId);
      toast.info(rejectMessage);
      setItem(null);
      setPreviewData(null);
      (stream as any).triggerWorkbenchRefresh?.();
    } catch (_e) {
      toast.error("Error", { description: "Failed to persist rejection" });
    } finally {
      setIsApplying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px] gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading…</span>
      </div>
    );
  }

  if (!threadId) {
    return (
      <Card className="max-w-2xl mx-auto mt-6">
        <CardHeader>
          <CardTitle>{pageTitle}</CardTitle>
          <CardDescription>Open a thread (e.g. from the map or chat) to see pending proposals.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!item) {
    return (
      <Card className="max-w-2xl mx-auto mt-6">
        <CardHeader>
          <CardTitle>{pageTitle}</CardTitle>
          <CardDescription>
            No pending {pageTitle.toLowerCase()} for this thread. Generate one from the Requirements agent, then return here.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const preview = (item.args?.preview_data ?? previewData) as Record<string, unknown> | undefined;
  const diff = preview?.diff as Record<string, unknown> | undefined;

  return (
    <div className="max-w-4xl mx-auto space-y-4 py-6">
      <Card>
        <CardHeader>
          <CardTitle>{item.title ?? pageTitle}</CardTitle>
          {item.args?.model_summary != null && (
            <CardDescription>{String(item.args.model_summary)}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {diff && (
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              {contentRendererRegistry.get("diff")?.render("", {
                diff,
                previewData: previewData ?? undefined,
                threadId,
                proposalType: toolName,
              })}
            </div>
          )}
          {!diff && (
            <p className="text-sm text-muted-foreground">
              No diff preview available. You can still approve or reject from the Decisions pane.
            </p>
          )}
          <div className="flex gap-2">
            <Button
              onClick={handleApprove}
              disabled={isApplying}
              className="gap-2"
            >
              {isApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Approve
            </Button>
            <Button variant="outline" onClick={handleReject} disabled={isApplying}>
              Reject
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
