/**
 * Processed decisions (approved/rejected) per thread.
 * Loads from backend GET /decisions when available (GitHub persistence); falls back to localStorage.
 * New decisions are persisted via POST /decisions from approval-card and added locally here.
 * Resolves threadId to project id when it is a project name so GET/POST always use id.
 */
import { useCallback, useEffect, useState } from "react";
import { inferPhaseFromType } from "@/lib/decision-types";

const STORAGE_KEY_PREFIX = "reflexion_processed_decisions_";
const MAX_ITEMS = 500;
/** Cap items stored in localStorage to avoid QuotaExceededError (~5MB limit). Omit preview_data; keep only recent. */
const MAX_STORAGE_ITEMS = 80;
/** Max chars per stored item (title + outcome_description) to avoid single huge entries. */
const MAX_CHARS_PER_ITEM = 800;

export interface ProcessedDecision {
  id: string;
  type: string;
  title: string;
  status: "approved" | "rejected";
  timestamp: number;
  /** Phase from fork metadata: "Organization" | "Project" (backend stores on each decision) */
  phase?: "Organization" | "Project";
  /** KG version (commit sha) produced by this decision; enables KG diff view and history navigation */
  kg_version_sha?: string;
  /** Proposal KG commit SHA when decision was rejected or still pending; use for diff view */
  proposed_kg_version_sha?: string;
  /** Short outcome text shown in Decisions pane (e.g. "Artifact edit applied, draft removed.") */
  outcome_description?: string;
  /** Preview data (diff, decision_summary, impact_forecast, etc.) for decision context on processed decisions (approved or rejected) */
  preview_data?: Record<string, unknown>;
  /** Original decision args (artifact_id, cycle_id, preview_data.filename) for table display: subject + enrichment cycle label */
  args?: Record<string, unknown>;
  /** True when this decision type concludes the phase (thread boundary); show "Phase boundary" badge */
  is_phase_change?: boolean;
}

/** Backend DecisionRecord shape (GET /decisions response item). */
interface DecisionRecord {
  id: string;
  type: string;
  title: string;
  status: string;
  phase?: "Organization" | "Project";
  created_at?: string;
  updated_at?: string;
  cache_key?: string;
  generation_inputs?: Record<string, unknown>;
  option_index?: number;
  artifact_id?: string;
  args?: Record<string, unknown>;
  kg_version_sha?: string;
  proposed_kg_version_sha?: string;
  is_phase_change?: boolean;
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

/** Slim representation for localStorage: omit preview_data and truncate long text to avoid QuotaExceededError. */
function toStorageFormat(items: ProcessedDecision[]): ProcessedDecision[] {
  return items.slice(0, MAX_STORAGE_ITEMS).map(({ preview_data: _pd, title, outcome_description, ...rest }) => {
    const t = typeof title === "string" && title.length > MAX_CHARS_PER_ITEM ? title.slice(0, MAX_CHARS_PER_ITEM) + "…" : title;
    const o = typeof outcome_description === "string" && outcome_description.length > MAX_CHARS_PER_ITEM ? outcome_description.slice(0, MAX_CHARS_PER_ITEM) + "…" : outcome_description;
    return { ...rest, title: t, outcome_description: o } as ProcessedDecision;
  });
}

function persistToStorage(keyId: string | undefined, items: ProcessedDecision[]): void {
  if (typeof window === "undefined" || !keyId) return;
  const key = getStorageKey(keyId);
  const slim = toStorageFormat(items);
  try {
    localStorage.setItem(key, JSON.stringify(slim));
  } catch (e) {
    if ((e as DOMException)?.name === "QuotaExceededError" && slim.length > 20) {
      const trimmed = toStorageFormat(items.slice(0, 20));
      try {
        localStorage.setItem(key, JSON.stringify(trimmed));
      } catch (e2) {
        console.warn("[useProcessedDecisions] localStorage setItem failed after trim", e2);
      }
    } else {
      console.warn("[useProcessedDecisions] localStorage setItem failed", e);
    }
  }
}

/** Phase from API when present; infer from type for legacy records (schema-driven fallback). */
function mapRecordToProcessed(r: DecisionRecord): ProcessedDecision {
  const iso = r.updated_at ?? r.created_at;
  const timestamp = iso ? new Date(iso).getTime() : Date.now();
  const phase =
    (r.phase as "Organization" | "Project") ?? inferPhaseFromType(r.type || "");
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    status: r.status === "approved" || r.status === "rejected" ? r.status : "rejected",
    timestamp,
    phase,
    ...(r.kg_version_sha != null ? { kg_version_sha: r.kg_version_sha } : {}),
    ...(r.proposed_kg_version_sha != null ? { proposed_kg_version_sha: r.proposed_kg_version_sha } : {}),
    ...(r.args?.preview_data != null ? { preview_data: r.args.preview_data as Record<string, unknown> } : {}),
    ...(r.args != null ? { args: r.args } : {}),
    ...(r.is_phase_change != null ? { is_phase_change: r.is_phase_change } : {}),
  };
}

