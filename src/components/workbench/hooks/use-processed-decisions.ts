/**
 * Processed decisions (approved/rejected) per thread.
 * Loads from backend GET /decisions when available (GitHub persistence); falls back to localStorage.
 * New decisions are persisted via POST /decisions from approval-card and added locally here.
 * Resolves threadId to project id when it is a project name so GET/POST always use id.
 */
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY_PREFIX = "reflexion_processed_decisions_";
const MAX_ITEMS = 500;

export interface ProcessedDecision {
  id: string;
  type: string;
  title: string;
  status: "approved" | "rejected";
  timestamp: number;
  /** KG version (commit sha) produced by this decision; enables KG diff view and history navigation */
  kg_version_sha?: string;
  /** Preview data (diff, decision_summary, impact_forecast, etc.) for decision context on processed decisions (approved or rejected) */
  preview_data?: Record<string, unknown>;
}

/** Backend DecisionRecord shape (GET /decisions response item). */
interface DecisionRecord {
  id: string;
  type: string;
  title: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  cache_key?: string;
  generation_inputs?: Record<string, unknown>;
  option_index?: number;
  artifact_id?: string;
  args?: Record<string, unknown>;
  kg_version_sha?: string;
}

interface ProjectListItem {
  id: string;
  name: string;
}

const FETCH_TIMEOUT_MS = 20_000;

function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: ac.signal }).finally(() => clearTimeout(timeoutId));
}

/** Resolve threadId to project id: if it's a project name (matches name but not id), return that project's id. */
async function resolveThreadIdToProjectId(threadId: string | undefined): Promise<string | undefined> {
  if (typeof window === "undefined" || !threadId?.trim()) return threadId;
  try {
    const orgContext = localStorage.getItem("reflexion_org_context");
    const headers: Record<string, string> = {};
    if (orgContext) headers["X-Organization-Context"] = orgContext;
    const res = await fetchWithTimeout("/api/projects", { headers });
    if (!res.ok) return threadId;
    const projects = (await res.json()) as ProjectListItem[];
    if (!Array.isArray(projects)) return threadId;
    const byId = projects.find((p) => p.id === threadId);
    if (byId) return threadId;
    const byName = projects.find((p) => p.name === threadId);
    if (byName) return byName.id;
    return threadId;
  } catch {
    return threadId;
  }
}

function getStorageKey(threadId: string | undefined): string {
  return threadId ? `${STORAGE_KEY_PREFIX}${threadId}` : `${STORAGE_KEY_PREFIX}default`;
}

function loadFromStorage(threadId: string | undefined): ProcessedDecision[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getStorageKey(threadId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProcessedDecision[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapRecordToProcessed(r: DecisionRecord): ProcessedDecision {
  const iso = r.updated_at ?? r.created_at;
  const timestamp = iso ? new Date(iso).getTime() : Date.now();
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    status: r.status === "approved" || r.status === "rejected" ? r.status : "rejected",
    timestamp,
    ...(r.kg_version_sha != null ? { kg_version_sha: r.kg_version_sha } : {}),
    ...(r.args?.preview_data != null ? { preview_data: r.args.preview_data as Record<string, unknown> } : {}),
  };
}

async function loadFromApi(projectId: string | undefined): Promise<ProcessedDecision[] | null> {
  if (typeof window === "undefined" || !projectId) return null;
  try {
    const params = new URLSearchParams({ thread_id: projectId });
    const headers: Record<string, string> = {};
    const orgContext = localStorage.getItem("reflexion_org_context");
    if (orgContext) headers["X-Organization-Context"] = orgContext;
    const res = await fetchWithTimeout(`/api/decisions?${params}`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    const list = Array.isArray(data) ? data : [];
    // Only include approved/rejected; pending decisions belong in the pending list, not processed (they were wrongly shown as "rejected" before)
    const processedOnly = list.filter(
      (r): r is DecisionRecord =>
        r && typeof r.id === "string" && (r.status === "approved" || r.status === "rejected")
    );
    return processedOnly.map(mapRecordToProcessed);
  } catch (e) {
    if ((e as Error)?.name === "AbortError") {
      console.warn("[useProcessedDecisions] Decisions request timed out");
    } else {
      console.warn("[useProcessedDecisions] Load from API failed", e);
    }
    return null;
  }
}

export function useProcessedDecisions(threadId: string | undefined): {
  processed: ProcessedDecision[];
  addProcessed: (decision: ProcessedDecision) => void;
  clearProcessed: () => void;
  isLoading: boolean;
  refetch: () => Promise<void>;
} {
  const [processed, setProcessed] = useState<ProcessedDecision[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [resolvedId, setResolvedId] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    if (!threadId) {
      setResolvedId(undefined);
      setProcessed(loadFromStorage(undefined));
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const projectId = await resolveThreadIdToProjectId(threadId);
    setResolvedId(projectId);
    const fromApi = await loadFromApi(projectId);
    if (fromApi !== null) {
      setProcessed(fromApi);
    } else {
      setProcessed(loadFromStorage(projectId));
    }
    setIsLoading(false);
  }, [threadId]);

  useEffect(() => {
    load();
  }, [load]);

  const addProcessed = useCallback(
    (decision: ProcessedDecision) => {
      const entry: ProcessedDecision = {
        ...decision,
        timestamp: decision.timestamp || Date.now(),
      };
      setProcessed((prev) => {
        const next = [entry, ...prev.filter((p) => p.id !== entry.id)].slice(0, MAX_ITEMS);
        try {
          const keyId = resolvedId ?? threadId;
          localStorage.setItem(getStorageKey(keyId), JSON.stringify(next));
        } catch (e) {
          console.warn("[useProcessedDecisions] localStorage setItem failed", e);
        }
        return next;
      });
    },
    [resolvedId, threadId]
  );

  const clearProcessed = useCallback(() => {
    setProcessed([]);
    try {
      const keyId = resolvedId ?? threadId;
      localStorage.removeItem(getStorageKey(keyId));
    } catch (e) {
      console.warn("[useProcessedDecisions] localStorage removeItem failed", e);
    }
  }, [resolvedId, threadId]);

  return { processed, addProcessed, clearProcessed, isLoading, refetch: load };
}
