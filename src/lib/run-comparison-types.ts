/**
 * Types for run comparison API: GET /threads/{thread_id}/runs/{run_id}/comparison?compare_with_run_id=...
 */

export interface ArtifactDiff {
  artifact_id: string;
  artifact_type?: string;
  status: "added" | "removed" | "modified" | "unchanged";
  changes_summary?: string;
  details?: Record<string, unknown>;
}

export interface NodeDiff {
  node_id: string;
  node_type?: string;
  status: "added" | "removed" | "modified" | "unchanged";
  changes_summary?: string;
  details?: Record<string, unknown>;
}

export interface RunComparison {
  base_run_id: string;
  compare_run_id: string;
  summary: string;
  artifact_diffs?: ArtifactDiff[];
  node_diffs?: NodeDiff[];
  metadata?: Record<string, unknown>;
}

export interface Run {
  run_id: string;
  thread_id: string;
  assistant_id?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  metadata?: Record<string, unknown>;
}