/** Org-phase lineage snapshot (decisions that produced OrgKG at fork time). Epic #139 §0.8 */
export interface OrgPhaseLineage {
  organization_kg_version?: string;
  decisions?: Array<{ id: string; type: string; title: string; status: string; phase?: "Organization" | "Project" }>;
}

async function loadFromApi(
  projectId: string | undefined,
  orgId: string | undefined
): Promise<{ processed: ProcessedDecision[]; orgPhase: OrgPhaseLineage | null } | null> {
  if (typeof window === "undefined" || !projectId || !orgId) return null;
  try {
    const params = new URLSearchParams({ project_id: projectId, org_id: orgId });
    const headers: Record<string, string> = {};
    const orgContext = localStorage.getItem("reflexion_org_context");
    if (orgContext) headers["X-Organization-Context"] = orgContext;
    console.info("[useProcessedDecisions] GET /api/decisions", {
      project_id: projectId,
      org_id: orgId,
      orgContext: orgContext ?? "(none)",
      url: `/api/decisions?${params}`,
    });
    const res = await fetchWithTimeout(`/api/decisions?${params}`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data?.decisions ?? []);
    const orgPhase = data?.org_phase ?? null;
    // Only include approved/rejected; pending decisions belong in the pending list, not processed (they were wrongly shown as "rejected" before)
    const processedOnly = list.filter(
      (r: unknown): r is DecisionRecord =>
        r != null &&
        typeof r === "object" &&
        "id" in r &&
        typeof (r as DecisionRecord).id === "string" &&
        ((r as DecisionRecord).status === "approved" || (r as DecisionRecord).status === "rejected")
    );
    return {
      processed: processedOnly.map(mapRecordToProcessed),
      orgPhase: orgPhase as OrgPhaseLineage | null,
    };
  } catch (e) {
    if ((e as Error)?.name === "AbortError") {
      console.warn("[useProcessedDecisions] Decisions request timed out");
    } else {
      console.warn("[useProcessedDecisions] Load from API failed", e);
    }
    return null;
  }
}

/** Scope from URL only (projectId, orgId). No thread-as-scope fallback. */
export function useProcessedDecisions(projectId: string | undefined, orgId: string | undefined): {
  processed: ProcessedDecision[];
  orgPhase: OrgPhaseLineage | null;
  addProcessed: (decision: ProcessedDecision) => void;
  clearProcessed: () => void;
  isLoading: boolean;
  refetch: () => Promise<void>;
} {
  const [processed, setProcessed] = useState<ProcessedDecision[]>([]);
  const [orgPhase, setOrgPhase] = useState<OrgPhaseLineage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [resolvedId, setResolvedId] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    if (!projectId) {
      setResolvedId(undefined);
      setProcessed(loadFromStorage(undefined));
      setOrgPhase(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setResolvedId(projectId);
    const fromApi = await loadFromApi(projectId, orgId);
    if (fromApi !== null) {
      setProcessed(fromApi.processed);
      setOrgPhase(fromApi.orgPhase);
    } else {
      setProcessed(loadFromStorage(projectId));
      setOrgPhase(null);
    }
    setIsLoading(false);
  }, [projectId, orgId]);

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
        persistToStorage(resolvedId ?? projectId, next);
        return next;
      });
    },
    [resolvedId, projectId]
  );

  const clearProcessed = useCallback(() => {
    setProcessed([]);
    try {
      const keyId = resolvedId ?? projectId;
      localStorage.removeItem(getStorageKey(keyId));
    } catch (e) {
      console.warn("[useProcessedDecisions] localStorage removeItem failed", e);
    }
  }, [resolvedId, projectId]);

  return { processed, orgPhase, addProcessed, clearProcessed, isLoading, refetch: load };
}
