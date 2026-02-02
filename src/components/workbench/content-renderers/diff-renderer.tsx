"use client";

import { ReactNode } from "react";
import { ContentRenderer, contentRendererRegistry } from "./index";
import { ProjectConfigurationDiffView } from "../project-configuration-diff-view";
import { ConceptBriefDiffView as ConceptBriefDiffViewComponent } from "../concept-brief-diff-view";
import {
  ProjectConfigurationDiffView as ProjectConfigurationDiffViewType,
  ConceptBriefDiffView,
} from "@/lib/diff-types";
import { AlertCircle } from "lucide-react";

export interface DiffRendererMetadata {
  diff: any;
  previewData?: any;
  threadId?: string | null;
  proposalType?: string;
}

/**
 * Diff Content Renderer
 * Renders diff previews by dispatching on diff.type (progression | similarity | subset)
 * and optional proposalType for subset variants (classify_intent, link_uploaded_document).
 */
export class DiffRenderer implements ContentRenderer {
  render(content: string, metadata?: Record<string, any>): ReactNode {
    const { diff, threadId, proposalType } = (metadata || {}) as DiffRendererMetadata;
    if (!diff) return null;

    const type = diff.type as "progression" | "similarity" | "subset" | undefined;

    switch (type) {
      case "progression":
        if (diff.progress_diff != null) {
          return (
            <ProjectConfigurationDiffView
              diffData={diff as ProjectConfigurationDiffViewType}
              isLoading={false}
            />
          );
        }
        if (diff.metadata) {
          const meta = diff.metadata;
          const progression = meta.progression || {};
          return (
            <div className="space-y-3">
              <div className="text-sm font-medium">{meta.title}</div>
              {meta.description && (
                <div className="text-xs text-muted-foreground">{meta.description}</div>
              )}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="font-medium mb-1">{meta.leftLabel || "Previous"}</div>
                  {diff.left && (
                    <div className="space-y-1 text-muted-foreground">
                      {diff.left.artifact_types?.length > 0 && (
                        <div>Types: {diff.left.artifact_types.join(", ")}</div>
                      )}
                      {diff.left.category && <div>Category: {diff.left.category}</div>}
                      {diff.left.title && <div>Title: {diff.left.title}</div>}
                    </div>
                  )}
                </div>
                <div>
                  <div className="font-medium mb-1">{meta.rightLabel || "Proposed"}</div>
                  {diff.right && (
                    <div className="space-y-1">
                      {diff.right.artifact_types?.length > 0 && (
                        <div className="text-green-600 dark:text-green-400">
                          Types: {diff.right.artifact_types.join(", ")}
                        </div>
                      )}
                      {diff.right.category && <div>Category: {diff.right.category}</div>}
                      {diff.right.title && <div>Title: {diff.right.title}</div>}
                    </div>
                  )}
                </div>
              </div>
              {progression.completionPercentage !== undefined && (
                <div className="text-xs text-muted-foreground">
                  Completion: {progression.completionPercentage.toFixed(0)}%
                </div>
              )}
            </div>
          );
        }
        break;

      case "similarity":
        if (diff.options) {
          return (
            <ConceptBriefDiffViewComponent
              diffData={diff as ConceptBriefDiffView}
              isLoading={false}
              threadId={threadId ?? undefined}
            />
          );
        }
        break;

      case "subset": {
        if (!diff.metadata) break;
        const subsetMeta = diff.metadata;
        if (proposalType === "classify_intent") {
          return (
            <div className="space-y-2">
              <div className="text-sm font-medium">{subsetMeta.title}</div>
              <div className="text-xs text-muted-foreground">{subsetMeta.description}</div>
              {subsetMeta.subset && (
                <div className="flex gap-4 text-xs">
                  <span>Active: {subsetMeta.subset.activeCount} nodes</span>
                  <span>Inactive: {subsetMeta.subset.inactiveCount} nodes</span>
                  <span>Reduction: {subsetMeta.subset.reductionPercentage.toFixed(1)}%</span>
                </div>
              )}
            </div>
          );
        }
        if (proposalType === "link_uploaded_document") {
          const kgChanges = subsetMeta.kg_changes || {};
          return (
            <div className="space-y-3">
              <div className="text-sm font-medium">{subsetMeta.title}</div>
              {subsetMeta.description && (
                <div className="text-xs text-muted-foreground">{subsetMeta.description}</div>
              )}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="font-medium mb-1">{subsetMeta.leftLabel || "Current KG State"}</div>
                  {diff.left && (
                    <div className="space-y-1 text-muted-foreground">
                      {diff.left.kg_node_id && <div>Node: {diff.left.kg_node_id}</div>}
                      {diff.left.kg_artifact_types?.length > 0 && (
                        <div>Types: {diff.left.kg_artifact_types.join(", ")}</div>
                      )}
                      {!diff.left.kg_node_exists && (
                        <div className="text-xs italic">No KG node</div>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <div className="font-medium mb-1">{subsetMeta.rightLabel || "Proposed KG Changes"}</div>
                  {diff.right && (
                    <div className="space-y-1">
                      {diff.right.kg_node_id && (
                        <div className="text-green-600 dark:text-green-400">
                          Node: {diff.right.kg_node_id}{" "}
                          {kgChanges.node_action === "create" && "(new)"}
                        </div>
                      )}
                      {diff.right.kg_artifact_types?.length > 0 && (
                        <div className="text-green-600 dark:text-green-400">
                          Types: {diff.right.kg_artifact_types.join(", ")}
                        </div>
                      )}
                      {diff.right.trigger_link && (
                        <div className="text-blue-600 dark:text-blue-400">
                          Link: {diff.right.trigger_link}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {kgChanges.artifact_types_added?.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Adding artifact types: {kgChanges.artifact_types_added.join(", ")}
                </div>
              )}
            </div>
          );
        }
        return (
          <div className="space-y-2">
            <div className="text-sm font-medium">{subsetMeta.title}</div>
            {subsetMeta.description && (
              <div className="text-xs text-muted-foreground">{subsetMeta.description}</div>
            )}
            {subsetMeta.subset && (
              <div className="flex gap-4 text-xs">
                <span>Active: {subsetMeta.subset.activeCount} nodes</span>
                <span>Inactive: {subsetMeta.subset.inactiveCount} nodes</span>
                <span>Reduction: {subsetMeta.subset.reductionPercentage.toFixed(1)}%</span>
              </div>
            )}
          </div>
        );
      }
    }

    return (
      <div className="text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4 inline mr-2" />
        Preview not available for {proposalType ?? type ?? "unknown"}
      </div>
    );
  }
}

if (contentRendererRegistry) {
  contentRendererRegistry.register("diff", new DiffRenderer());
}
