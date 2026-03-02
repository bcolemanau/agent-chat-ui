"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ConnectorConfigProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artifactId: string;
  threadId?: string | null;
  orgId?: string | null;
  projectId?: string | null;
  onSuccess?: () => void;
}

const GITHUB_ISSUES_TYPE = "github_issues";

export function ConnectorConfigModal({
  open,
  onOpenChange,
  artifactId,
  threadId,
  orgId,
  projectId,
  onSuccess,
}: ConnectorConfigProps) {
  const [repoName, setRepoName] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoName.trim() || !labelFilter.trim()) {
      toast.error("Repository and label filter are required");
      return;
    }
    const effectiveOrgId = orgId ?? (typeof localStorage !== "undefined" ? localStorage.getItem("reflexion_org_context") : null) ?? "";
    if (!effectiveOrgId) {
      toast.error("Organization context is required");
      return;
    }
    setSubmitting(true);
    try {
      const orgContext = typeof localStorage !== "undefined" ? localStorage.getItem("reflexion_org_context") : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (orgContext) headers["X-Organization-Context"] = orgContext;

      const res = await fetch("/api/connectors/configure", {
        method: "POST",
        headers,
        body: JSON.stringify({
          org_id: effectiveOrgId,
          artifact_id: artifactId,
          project_id: projectId ?? threadId ?? undefined,
          type_id: GITHUB_ISSUES_TYPE,
          config: { repo_name: repoName.trim(), label_filter: labelFilter.trim(), state: "open" },
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
      toast.success("Connector configured");
      onOpenChange(false);
      setRepoName("");
      setLabelFilter("");
      onSuccess?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to configure connector");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect GitHub Issues</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="connector-repo">Repository (owner/repo)</Label>
            <Input
              id="connector-repo"
              placeholder="owner/Reflexion"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="connector-label">Label filter (e.g. art:ART-45)</Label>
            <Input
              id="connector-label"
              placeholder="art:ART-45"
              value={labelFilter}
              onChange={(e) => setLabelFilter(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
