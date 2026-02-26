/**
 * Load pending decisions from GET /decisions (persisted to GitHub + Redis).
 * Converts records with status "pending" to UnifiedPreviewItem so the Decisions panel
 * can show them without relying on stream/refetch timing.
 */
import { useCallback, useEffect, useState } from "react";
import type { UnifiedPreviewItem } from "./use-unified-previews";

const FETCH_TIMEOUT_MS = 20_000;

interface DecisionRecord {
  id: string;
  type: string;
  title: string;
  status: string;
  phase?: "Organization" | "Project";
  args?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  /** Commit SHA of the proposal KG (Phase 2); use for diff view when pending/rejected */
  proposed_kg_version_sha?: string;
}

function recordToPreviewItem(record: DecisionRecord, scopeProjectId: string | undefined): UnifiedPreviewItem {
  const args = record.args ?? {};
  const preview_data = args.preview_data as Record<string, unknown> | undefined;
  return {
    id: record.id,
    type: record.type,
    title: record.title,
    summary: (args.model_summary as string) || `${record.type} ready to apply`,
    status: "pending",
    phase: record.phase,
    data: {
      name: record.type,
      args,
      preview_data,
      diff: preview_data?.diff,
      proposed_kg_version_sha: record.proposed_kg_version_sha,
    },
    threadId: scopeProjectId,
    fromMessages: true,
  };
}

/** Scope from URL only (projectId, orgId). No thread-as-scope fallback. */
export function usePendingDecisions(projectId: string | undefined, orgId: string | undefined): {
  pending: UnifiedPreviewItem[];
  isLoading: boolean;
  refetch: () => Promise<void>;
} {
  const [pending, setPending] = useState<UnifiedPreviewItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (typeof window === "undefined" || !projectId?.trim() || !orgId?.trim()) {
      setPending([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const ac = new AbortController();
    const timeoutId = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
      const params = new URLSearchParams({ project_id: projectId, org_id: orgId });
      console.info("[usePendingDecisions] fetch", { projectId, orgId, url: `/api/decisions?${params}` });
      const headers: Record<string, string> = {};
      const orgContext = localStorage.getItem("reflexion_org_context");
      if (orgContext) headers["X-Organization-Context"] = orgContext;
      console.info("[usePendingDecisions] GET /api/decisions", {
        project_id: projectId,
        org_id: orgId,
        orgContext: orgContext ?? "(none)",
        url: `/api/decisions?${params}`,
      });
      const res = await fetch(`/api/decisions?${params}`, { signal: ac.signal, headers });
      clearTimeout(timeoutId);
      if (!res.ok) {
        setPending([]);
        return;
      }
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data?.decisions ?? []);
      // Only show current version of each logical decision (exclude superseded old versions)
      const pendingRecords = list.filter(
        (r: DecisionRecord) =>
          r &&
          typeof r.id === "string" &&
          (r.status === "pending" || r.status === "proposed") &&
          !(r as { superseded_by?: string }).superseded_by
      ) as DecisionRecord[];
      setPending(pendingRecords.map((r) => recordToPreviewItem(r, projectId)));
    } catch (e) {
      clearTimeout(timeoutId);
      if ((e as Error)?.name === "AbortError") {
        console.warn("[usePendingDecisions] Request timed out");
      } else {
        console.warn("[usePendingDecisions] Load failed", e);
      }
      setPending([]);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, orgId]);

  useEffect(() => {
    load();
  }, [load]);

  return { pending, isLoading, refetch: load };
}
