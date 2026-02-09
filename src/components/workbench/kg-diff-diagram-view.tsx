"use client";

import React, { useState } from "react";
import {
  KgDiffPayload,
  KgDiffEdge,
  KgDiffChangeType,
} from "@/lib/diff-types";
import { cn } from "@/lib/utils";

function getChangeTypeNode(node: { changeType?: string; diff_status?: string }): KgDiffChangeType {
  return (node.changeType ?? node.diff_status ?? "unchanged") as KgDiffChangeType;
}
function getChangeTypeEdge(edge: { changeType?: string }): KgDiffChangeType {
  return (edge.changeType ?? "unchanged") as KgDiffChangeType;
}

const changeTypeStyles: Record<
  KgDiffChangeType,
  { badge: string; border: string; text: string }
> = {
  added: {
    badge: "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/50",
    border: "border-l-green-500",
    text: "text-green-700 dark:text-green-400",
  },
  removed: {
    badge: "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/50",
    border: "border-l-red-500",
    text: "text-red-700 dark:text-red-400",
  },
  modified: {
    badge: "bg-amber-500/20 text-amber-800 dark:text-amber-400 border-amber-500/50",
    border: "border-l-amber-500",
    text: "text-amber-800 dark:text-amber-400",
  },
  unchanged: {
    badge: "bg-muted text-muted-foreground border-border",
    border: "border-l-muted",
    text: "text-muted-foreground",
  },
};

function getEdgeLabel(edge: KgDiffEdge): string {
  const src =
    typeof edge.source === "object" && edge.source && "id" in edge.source
      ? edge.source.id
      : String(edge.source);
  const tgt =
    typeof edge.target === "object" && edge.target && "id" in edge.target
      ? edge.target.id
      : String(edge.target);
  const type = edge.type ? ` (${edge.type})` : "";
  return `${src} → ${tgt}${type}`;
}

export interface KgDiffDiagramViewProps {
  payload: KgDiffPayload | null;
  isLoading?: boolean;
}

/**
 * KG-diff diagram view (Issue #56).
 * Renders nodes and edges with visual affordances: added (green), removed (red), modified (amber), unchanged (muted).
 * Includes summary strip over the same payload.
 */
export function KgDiffDiagramView({
  payload,
  isLoading = false,
}: KgDiffDiagramViewProps) {
  const [showUnchanged, setShowUnchanged] = useState(false);

  if (!payload) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No KG diff data available.
      </div>
    );
  }

  const allNodes = payload.nodes ?? [];
  const allEdges = payload.edges ?? payload.links ?? [];
  const summary = payload.summary;
  const metadata = payload.metadata;

  const nodes = showUnchanged
    ? allNodes
    : allNodes.filter((n) => getChangeTypeNode(n) !== "unchanged");
  const edges = showUnchanged
    ? allEdges
    : allEdges.filter((e) => getChangeTypeEdge(e) !== "unchanged");
  const hiddenNodes = allNodes.length - nodes.length;
  const hiddenEdges = allEdges.length - edges.length;
  const hasHidden = hiddenNodes > 0 || hiddenEdges > 0;

  if (isLoading) {
    return (
      <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
        Loading diff…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {metadata?.title && (
        <div>
          <h3 className="text-sm font-semibold">{metadata.title}</h3>
          {metadata.description && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {metadata.description}
            </p>
          )}
        </div>
      )}

      {/* Summary strip (Issue #56: at least one other view over same payload) */}
      {summary && (
        <div
          className={cn(
            "rounded-md border px-3 py-2 text-xs",
            "bg-muted/30 flex flex-wrap gap-x-4 gap-y-1"
          )}
        >
          {summary.nodesAdded > 0 && (
            <span className={changeTypeStyles.added.text}>
              +{summary.nodesAdded} nodes
            </span>
          )}
          {summary.nodesRemoved > 0 && (
            <span className={changeTypeStyles.removed.text}>
              −{summary.nodesRemoved} nodes
            </span>
          )}
          {summary.nodesModified > 0 && (
            <span className={changeTypeStyles.modified.text}>
              ~{summary.nodesModified} nodes modified
            </span>
          )}
          {summary.edgesAdded > 0 && (
            <span className={changeTypeStyles.added.text}>
              +{summary.edgesAdded} edges
            </span>
          )}
          {summary.edgesRemoved > 0 && (
            <span className={changeTypeStyles.removed.text}>
              −{summary.edgesRemoved} edges
            </span>
          )}
          {summary.edgesModified > 0 && (
            <span className={changeTypeStyles.modified.text}>
              ~{summary.edgesModified} edges modified
            </span>
          )}
          {summary.semanticSummary && (
            <span className="text-muted-foreground w-full mt-1">
              {summary.semanticSummary}
            </span>
          )}
        </div>
      )}

      {/* Filter: hide unchanged by default */}
      {hasHidden && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={showUnchanged}
            onChange={(e) => setShowUnchanged(e.target.checked)}
            className="rounded border-border"
          />
          Show unchanged ({hiddenNodes} nodes, {hiddenEdges} edges)
        </label>
      )}

      {/* Nodes with changeType affordances */}
      {nodes.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">
            Nodes ({nodes.length}
            {!showUnchanged && hiddenNodes > 0 && ` of ${allNodes.length}`})
          </h4>
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {nodes.map((node, i) => {
              const ct = getChangeTypeNode(node);
              const styles = changeTypeStyles[ct] ?? changeTypeStyles.unchanged;
              return (
                <li
                  key={node.id + String(i)}
                  className={cn(
                    "rounded border-l-4 py-1 px-2 text-xs flex items-center gap-2",
                    styles.border,
                    "bg-card"
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium border",
                      styles.badge
                    )}
                  >
                    {ct}
                  </span>
                  <span className="font-mono truncate">{node.id}</span>
                  {node.name != null && node.name !== "" && (
                    <span className="truncate text-muted-foreground">
                      {node.name}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Edges with changeType affordances */}
      {edges.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">
            Edges ({edges.length}
            {!showUnchanged && hiddenEdges > 0 && ` of ${allEdges.length}`})
          </h4>
          <ul className="space-y-1 max-h-32 overflow-y-auto">
            {edges.map((edge, i) => {
              const ct = getChangeTypeEdge(edge);
              const styles = changeTypeStyles[ct] ?? changeTypeStyles.unchanged;
              return (
                <li
                  key={i}
                  className={cn(
                    "rounded border-l-4 py-1 px-2 text-xs flex items-center gap-2 font-mono",
                    styles.border,
                    "bg-card"
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium border",
                      styles.badge
                    )}
                  >
                    {ct}
                  </span>
                  <span className="truncate">{getEdgeLabel(edge)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {nodes.length === 0 && edges.length === 0 && (
        <div className="text-xs text-muted-foreground py-2">
          {allNodes.length > 0 || allEdges.length > 0
            ? "No added, modified, or removed items. Enable “Show unchanged” to see all."
            : "No nodes or edges in this diff."}
        </div>
      )}
    </div>
  );
}
