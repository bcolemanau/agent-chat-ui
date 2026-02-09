"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { RunComparison, Run } from "@/lib/run-comparison-types";
import { GitCompare, AlertCircle } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  added: "text-green-600 dark:text-green-400",
  removed: "text-red-600 dark:text-red-400",
  modified: "text-amber-600 dark:text-amber-400",
  unchanged: "text-muted-foreground",
};

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const orgContext =
    typeof window !== "undefined"
      ? localStorage.getItem("reflexion_org_context")
      : null;
  if (orgContext) headers["X-Organization-Context"] = orgContext;
  return headers;
}

async function fetchRuns(threadId: string): Promise<Run[]> {
  const res = await fetch(
    `/api/threads/${encodeURIComponent(threadId)}/runs?limit=20`,
    { headers: getAuthHeaders(), credentials: "include" }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `Failed to list runs: ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function fetchComparison(
  threadId: string,
  runId: string,
  compareWithRunId: string
): Promise<RunComparison> {
  const url = `/api/threads/${encodeURIComponent(threadId)}/runs/${encodeURIComponent(runId)}/comparison?compare_with_run_id=${encodeURIComponent(compareWithRunId)}`;
  const res = await fetch(url, {
    headers: getAuthHeaders(),
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `Comparison failed: ${res.status}`);
  }
  return res.json();
}

export function RunComparisonModal({
  open,
  onOpenChange,
  threadId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  threadId: string | null;
}) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [currentRunId, setCurrentRunId] = useState<string>("");
  const [compareWithRunId, setCompareWithRunId] = useState<string>("");
  const [comparison, setComparison] = useState<RunComparison | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    if (!threadId || !open) return;
    setRunsLoading(true);
    setRunsError(null);
    try {
      const list = await fetchRuns(threadId);
      setRuns(list);
      // Default: current = latest (first), compare with = previous (second)
      if (list.length >= 2) {
        setCurrentRunId(list[0].run_id);
        setCompareWithRunId(list[1].run_id);
        setComparison(null);
        setComparisonError(null);
      } else if (list.length === 1) {
        setCurrentRunId(list[0].run_id);
        setCompareWithRunId("");
        setComparison(null);
        setComparisonError("Need at least 2 runs to compare.");
      } else {
        setCurrentRunId("");
        setCompareWithRunId("");
        setComparison(null);
        setComparisonError("No runs found for this thread.");
      }
    } catch (e) {
      setRunsError(e instanceof Error ? e.message : "Failed to load runs");
      setRuns([]);
    } finally {
      setRunsLoading(false);
    }
  }, [threadId, open]);

  useEffect(() => {
    if (open && threadId) loadRuns();
  }, [open, threadId, loadRuns]);

  const runCompare = useCallback(async () => {
    if (!threadId || !currentRunId || !compareWithRunId) return;
    setComparisonLoading(true);
    setComparisonError(null);
    try {
      const data = await fetchComparison(
        threadId,
        currentRunId,
        compareWithRunId
      );
      setComparison(data);
    } catch (e) {
      setComparisonError(
        e instanceof Error ? e.message : "Failed to load comparison"
      );
      setComparison(null);
    } finally {
      setComparisonLoading(false);
    }
  }, [threadId, currentRunId, compareWithRunId]);

  const canCompare = runs.length >= 2 && currentRunId && compareWithRunId && currentRunId !== compareWithRunId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5" />
            Compare runs
          </DialogTitle>
          <DialogDescription>
            Compare the current run with a previous run. Summary, artifact diffs, and node diffs are shown below.
          </DialogDescription>
        </DialogHeader>

        {!threadId ? (
          <p className="text-sm text-muted-foreground">
            Open a thread to compare runs.
          </p>
        ) : runsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : runsError ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {runsError}
          </div>
        ) : runs.length < 2 ? (
          <p className="text-sm text-muted-foreground">
            {runs.length === 0
              ? "No runs found for this thread."
              : "Need at least 2 runs to compare."}
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Current run (base)</label>
                <Select
                  value={currentRunId}
                  onValueChange={(v) => {
                    setCurrentRunId(v);
                    setComparison(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select run" />
                  </SelectTrigger>
                  <SelectContent>
                    {runs.map((r) => (
                      <SelectItem key={r.run_id} value={r.run_id}>
                        {r.run_id.slice(0, 8)}… {r.status ? `(${r.status})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Compare with (previous)</label>
                <Select
                  value={compareWithRunId}
                  onValueChange={(v) => {
                    setCompareWithRunId(v);
                    setComparison(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select run" />
                  </SelectTrigger>
                  <SelectContent>
                    {runs
                      .filter((r) => r.run_id !== currentRunId)
                      .map((r) => (
                        <SelectItem key={r.run_id} value={r.run_id}>
                          {r.run_id.slice(0, 8)}… {r.status ? `(${r.status})` : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {canCompare && (
              <Button
                onClick={runCompare}
                disabled={comparisonLoading}
                className="w-full sm:w-auto"
              >
                {comparisonLoading ? "Loading…" : "Compare"}
              </Button>
            )}

            {comparisonError && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {comparisonError}
              </div>
            )}

            {comparison && (
              <div className="space-y-4 border-t pt-4">
                {comparison.summary && (
                  <div>
                    <h4 className="mb-1 text-sm font-medium">Summary</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {comparison.summary}
                    </p>
                  </div>
                )}
                {comparison.artifact_diffs && comparison.artifact_diffs.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-medium">Artifact changes</h4>
                    <ul className="space-y-1 rounded-md border bg-muted/30 p-2 text-sm">
                      {comparison.artifact_diffs.map((a) => (
                        <li
                          key={a.artifact_id}
                          className={STATUS_COLORS[a.status] ?? ""}
                        >
                          <span className="font-medium">{a.artifact_id}</span>
                          {a.artifact_type && (
                            <span className="text-muted-foreground">
                              {" "}
                              ({a.artifact_type})
                            </span>
                          )}{" "}
                          — {a.status}
                          {a.changes_summary && `: ${a.changes_summary}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {comparison.node_diffs && comparison.node_diffs.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-medium">Node changes</h4>
                    <ul className="space-y-1 rounded-md border bg-muted/30 p-2 text-sm">
                      {comparison.node_diffs.map((n) => (
                        <li
                          key={n.node_id}
                          className={STATUS_COLORS[n.status] ?? ""}
                        >
                          <span className="font-medium">{n.node_id}</span>
                          {n.node_type && (
                            <span className="text-muted-foreground">
                              {" "}
                              ({n.node_type})
                            </span>
                          )}{" "}
                          — {n.status}
                          {n.changes_summary && `: ${n.changes_summary}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {comparison.summary === "" &&
                  (!comparison.artifact_diffs || comparison.artifact_diffs.length === 0) &&
                  (!comparison.node_diffs || comparison.node_diffs.length === 0) && (
                    <p className="text-sm text-muted-foreground">
                      No differences reported between these runs.
                    </p>
                  )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
