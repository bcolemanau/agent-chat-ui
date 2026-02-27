"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { ZoomOut, Activity, Loader2, Pencil, CheckCircle2, Link2, Eye, FileCode, Settings2 } from "lucide-react";
import { Button as UIButton } from "@/components/ui/button";
import { contentRendererRegistry } from "./content-renderers";
// Import renderers to ensure they register themselves
import "./content-renderers/markdown-renderer";
import "./content-renderers/text-renderer";
import "./content-renderers/binary-renderer";
import { BacklogRenderer } from "./content-renderers/backlog-renderer";
import { ConnectorConfigModal } from "./connector-config";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useStreamContext } from "@/providers/Stream";
import { useArtifactContext } from "@/components/thread/artifact";
import { apiFetch } from "@/lib/api-fetch";
import { useOrgContext } from "@/hooks/use-org-context";
import { useRouteScope } from "@/hooks/use-route-scope";

interface Node {
  id: string;
  name: string;
  type: string;
  description?: string;
  properties?: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * Shared detail view for a single node: used when selecting a node on the map view
 * or in the artifacts list (artifact pane). Shows content, history, and an Edit
 * button for editable ARTIFACT nodes (draft or accepted with artifact_id).
 */
interface NodeDetailPanelProps {
  node: Node | null;
  onClose: () => void;
  position?: "left" | "right" | "bottom";
  threadId?: string | null;
  /** When the map is showing a specific KG version (timeline/compare), pass it so content is loaded from that version. */
  contentVersion?: string | null;
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
  threadId,
  contentVersion,
}: NodeDetailPanelProps) {
  const stream = useStreamContext();
  const { orgId: orgContextId } = useOrgContext();
  const { projectId: projectIdFromRoute, orgId: orgIdFromRoute } = useRouteScope();
  const scopeProjectId = projectIdFromRoute ?? undefined;
  const scopeOrgId = orgIdFromRoute ?? undefined;
  const [artifactContext, setArtifactContext] = useArtifactContext();
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
  // Preview mode in edit: show rendered MD instead of raw textarea
  const [editPreviewMode, setEditPreviewMode] = useState(false);
  // Insert reference picker (KG primitives for edit mode)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerNodes, setPickerNodes] = useState<Array<{ id: string; type: string; label: string; snippet?: string | null }>>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerLinking, setPickerLinking] = useState(false);
  const [connectorConfigOpen, setConnectorConfigOpen] = useState(false);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const { data: session } = useSession();
  const isAdmin =
    session?.user?.role === "reflexion_admin" ||
    session?.user?.role === "admin" ||
    session?.user?.role === "newco_admin" ||
    (session?.user?.role as string)?.toLowerCase() === "customeradministrator";
  const pendingCursorRef = useRef<number | null>(null);
  const lastAppliedReviseIdRef = useRef<string | null>(null);

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
        const params = new URLSearchParams({ node_id: node.id });
        if (threadId) params.set("thread_id", threadId);
        // Prefer panel history selection; else use map's active KG version so content matches the versioned view
        const versionToSend = selectedVersion ?? contentVersion ?? undefined;
        if (versionToSend) params.set("version", versionToSend);
        if (scopeProjectId) params.set("project_id", scopeProjectId);
        if (scopeOrgId) params.set("org_id", scopeOrgId);
        // Backend requires project_id or phase_id for scope; when on org-only map pass phase_id=orgId
        if (!scopeProjectId && scopeOrgId) params.set("phase_id", scopeOrgId);
        const url = `/api/artifact/content?${params.toString()}`;

        console.log("[NodeDetailPanel] [BRANCH] Fetching content from URL:", url);
        const res = await apiFetch(url);
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          const detail = (errBody as { detail?: string }).detail ?? (errBody as { error?: string }).error ?? res.statusText;
          console.error("[NodeDetailPanel] [BRANCH] Fetch failed:", res.status, detail);
          throw new Error(detail || `Failed to fetch content: ${res.statusText}`);
        }

        const data = await res.json();
        console.log("[NodeDetailPanel] [BRANCH] Content received:", { 
          contentType: data.content_type, 
          contentLength: data.content?.length || 0,
          hasMetadata: !!data.metadata 
        });
        // #region agent log
        fetch('http://127.0.0.1:7258/ingest/16055c50-e65a-4462-80f9-391ad899946b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9026f6'},body:JSON.stringify({sessionId:'9026f6',location:'node-detail-panel.tsx:fetchContent',message:'Content fetch result',data:{node_id:node.id,threadId:threadId??null,scopeProjectId:scopeProjectId??null,contentLength:data.content?.length??0,contentType:data.content_type,hasContent:!!(data.content&&String(data.content).trim())},hypothesisId:'H1,H2,H3',timestamp:Date.now()})}).catch(()=>{});
        // #endregion
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
  }, [node, threadId, selectedVersion, contentVersion, scopeProjectId, scopeOrgId]);

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
        const params = new URLSearchParams({ node_id: node.id });
        if (threadId) params.set("thread_id", threadId);
        if (scopeProjectId) params.set("project_id", scopeProjectId);
        if (scopeOrgId) params.set("org_id", scopeOrgId);
        const url = `/api/artifact/history?${params.toString()}`;

        console.log("[NodeDetailPanel] [BRANCH] Fetching history from URL:", url);
        const res = await apiFetch(url);
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
  }, [node, threadId, scopeProjectId, scopeOrgId]);

  // Fetch nodes for reference picker (edit mode) — hooks must be before any early return
  const fetchPickerNodes = useCallback(async () => {
    setPickerLoading(true);
    try {
      const params = new URLSearchParams();
      if (threadId) params.set("thread_id", threadId);
      if (scopeProjectId) params.set("project_id", scopeProjectId);
      if (scopeOrgId) params.set("org_id", scopeOrgId);
      if (node?.id) params.set("source_node_id", node.id);
      if (pickerSearch.trim()) params.set("search", pickerSearch.trim());
      const url = `/api/kg/nodes-for-picker?${params.toString()}`;
      const res = await apiFetch(url);
      if (!res.ok) throw new Error("Failed to load nodes");
      const data = (await res.json()) as { nodes?: Array<{ id: string; type: string; label: string; snippet?: string | null }> };
      setPickerNodes(data.nodes ?? []);
    } catch (e) {
      toast.error("Error", { description: e instanceof Error ? e.message : "Failed to load nodes" });
      setPickerNodes([]);
    } finally {
      setPickerLoading(false);
    }
  }, [threadId, scopeProjectId, scopeOrgId, node?.id, pickerSearch]);

  useEffect(() => {
    if (!pickerOpen) return;
    const delay = pickerSearch.trim() ? 300 : 0;
    const t = setTimeout(() => fetchPickerNodes(), delay);
    return () => clearTimeout(t);
  }, [pickerOpen, pickerSearch, fetchPickerNodes]);

  // Restore cursor after inserting reference token
  useEffect(() => {
    if (pendingCursorRef.current != null && editTextareaRef.current) {
      editTextareaRef.current.focus();
      editTextareaRef.current.setSelectionRange(pendingCursorRef.current, pendingCursorRef.current);
      pendingCursorRef.current = null;
    }
  }, [editDraftContent]);

  // Apply revise result from agent chat to the open draft (main-agent collaboration). Must run before early return.
  const streamMessages = (stream as { values?: { messages?: unknown[] } })?.values?.messages;
  useEffect(() => {
    if (!editModalOpen || !editCacheKey) return;
    const messages = Array.isArray(streamMessages) ? streamMessages : [];
    if (messages.length === 0) return;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const type = (msg as { type?: string }).type;
      const toolCallId = (msg as { tool_call_id?: string }).tool_call_id;
      if (type === "tool" && toolCallId) {
        const raw = (msg as { content?: string | object }).content;
        let parsed: { success?: boolean; content?: string };
        try {
          parsed = typeof raw === "string" ? JSON.parse(raw) : typeof raw === "object" && raw !== null ? (raw as { success?: boolean; content?: string }) : {};
        } catch {
          continue;
        }
        if (!parsed?.success || typeof parsed.content !== "string") continue;
        // Check this ToolMessage is for revise by finding preceding AI tool_calls
        let isRevise = false;
        for (let j = i - 1; j >= 0; j--) {
          const prev = messages[j];
          if ((prev as { type?: string }).type === "ai") {
            const toolCalls = (prev as { tool_calls?: Array<{ id?: string; name?: string }> }).tool_calls;
            const tc = toolCalls?.find((t) => (t as { id?: string }).id === toolCallId);
            if (tc && (tc as { name?: string }).name === "revise") {
              isRevise = true;
              break;
            }
            break;
          }
        }
        if (!isRevise) continue;
        if (lastAppliedReviseIdRef.current === toolCallId) break;
        lastAppliedReviseIdRef.current = toolCallId;
        setEditDraftContent(parsed.content);
        setEditPreviewMode(false);
        toast.success("Draft updated from Agent Chat");
        setTimeout(() => editTextareaRef.current?.focus(), 0);
        break;
      }
    }
  }, [streamMessages, editModalOpen, editCacheKey]);

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
      const res = await apiFetch("/api/artifact/draft-from-existing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          node_id: node.id,
          thread_id: threadId ?? undefined,
          project_id: scopeProjectId ?? undefined,
          phase_id: scopeProjectId ?? undefined,
          org_id: scopeOrgId ?? undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((err as { error?: string }).error ?? "Failed to start edit");
      }
      const data = (await res.json()) as { draft_cache_key: string; content: string };
      setEditCacheKey(data.draft_cache_key);
      setEditDraftContent(data.content ?? "");
      setEditPreviewMode(false);
      lastAppliedReviseIdRef.current = null;
      setEditModalOpen(true);
      setArtifactContext((prev) => ({
        ...prev,
        editing_artifact: {
          node_id: node.id,
          cache_key: data.draft_cache_key,
          artifact_name: (node as { name?: string }).name ?? node.id,
        },
      }));
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
        body: JSON.stringify({
          cache_key: editCacheKey,
          thread_id: threadId ?? undefined,
          content: editDraftContent,
          project_id: scopeProjectId ?? undefined,
          phase_id: scopeProjectId ?? undefined,
          org_id: scopeOrgId ?? undefined,
        }),
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
    return "concept_brief"; // fallback when type cannot be inferred from node
  };

  const handleApplyEdit = async () => {
    if (!node || !editCacheKey) return;
    setEditApplying(true);
    try {
      const res = await apiFetch("/api/artifact/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cache_key: editCacheKey,
          option_index: 0,
          thread_id: threadId ?? undefined,
          project_id: scopeProjectId ?? undefined,
          artifact_type: artifactTypeForApply(),
          source_node_id: node.id,
          draft_content: editDraftContent,
          propose_only: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error((err as { detail?: string }).detail ?? "Failed to submit edit proposal");
      }
      toast.success("Proposal submitted", {
        description: "Approve in Decisions to update the artifact and bump version.",
      });
      setEditModalOpen(false);
      setEditCacheKey(null);
      setEditDraftContent("");
      setArtifactContext((prev) => {
        const next = { ...prev };
        delete (next as Record<string, unknown>).editing_artifact;
        return next;
      });
      onClose();
      (stream as any)?.triggerWorkbenchRefresh?.();
    } catch (e) {
      toast.error("Error", { description: e instanceof Error ? e.message : "Failed to apply edit" });
    } finally {
      setEditApplying(false);
    }
  };

  const handleInsertReference = (selected: { id: string; type: string; label: string }) => {
    const ta = editTextareaRef.current;
    const start = ta?.selectionStart ?? editDraftContent.length;
    const end = ta?.selectionEnd ?? editDraftContent.length;
    const token = `[[${selected.id}]]`;
    const newContent = editDraftContent.slice(0, start) + token + editDraftContent.slice(end);
    pendingCursorRef.current = start + token.length;
    setEditDraftContent(newContent);
    setPickerOpen(false);
    setPickerSearch("");
    // Create KG link: artifact (source) -> selected node (target)
    if (node?.id && selected.id !== node.id) {
      setPickerLinking(true);
      apiFetch("/api/kg/link-nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_id: node.id,
          target_id: selected.id,
          link_type: "REFERENCES",
          thread_id: threadId ?? undefined,
          project_id: scopeProjectId ?? undefined,
          org_id: scopeOrgId ?? undefined,
        }),
      })
        .then((res) => {
          if (!res.ok) throw new Error("Failed to create link");
          toast.success("Reference added and linked in graph");
        })
        .catch(() => toast.error("Reference inserted; link could not be saved"))
        .finally(() => setPickerLinking(false));
    } else {
      toast.success("Reference inserted");
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
        "h-full w-full min-h-0 flex flex-col bg-background",
        position === "left" ? "border-r border-border" : position === "bottom" ? "border-t border-border" : "border-l border-border"
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header - Fixed at top of panel; only the content area below scrolls */}
      <div className="flex-shrink-0 flex justify-between items-start p-5 pb-4 border-b border-border bg-background z-10 shadow-[0_1px_0_0_var(--border)]">
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
                variant={editPreviewMode ? "secondary" : "outline"}
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => setEditPreviewMode((v) => !v)}
                title={editPreviewMode ? "Show source" : "Preview rendered markdown"}
              >
                {editPreviewMode ? <FileCode className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {editPreviewMode ? "Edit" : "Preview"}
              </UIButton>
              <UIButton
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={handleSaveDraft}
                disabled={editSaving}
              >
                {editSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Save as Draft
              </UIButton>
              <UIButton
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={handleApplyEdit}
                disabled={editApplying}
                title="Send for approval"
              >
                {editApplying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Propose
              </UIButton>
              <UIButton
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setEditModalOpen(false);
                  setEditCacheKey(null);
                  setEditDraftContent("");
                  setEditPreviewMode(false);
                  setArtifactContext((prev) => {
                    const next = { ...prev };
                    delete (next as Record<string, unknown>).editing_artifact;
                    return next;
                  });
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

      {/* Content Area - Scrollable (view content or inline edit); overflow-y-auto + overflow-x-auto so scrollbar shows when content overflows (all artifact types) */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto overscroll-contain p-5 pt-4 pb-10 space-y-4">
        {editModalOpen ? (
          /* Inline edit in right pane (no modal); Preview toggles to rendered MD */
          <div className="flex flex-col gap-4 h-full min-h-0">
            {editPreviewMode ? (
              <>
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Preview (as it will look once approved)</p>
                <div className="content-renderer-wrapper min-h-0 flex-1 rounded border border-border bg-muted/10 p-4 overflow-y-auto">
                  {(() => {
                    const mdRenderer = contentRendererRegistry.get("markdown") || contentRendererRegistry.get("text");
                    return mdRenderer?.render(editDraftContent || "", { filename: (node as { name?: string }).name }) ?? (
                      <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground">{editDraftContent || "(empty)"}</pre>
                    );
                  })()}
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Use &quot;Save as Draft&quot; to keep changes locally, or &quot;Propose&quot; to send for approval (then approve in Decisions to update the artifact). Ask in <strong>Agent Chat</strong> to revise this draft (e.g. &quot;make the BMS section more detailed&quot;); the agent will update the draft here.
                </p>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <UIButton
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={() => setPickerOpen((open) => !open)}
                      disabled={pickerLinking}
                    >
                      {pickerLinking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                      Insert reference
                    </UIButton>
                  </div>
                  {pickerOpen && (
                    <div className="rounded border border-border bg-muted/20 p-2 flex flex-col gap-2 max-h-[220px]">
                      <input
                        className="w-full rounded border bg-background px-2 py-1.5 text-sm placeholder:text-muted-foreground"
                        placeholder="Search nodes..."
                        value={pickerSearch}
                        onChange={(e) => setPickerSearch(e.target.value)}
                        onKeyDown={(e) => e.key === "Escape" && setPickerOpen(false)}
                      />
                      <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
                        {pickerLoading ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : pickerNodes.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2">No nodes found. Try a different search.</p>
                        ) : (
                          pickerNodes.map((n) => (
                            <button
                              key={n.id}
                              type="button"
                              className="w-full text-left rounded px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors flex flex-col gap-0.5"
                              onClick={() => handleInsertReference(n)}
                            >
                              <span className="font-medium text-foreground">{n.label}</span>
                              <span className="text-[10px] text-muted-foreground">{n.type}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <textarea
                  ref={editTextareaRef}
                  className="w-full flex-1 min-h-[200px] rounded border bg-muted/30 px-3 py-2 text-sm font-mono whitespace-pre-wrap resize-y"
                  value={editDraftContent}
                  onChange={(e) => setEditDraftContent(e.target.value)}
                  spellCheck="false"
                />
              </>
            )}
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg space-y-2">
            <p className="text-sm text-destructive">{error}</p>
            {(!scopeProjectId && !scopeOrgId) || /scope|project_id|phase_id/i.test(error) ? (
              <p className="text-xs text-muted-foreground">
                Open this project from the project map (e.g. org → project → map) so artifact content can load with the correct scope.
              </p>
            ) : null}
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
            {content.content != null && String(content.content).trim() ? (
              <div className="content-renderer-wrapper min-h-0">
                {renderer?.render(content.content, {
                  ...content.metadata,
                  filename: content.metadata?.filename || (node as { name?: string }).name,
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground leading-relaxed">
                No content available for this artifact. The content may not have been stored yet, or the artifact may be metadata-only.
              </p>
            )}

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
                        try {
                          const params = new URLSearchParams({ node_id: node.id, version: v.id });
                          if (threadId) params.set("thread_id", threadId);
                          if (scopeProjectId) params.set("project_id", scopeProjectId);
                          if (scopeOrgId) params.set("org_id", scopeOrgId);
                          const res = await apiFetch(`/api/artifact/content?${params.toString()}`);
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

            {/* Backlog (connector-linked issues, Issue 154) */}
            {node.type === "ARTIFACT" && content && (
              <div className="space-y-2 pt-4 border-t border-border">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <BacklogRenderer
                    artifactId={node.id}
                    threadId={threadId}
                    orgId={orgContextId}
                    projectId={scopeProjectId}
                    />
                  </div>
                  {isAdmin && (
                    <UIButton
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs shrink-0"
                      onClick={() => setConnectorConfigOpen(true)}
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                      Configure connector
                    </UIButton>
                  )}
                </div>
                {isAdmin && (
                  <ConnectorConfigModal
                    open={connectorConfigOpen}
                    onOpenChange={setConnectorConfigOpen}
                    artifactId={node.id}
                    threadId={threadId}
                    orgId={orgContextId}
                    projectId={scopeProjectId}
                    onSuccess={() => {
                      setConnectorConfigOpen(false);
                      (stream as { triggerWorkbenchRefresh?: () => void })?.triggerWorkbenchRefresh?.();
                    }}
                  />
                )}
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
