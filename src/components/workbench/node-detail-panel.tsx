"use client";

import React, { useEffect, useState } from "react";
import { ZoomOut, Activity, Loader2, Pencil, CheckCircle2 } from "lucide-react";
import { Button as UIButton } from "@/components/ui/button";
import { contentRendererRegistry } from "./content-renderers";
// Import renderers to ensure they register themselves
import "./content-renderers/markdown-renderer";
import "./content-renderers/architecture-renderer";
import "./content-renderers/text-renderer";
import "./content-renderers/binary-renderer";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Node {
  id: string;
  name: string;
  type: string;
  description?: string;
  properties?: Record<string, any>;
  metadata?: Record<string, any>;
}

interface NodeDetailPanelProps {
  node: Node | null;
  onClose: () => void;
  position?: "left" | "right" | "bottom";
  threadId?: string | null;
}

interface ArtifactContent {
  content: string;
  content_type: string;
  metadata?: Record<string, any>;
  version?: string;
}

export function NodeDetailPanel({ 
  node, 
  onClose, 
  position = "right",
  threadId 
}: NodeDetailPanelProps) {
  const [content, setContent] = useState<ArtifactContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [artifactHistory, setArtifactHistory] = useState<any[] | null>(null);
  const [_loadingHistory, setLoadingHistory] = useState(false);
  const [historicalContent, setHistoricalContent] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

  // Edit existing concept brief (draft-from-existing flow)
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editDraftContent, setEditDraftContent] = useState("");
  const [editCacheKey, setEditCacheKey] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editApplying, setEditApplying] = useState(false);
  // Edit with me (M4)
  const [reviseInstruction, setReviseInstruction] = useState("");
  const [reviseLoading, setReviseLoading] = useState(false);

  // Fetch artifact content when node changes
  useEffect(() => {
    console.log("[NodeDetailPanel] ENTER useEffect: fetchContent", { nodeId: node?.id, threadId, selectedVersion });
    if (!node) {
      console.log("[NodeDetailPanel] [BRANCH] No node provided, clearing content");
      setContent(null);
      setError(null);
      return;
    }

    const fetchContent = async () => {
      console.log("[NodeDetailPanel] [BRANCH] Starting fetchContent", { nodeId: node.id, threadId, selectedVersion });
      setLoading(true);
      setError(null);
      try {
        const orgContext = localStorage.getItem('reflexion_org_context');
        const headers: Record<string, string> = {};
        if (orgContext) headers['X-Organization-Context'] = orgContext;

        let url = `/api/artifact/content?node_id=${node.id}`;
        if (threadId) url += `&thread_id=${threadId}`;
        if (selectedVersion) url += `&version=${selectedVersion}`;

        console.log("[NodeDetailPanel] [BRANCH] Fetching content from URL:", url);
        const res = await fetch(url, { headers });
        if (!res.ok) {
          console.error("[NodeDetailPanel] [BRANCH] Fetch failed:", res.status, res.statusText);
          throw new Error(`Failed to fetch content: ${res.statusText}`);
        }

        const data = await res.json();
        console.log("[NodeDetailPanel] [BRANCH] Content received:", { 
          contentType: data.content_type, 
          contentLength: data.content?.length || 0,
          hasMetadata: !!data.metadata 
        });
        setContent(data);
        console.log("[NodeDetailPanel] EXIT fetchContent: SUCCESS");
      } catch (err: any) {
        console.error("[NodeDetailPanel] EXIT fetchContent: ERROR", err);
        setError(err.message || "Failed to load content");
        console.error("[NodeDetailPanel] Error fetching content:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchContent();
  }, [node, threadId, selectedVersion]);

  // Fetch artifact history for ARTIFACT nodes
  useEffect(() => {
    console.log("[NodeDetailPanel] ENTER useEffect: fetchHistory", { nodeId: node?.id, nodeType: node?.type });
    if (!node || node.type !== 'ARTIFACT') {
      console.log("[NodeDetailPanel] [BRANCH] Not an ARTIFACT node, skipping history fetch");
      setArtifactHistory(null);
      return;
    }

    const fetchHistory = async () => {
      console.log("[NodeDetailPanel] [BRANCH] Starting fetchHistory", { nodeId: node.id });
      setLoadingHistory(true);
      try {
        const orgContext = localStorage.getItem('reflexion_org_context');
        const headers: Record<string, string> = {};
        if (orgContext) headers['X-Organization-Context'] = orgContext;

        let url = `/api/artifact/history?node_id=${node.id}`;
        if (threadId) url += `&thread_id=${threadId}`;

        console.log("[NodeDetailPanel] [BRANCH] Fetching history from URL:", url);
        const res = await fetch(url, { headers });
        if (res.ok) {
          const json = await res.json();
          const versions = json.versions || [];
          console.log("[NodeDetailPanel] [BRANCH] History received:", { versionCount: versions.length });
          setArtifactHistory(versions);
          console.log("[NodeDetailPanel] EXIT fetchHistory: SUCCESS");
        } else {
          console.warn("[NodeDetailPanel] [BRANCH] History fetch failed:", res.status, res.statusText);
        }
      } catch (err) {
        console.error("[NodeDetailPanel] EXIT fetchHistory: ERROR", err);
        console.error("[NodeDetailPanel] Error fetching history:", err);
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchHistory();
  }, [node, threadId]);

  if (!node) return null;

  const metadata = (node as Node & { metadata?: Record<string, unknown> }).metadata || {};
  const artifactTypes = (metadata.artifact_types as string[] | undefined) || [];
  const status = (metadata.status as string | undefined) ?? "accepted";
  const hasArtifactId = !!(metadata.artifact_id as string | undefined);
  const isEditableArtifact =
    node.type === "ARTIFACT" &&
    ((status === "accepted" && hasArtifactId) || status === "draft");

  const handleStartEdit = async () => {
    if (!node) return;
    setEditLoading(true);
    try {
      const orgContext = typeof localStorage !== "undefined" ? localStorage.getItem("reflexion_org_context") : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (orgContext) headers["X-Organization-Context"] = orgContext;
      const res = await fetch("/api/artifact/draft-from-existing", {
        method: "POST",
        headers,
        body: JSON.stringify({ node_id: node.id, thread_id: threadId ?? undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((err as { error?: string }).error ?? "Failed to start edit");
      }
      const data = (await res.json()) as { draft_cache_key: string; content: string };
      setEditCacheKey(data.draft_cache_key);
      setEditDraftContent(data.content ?? "");
      setEditModalOpen(true);
    } catch (e) {
      toast.error("Error", { description: e instanceof Error ? e.message : "Failed to start edit" });
    } finally {
      setEditLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!editCacheKey || editDraftContent === undefined) return;
    setEditSaving(true);
    try {
      const orgContext = typeof localStorage !== "undefined" ? localStorage.getItem("reflexion_org_context") : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (orgContext) headers["X-Organization-Context"] = orgContext;
      const res = await fetch("/api/artifact/draft-content", {
        method: "POST",
        headers,
        body: JSON.stringify({ cache_key: editCacheKey, thread_id: threadId ?? undefined, content: editDraftContent }),
      });
      if (!res.ok) throw new Error("Failed to save draft");
      toast.success("Draft saved");
    } catch (e) {
      toast.error("Error", { description: e instanceof Error ? e.message : "Failed to save draft" });
    } finally {
      setEditSaving(false);
    }
  };

  const artifactTypeForApply = (): string => {
    const t = (artifactTypes[0] as string)?.toLowerCase() ?? "";
    if (t.includes("concept brief")) return "concept_brief";
    if (t.includes("ux brief")) return "ux_brief";
    if (t.includes("requirements")) return "requirements_package";
    if (t.includes("architecture")) return "architecture";
    if (t.includes("design")) return "design";
    return "concept_brief";
  };

  const handleReviseFromDraft = async () => {
    if (!editCacheKey || !reviseInstruction.trim()) return;
    setReviseLoading(true);
    try {
      const orgContext = typeof localStorage !== "undefined" ? localStorage.getItem("reflexion_org_context") : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (orgContext) headers["X-Organization-Context"] = orgContext;
      const res = await fetch("/api/artifact/revise-from-draft", {
        method: "POST",
        headers,
        body: JSON.stringify({
          cache_key: editCacheKey,
          thread_id: threadId ?? undefined,
          content: editDraftContent,
          instruction: reviseInstruction.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((err as { error?: string }).error ?? "Revise failed");
      }
      const data = await res.json();
      if (typeof data.content === "string") {
        setEditDraftContent(data.content);
        setReviseInstruction("");
        toast.success("Draft revised");
      }
    } catch (e) {
      toast.error("Error", { description: e instanceof Error ? e.message : "Revise failed" });
    } finally {
      setReviseLoading(false);
    }
  };

  const handleApplyEdit = async () => {
    if (!node || !editCacheKey) return;
    setEditApplying(true);
    try {
      const orgContext = typeof localStorage !== "undefined" ? localStorage.getItem("reflexion_org_context") : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (orgContext) headers["X-Organization-Context"] = orgContext;
      const res = await fetch("/api/artifact/apply", {
        method: "POST",
        headers,
        body: JSON.stringify({
          decision_id: `edit-${node.id}`,
          cache_key: editCacheKey,
          option_index: 0,
          thread_id: threadId ?? undefined,
          artifact_type: artifactTypeForApply(),
          source_node_id: node.id,
          draft_content: editDraftContent,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error((err as { detail?: string }).detail ?? "Failed to apply edit");
      }
      toast.success("Artifact updated");
      setEditModalOpen(false);
      setEditCacheKey(null);
      setEditDraftContent("");
      onClose();
    } catch (e) {
      toast.error("Error", { description: e instanceof Error ? e.message : "Failed to apply edit" });
    } finally {
      setEditApplying(false);
    }
  };

  const typeConfig: Record<string, { label: string }> = {
    DOMAIN: { label: 'Domain' },
    REQ: { label: 'Trigger' },
    ARTIFACT: { label: 'Artifact' },
    MECH: { label: 'Mechanism' },
    CRIT: { label: 'Risk' },
    // Content-entity types (imported from Concept, Requirements, Architecture, etc.)
    OUTCOME: { label: 'Outcome' },
    SCENARIO: { label: 'Scenario' },
    METRIC: { label: 'Metric' },
    DECISION: { label: 'Decision' },
    UX_OUTCOME: { label: 'UX Outcome' },
    FEAT: { label: 'Feature' },
    FEATURE: { label: 'Feature' },
    REQUIREMENT: { label: 'Requirement' },
    COMPONENT: { label: 'Component' },
    INTERFACE: { label: 'Interface' },
    VIEW: { label: 'View' },
    PERS: { label: 'Persona' },
    LIFECYCLE: { label: 'Lifecycle' },
    TEMPLATE: { label: 'Template' },
  };

  const typeLabel = typeConfig[node.type]?.label || node.type;

  // Get renderer for content type
  const contentType = content?.content_type || "text";
  console.log("[NodeDetailPanel] [BRANCH] Selecting renderer", { contentType, availableRenderers: contentRendererRegistry.getContentTypes() });
  const renderer = contentRendererRegistry.get(contentType) || contentRendererRegistry.get("text");
  console.log("[NodeDetailPanel] [BRANCH] Renderer selected", { contentType, hasRenderer: !!renderer });

  return (
    <div 
      className={cn(
        "h-full w-full flex flex-col bg-background",
        position === "left" ? "border-r border-border" : position === "bottom" ? "border-t border-border" : "border-l border-border"
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header - Fixed */}
      <div className="flex-shrink-0 flex justify-between items-start p-5 pb-4 border-b border-border bg-background z-10">
        <div className="min-w-0 flex-1 pr-2">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">
            {typeLabel}
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-bold text-foreground leading-tight truncate">{node.name}</h3>
            {node.metadata?.version_number != null && node.metadata.version_number >= 1 && (
              <span className="text-xs font-medium text-muted-foreground shrink-0">v{node.metadata.version_number}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isEditableArtifact && !editModalOpen && (
            <UIButton
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={handleStartEdit}
              disabled={editLoading}
            >
              {editLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
              Edit
            </UIButton>
          )}
          {editModalOpen && (
            <>
              <UIButton
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={handleSaveDraft}
                disabled={editSaving}
              >
                {editSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Save draft
              </UIButton>
              <UIButton
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={handleApplyEdit}
                disabled={editApplying}
              >
                {editApplying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Apply
              </UIButton>
              <UIButton
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setEditModalOpen(false);
                  setEditCacheKey(null);
                  setEditDraftContent("");
                }}
              >
                Cancel
              </UIButton>
            </>
          )}
          <UIButton variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <ZoomOut className="h-3.5 w-3.5" />
          </UIButton>
        </div>
      </div>

      {/* Content Area - Scrollable (view content or inline edit) */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 pt-4 space-y-4">
        {editModalOpen ? (
          /* Inline edit in right pane (no modal) */
          <div className="flex flex-col gap-4 h-full min-h-0">
            <p className="text-xs text-muted-foreground">
              Changes are saved as a draft. Use &quot;Edit with me&quot; to ask the LLM to revise, or click Apply to update the artifact.
            </p>
            <div className="flex flex-col gap-2 rounded border border-border bg-muted/20 p-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Edit with me</span>
              <div className="flex gap-2">
                <input
                  className="flex-1 min-w-0 rounded border bg-background px-2 py-1.5 text-sm placeholder:text-muted-foreground"
                  placeholder="e.g. make the BMS section more detailed"
                  value={reviseInstruction}
                  onChange={(e) => setReviseInstruction(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleReviseFromDraft()}
                />
                <UIButton
                  variant="secondary"
                  size="sm"
                  onClick={handleReviseFromDraft}
                  disabled={reviseLoading || !reviseInstruction.trim()}
                >
                  {reviseLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
                  Revise
                </UIButton>
              </div>
            </div>
            <textarea
              className="w-full flex-1 min-h-[200px] rounded border bg-muted/30 px-3 py-2 text-sm font-mono whitespace-pre-wrap resize-y"
              value={editDraftContent}
              onChange={(e) => setEditDraftContent(e.target.value)}
              spellCheck="false"
            />
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : historicalContent ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-blue-500 uppercase">Historical Preview</span>
              <UIButton 
                variant="ghost" 
                size="sm" 
                className="h-6 text-[9px]" 
                onClick={() => {
                  setHistoricalContent(null);
                  setSelectedVersion(null);
                }}
              >
                Back to Current
              </UIButton>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 border border-border">
              <div className="prose prose-invert prose-xs max-h-[40vh] overflow-y-auto whitespace-pre-wrap text-[11px] font-mono leading-relaxed">
                {historicalContent}
              </div>
            </div>
          </div>
        ) : content ? (
          <>
            {/* Render content using appropriate renderer (pass node name as filename fallback for binary) */}
            <div className="content-renderer-wrapper min-h-0">
              {renderer?.render(content.content, {
                ...content.metadata,
                filename: content.metadata?.filename || (node as { name?: string }).name,
              })}
            </div>

            {/* Properties */}
            {node.properties && Object.keys(node.properties).length > 0 && (
              <div className="space-y-2 pt-4 border-t border-border">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">Technical Specs</span>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(node.properties).slice(0, 4).map(([k, v]) => (
                    <div key={k} className="bg-muted rounded p-2">
                      <div className="text-[9px] text-muted-foreground uppercase">{k}</div>
                      <div className="text-[10px] text-foreground truncate">{String(v)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Version History */}
            {node.type === 'ARTIFACT' && artifactHistory && artifactHistory.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex items-center gap-2">
                  <Activity className="w-3 h-3 text-blue-500" />
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Version History</span>
                </div>
                <div className="space-y-1.5">
                  {artifactHistory.map((v: any) => (
                    <div
                      key={v.id}
                      className={cn(
                        "flex items-center justify-between p-2 rounded bg-muted/30 hover:bg-muted transition-colors cursor-pointer group",
                        selectedVersion === v.id && "bg-muted border border-primary"
                      )}
                      onClick={async () => {
                        setSelectedVersion(v.id);
                        // Fetch historical version content
                        try {
                          const orgContext = localStorage.getItem('reflexion_org_context');
                          const headers: Record<string, string> = {};
                          if (orgContext) headers['X-Organization-Context'] = orgContext;

                          let url = `/api/artifact/content?node_id=${node.id}&version=${v.id}`;
                          if (threadId) url += `&thread_id=${threadId}`;

                          const res = await fetch(url, { headers });
                          if (res.ok) {
                            const data = await res.json();
                            setHistoricalContent(data.content);
                          }
                        } catch (err) {
                          console.error("[NodeDetailPanel] Error fetching historical version:", err);
                        }
                      }}
                    >
                      <div className="flex flex-col">
                        <span className="text-[10px] font-medium text-foreground">{v.id}</span>
                        <span className="text-[9px] text-muted-foreground">{v.timestamp}</span>
                      </div>
                      <UIButton variant="ghost" size="sm" className="h-6 px-2 text-[9px] opacity-0 group-hover:opacity-100 transition-opacity">
                        View
                      </UIButton>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {node.description || "No detailed description available for this node."}
          </p>
        )}
      </div>
    </div>
  );
}
