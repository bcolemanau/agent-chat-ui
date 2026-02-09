"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ConceptBriefDiffView as ConceptBriefDiffViewType } from "@/lib/diff-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, AlertCircle, Star, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownText } from "@/components/thread/markdown-text";

const DRAFT_SAVE_DEBOUNCE_MS = 1500;

const TEMPLATE_ID_LABELS: Record<string, string> = {
  "T-CONCEPT": "Concept Brief",
  "T-FEATDEF": "Feature Definition",
  "T-REQPKG": "Requirements Package",
  "T-UX": "UX Brief",
  "T-ARCH": "Architecture",
  "T-DESIGN": "Design",
};

interface ConceptBriefDiffViewProps {
  diffData?: ConceptBriefDiffViewType;
  /** Issue #63: impact_forecast / coverage_analysis for traceability UI */
  previewData?: Record<string, unknown>;
  onApprove?: (selectedOptionIndex: number) => void;
  onReject?: () => void;
  isLoading?: boolean;
  /** Thread ID for fetching draft artifact content when user clicks through */
  threadId?: string | null;
}

export function ConceptBriefDiffView({
  diffData,
  previewData,
  onApprove,
  onReject,
  isLoading = false,
  threadId,
}: ConceptBriefDiffViewProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [draftViewState, setDraftViewState] = useState<{
    artifactId: string | null;
    optionIndex: number;
    summaryFallback: string | null;
    cacheKey: string | null;
  }>({ artifactId: null, optionIndex: -1, summaryFallback: null, cacheKey: null });
  const [draftContent, setDraftContent] = useState<{ content: string; content_type: string } | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  /** Editable draft body (UX Brief M2); only when dialog is open with cacheKey and markdown */
  const [editorContent, setEditorContent] = useState<string>("");
  const [draftSaving, setDraftSaving] = useState(false);
  const draftSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorContentRef = useRef<string>("");
  editorContentRef.current = editorContent;

  // Fetch full draft when user opens the dialog: by artifact_id (saved draft) or by cache_key + option_index (in-memory cache)
  useEffect(() => {
    const { artifactId, optionIndex, summaryFallback, cacheKey } = draftViewState;
    if (optionIndex < 0) {
      setDraftContent(null);
      setDraftError(null);
      setDraftLoading(false);
      return;
    }
    setDraftError(null);

    if (artifactId) {
      let cancelled = false;
      setDraftLoading(true);
      (async () => {
        try {
          const orgContext = typeof localStorage !== "undefined" ? localStorage.getItem("reflexion_org_context") : null;
          const headers: Record<string, string> = {};
          if (orgContext) headers["X-Organization-Context"] = orgContext;
          let url = `/api/artifact/content?node_id=${encodeURIComponent(artifactId)}`;
          if (threadId) url += `&thread_id=${encodeURIComponent(threadId)}`;
          const res = await fetch(url, { headers });
          if (!res.ok) throw new Error("Failed to load draft");
          const data = await res.json();
          if (!cancelled) {
            const next = { content: data.content ?? "", content_type: data.content_type ?? "text" };
            setDraftContent(next);
            setEditorContent(next.content);
          }
        } catch (e: unknown) {
          if (!cancelled) setDraftError(e instanceof Error ? e.message : "Failed to load draft");
        } finally {
          if (!cancelled) setDraftLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }

    if (cacheKey != null && cacheKey !== "") {
      let cancelled = false;
      setDraftLoading(true);
      (async () => {
        try {
          const orgContext = typeof localStorage !== "undefined" ? localStorage.getItem("reflexion_org_context") : null;
          const headers: Record<string, string> = {};
          if (orgContext) headers["X-Organization-Context"] = orgContext;
          const params = new URLSearchParams({ cache_key: cacheKey, option_index: String(optionIndex) });
          if (threadId) params.set("thread_id", threadId);
          const url = `/api/artifact/draft-content?${params.toString()}`;
          const res = await fetch(url, { headers });
          if (!res.ok) throw new Error("Failed to load draft");
          const data = await res.json();
          if (!cancelled) {
            const next = { content: data.content ?? "", content_type: data.content_type ?? "markdown" };
            setDraftContent(next);
            setEditorContent(next.content);
          }
        } catch (e: unknown) {
          if (!cancelled) setDraftError(e instanceof Error ? e.message : "Failed to load draft");
        } finally {
          if (!cancelled) setDraftLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }

    // No artifact_id and no cache_key: show summary fallback only
    setDraftLoading(false);
    setDraftContent(summaryFallback != null ? { content: summaryFallback, content_type: "text" } : null);
    setEditorContent(summaryFallback ?? "");
    return () => {};
    // eslint-disable-next-line react-hooks/exhaustive-deps -- draftViewState intentionally partial to avoid re-run loops
  }, [draftViewState.artifactId, draftViewState.optionIndex, draftViewState.summaryFallback, draftViewState.cacheKey, threadId]);

  // Debounced save of draft content to KG (UX Brief M2)
  const saveDraftToBackend = useCallback(async (content: string) => {
    const cacheKey = draftViewState.cacheKey;
    if (!cacheKey || !content.trim()) return;
    setDraftSaving(true);
    try {
      const orgContext = typeof localStorage !== "undefined" ? localStorage.getItem("reflexion_org_context") : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (orgContext) headers["X-Organization-Context"] = orgContext;
      const res = await fetch("/api/artifact/draft-content", {
        method: "POST",
        headers,
        body: JSON.stringify({ cache_key: cacheKey, thread_id: threadId ?? undefined, content }),
      });
      if (!res.ok) throw new Error("Failed to save draft");
    } catch (e) {
      console.warn("[ConceptBriefDiffView] draft save failed:", e);
    } finally {
      setDraftSaving(false);
    }
  }, [draftViewState.cacheKey, threadId]);

  useEffect(() => {
    if (draftViewState.optionIndex < 0 || !draftViewState.cacheKey || (draftContent?.content_type !== "markdown" && draftContent?.content_type !== "text")) return;
    if (draftSaveTimeoutRef.current) clearTimeout(draftSaveTimeoutRef.current);
    draftSaveTimeoutRef.current = setTimeout(() => {
      draftSaveTimeoutRef.current = null;
      saveDraftToBackend(editorContentRef.current);
    }, DRAFT_SAVE_DEBOUNCE_MS);
    return () => {
      if (draftSaveTimeoutRef.current) clearTimeout(draftSaveTimeoutRef.current);
    };
  }, [editorContent, draftViewState.optionIndex, draftViewState.cacheKey, draftContent?.content_type, saveDraftToBackend]);

  if (!diffData) {
    return (
      <div className="flex items-center justify-center p-8 h-full">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Concept Brief Data Available</h3>
          <p className="text-sm text-muted-foreground">
            Waiting for concept brief proposal data. This view will display when the concept agent
            generates options and awaits your approval.
          </p>
        </div>
      </div>
    );
  }

  const { options, recommended_index, metadata } = diffData;
  const effectiveSelected = selectedIndex ?? recommended_index;
  const title: string = String(metadata?.title ?? "");
  const description: string = String(metadata?.description ?? "");
  const numOptions: number = Number(metadata?.num_options ?? 0);
  const recommendedOneBased: number = Number(recommended_index ?? 0) + 1;
  const effectiveSelectedOneBased: number = Number(effectiveSelected ?? 0) + 1;

  return (
    <div className="flex flex-col min-h-0">
      {/* Header */}
      <div className="border-b p-4 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          </div>
          <div className="text-sm text-muted-foreground">
            {numOptions} option{numOptions !== 1 ? "s" : ""} · recommended option {recommendedOneBased}
          </div>
        </div>
      </div>

      {/* Issue #63: Impact forecast (downstream templates that may need re-validation) */}
      {previewData && typeof previewData.impact_forecast === "object" ? (
        <div className="border-b px-4 py-3 shrink-0 rounded-none border-border bg-muted/30 text-sm">
          <p className="font-medium text-foreground">Impact forecast</p>
          <p className="text-muted-foreground text-xs mt-0.5">{String((previewData.impact_forecast as { message?: string }).message ?? "")}</p>
          {((previewData.impact_forecast as { downstream_template_ids?: string[] }).downstream_template_ids?.length ?? 0) > 0 ? (
            <ul className="list-disc list-inside text-xs text-muted-foreground mt-1">
              {((previewData.impact_forecast as { downstream_template_ids: string[] }).downstream_template_ids).map((id: string) => (
                <li key={id}>{TEMPLATE_ID_LABELS[id] ?? id}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* Option cards — scrollable list with visible scrollbar; "View full draft" in header so it's always visible */}
      <div className="p-4 flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-scroll max-h-[55vh] pr-2 space-y-4 border border-transparent [scrollbar-gutter:stable]">
          {options.map((opt, i) => {
            const isRecommended = i === recommended_index;
            const isSelected = i === effectiveSelected;
            return (
              <Card
                key={i}
                className={cn(
                  "cursor-pointer transition-colors shrink-0",
                  isSelected && "ring-2 ring-primary",
                  !isSelected && "hover:bg-muted/50"
                )}
                onClick={() => setSelectedIndex(i)}
              >
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      Option {i + 1}
                      {isRecommended && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                          <Star className="h-3 w-3" />
                          Recommended
                        </span>
                      )}
                    </CardTitle>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          (opt.compliance_score ?? 0) >= 0.8
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200"
                            : (opt.compliance_score ?? 0) >= 0.5
                            ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200"
                            : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200"
                        )}
                      >
                        {(opt.compliance_score ?? 0) * 100}% compliance
                      </span>
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="gap-1.5 shrink-0 font-medium"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDraftViewState({
                            artifactId: opt.artifact_id ?? null,
                            optionIndex: i,
                            summaryFallback: opt.summary ?? null,
                            cacheKey: metadata.cache_key ?? null,
                          });
                        }}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        View full draft
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm whitespace-pre-wrap font-normal">
                    {opt.summary}
                  </CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Draft viewer dialog — click-through to saved draft or show summary when no artifact_id */}
      <Dialog
        open={draftViewState.optionIndex >= 0}
        onOpenChange={(open) => !open && setDraftViewState({ artifactId: null, optionIndex: -1, summaryFallback: null, cacheKey: null })}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-4">
          <DialogHeader className="shrink-0">
            <DialogTitle>Concept brief draft — Option {draftViewState.optionIndex + 1}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 max-h-[65vh] overflow-y-scroll rounded-md border bg-muted/30 p-4 [scrollbar-gutter:stable]">
            {draftLoading && (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading draft…
              </div>
            )}
            {draftError && (
              <p className="text-sm text-destructive py-4">{draftError}</p>
            )}
            {!draftLoading && !draftError && draftContent && draftViewState.cacheKey && (draftContent.content_type === "markdown" || draftContent.content_type === "text") && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Editable draft — changes are saved automatically.</p>
                <textarea
                  className="w-full min-h-[40vh] rounded border bg-background px-3 py-2 text-sm font-mono whitespace-pre-wrap resize-y"
                  value={editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                  spellCheck="false"
                />
                {draftSaving && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Saving…
                  </span>
                )}
              </div>
            )}
            {!draftLoading && !draftError && draftContent && !(draftViewState.cacheKey && (draftContent.content_type === "markdown" || draftContent.content_type === "text")) && (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                {(draftContent.content_type === "markdown" || draftContent.content_type === "text") ? (
                  <MarkdownText>{draftContent.content}</MarkdownText>
                ) : (
                  <pre className="whitespace-pre-wrap text-sm font-normal">{draftContent.content}</pre>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Actions */}
      {(onApprove || onReject) && (
        <div className="border-t p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {selectedIndex !== null
              ? `Option ${selectedIndex + 1} selected`
              : `Using recommended option ${recommended_index + 1}`}
          </p>
          <div className="flex items-center gap-2">
            {onReject && (
              <Button variant="outline" onClick={onReject} disabled={isLoading}>
                Reject
              </Button>
            )}
            {onApprove && (
              <Button
                onClick={async () => {
                  if (
                    draftViewState.cacheKey &&
                    draftViewState.optionIndex === effectiveSelected &&
                    (editorContent ?? "").trim()
                  ) {
                    await saveDraftToBackend(editorContent);
                  }
                  onApprove(effectiveSelected);
                }}
                disabled={isLoading}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Approve option {effectiveSelectedOneBased}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
