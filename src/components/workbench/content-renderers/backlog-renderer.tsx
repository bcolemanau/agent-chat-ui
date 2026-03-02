"use client";

import React, { useEffect, useState } from "react";
import { ExternalLink, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ArtifactIssue {
  number: number;
  title: string;
  state?: string;
  url?: string;
  labels?: string[] | { name: string; color?: string }[];
  created_at?: string;
}

interface BacklogRendererProps {
  /** Artifact (node) ID for connector-backed issues */
  artifactId: string;
  threadId?: string | null;
  orgId?: string | null;
  projectId?: string | null;
  className?: string;
}

/**
 * Renders GitHub (or other connector) issues linked to an artifact (Issue 154).
 * Fetches from GET /api/artifact/issues and displays issue cards.
 */
export function BacklogRenderer({
  artifactId,
  threadId,
  orgId,
  projectId,
  className,
}: BacklogRendererProps) {
  const [issues, setIssues] = useState<ArtifactIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIssues = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ artifact_id: artifactId });
      if (threadId) params.set("thread_id", threadId);
      if (orgId) params.set("org_id", orgId);
      if (projectId) params.set("project_id", projectId);
      const orgContext =
        typeof localStorage !== "undefined" ? localStorage.getItem("reflexion_org_context") : null;
      const headers: Record<string, string> = {};
      if (orgContext) headers["X-Organization-Context"] = orgContext;

      const res = await fetch(`/api/artifact/issues?${params.toString()}`, { headers });
      const data = (await res.json()) as { issues?: ArtifactIssue[]; count?: number; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to load issues");
        setIssues([]);
        return;
      }
      setIssues(Array.isArray(data.issues) ? data.issues : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load issues");
      setIssues([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIssues();
  }, [artifactId, threadId, orgId, projectId]);

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 py-4 text-muted-foreground", className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Loading linked issues…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("space-y-2", className)}>
        <p className="text-xs text-muted-foreground">No connector or error loading issues.</p>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={fetchIssues}>
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    );
  }

  if (issues.length === 0) {
    return (
      <p className={cn("text-xs text-muted-foreground py-2", className)}>
        No linked issues. Configure a connector (e.g. GitHub Issues) for this artifact to see backlog items here.
      </p>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-muted-foreground uppercase">Linked issues</span>
        <Button variant="ghost" size="sm" className="h-6 gap-1 text-[10px]" onClick={fetchIssues}>
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
      </div>
      <ul className="space-y-2">
        {issues.map((issue) => {
          const url = typeof issue.url === "string" ? issue.url : undefined;
          const labels = Array.isArray(issue.labels)
            ? issue.labels.map((l) => (typeof l === "string" ? l : (l as { name: string }).name))
            : [];
          return (
            <li
              key={issue.number}
              className="rounded border border-border bg-muted/20 p-2.5 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">{issue.title}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[10px] text-muted-foreground">#{issue.number}</span>
                    {issue.state && (
                      <span
                        className={cn(
                          "text-[9px] px-1.5 py-0.5 rounded",
                          issue.state === "open"
                            ? "bg-green-500/20 text-green-600 dark:text-green-400"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {issue.state}
                      </span>
                    )}
                    {labels.slice(0, 3).map((name) => (
                      <span
                        key={name}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    title="Open in GitHub"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
