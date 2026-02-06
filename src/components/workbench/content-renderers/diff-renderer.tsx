/* eslint-disable react-refresh/only-export-components -- file exports component + metadata */
"use client";

import { ReactNode } from "react";
import { ContentRenderer, contentRendererRegistry } from "./index";
import { ProjectConfigurationDiffView } from "../project-configuration-diff-view";
import { ConceptBriefDiffView as ConceptBriefDiffViewComponent } from "../concept-brief-diff-view";
import { KgDiffDiagramView } from "../kg-diff-diagram-view";
import {
  ProjectConfigurationDiffView as ProjectConfigurationDiffViewType,
  ConceptBriefDiffView,
  KgDiffPayload,
} from "@/lib/diff-types";
import { AlertCircle, ArrowRight, ShieldCheck, ShieldAlert } from "lucide-react";
import { MarkdownText } from "@/components/thread/markdown-text";
import { DecisionSummaryView } from "../decision-summary-view";

export interface DiffRendererMetadata {
  diff: any;
  previewData?: any;
  threadId?: string | null;
  proposalType?: string;
}

/** Issue #63: Friendly names for downstream template IDs (impact forecast). */
const TEMPLATE_ID_LABELS: Record<string, string> = {
  "T-CONCEPT": "Concept Brief",
  "T-FEATDEF": "Feature Definition",
  "T-REQPKG": "Requirements Package",
  "T-UX": "UX Brief",
  "T-ARCH": "Architecture",
  "T-DESIGN": "Design",
};

function TraceabilityPreviewBlock({ previewData }: { previewData: any }): ReactNode {
  const impact = previewData?.impact_forecast;
  const coverage = previewData?.coverage_analysis;
  if (!impact && !coverage) return null;
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 text-sm space-y-3 mb-3">
      {impact && (
        <div>
          <div className="flex items-center gap-2 font-medium text-foreground mb-1">
            <ArrowRight className="h-4 w-4 shrink-0" />
            Impact forecast
          </div>
          <p className="text-muted-foreground text-xs">{impact.message}</p>
          {impact.downstream_template_ids?.length > 0 && (
            <ul className="list-disc list-inside text-xs text-muted-foreground mt-1">
              {impact.downstream_template_ids.map((id: string) => (
                <li key={id}>{TEMPLATE_ID_LABELS[id] ?? id}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {coverage && (
        <div>
          <div className="flex items-center gap-2 font-medium text-foreground mb-1">
            {coverage.uncovered_crits?.length > 0 ? (
              <ShieldAlert className="h-4 w-4 shrink-0 text-amber-500" />
            ) : (
              <ShieldCheck className="h-4 w-4 shrink-0 text-green-600" />
            )}
            Coverage (risks in scope)
          </div>
          <p className="text-muted-foreground text-xs">{coverage.message}</p>
          {(coverage.uncovered_crits_with_labels?.length ?? coverage.uncovered_crits?.length ?? 0) > 0 && (
            <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              <span className="font-medium">Uncovered:</span>
              <ul className="list-disc list-inside mt-0.5 space-y-0.5">
                {(coverage.uncovered_crits_with_labels?.length ? coverage.uncovered_crits_with_labels : (coverage.uncovered_crits ?? []).map((id: string) => ({ id, label: id }))).map(
                  (item: { id: string; label: string }) => (
                    <li key={item.id}>
                      {item.label === item.id ? item.id : `${item.id}: ${item.label}`}
                    </li>
                  )
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Diff Content Renderer
 * Renders diff previews by dispatching on diff.type (progression | similarity | subset | kg_diff)
 * and optional proposalType for subset variants (classify_intent, link_uploaded_document).
 * Issue #56: kg_diff type renders KgDiffDiagramView (diagram + summary over same payload).
 */
export class DiffRenderer implements ContentRenderer {
  render(content: string, metadata?: Record<string, any>): ReactNode {
    const { diff, previewData, threadId, proposalType } = (metadata || {}) as DiffRendererMetadata;
    if (!diff) return null;

    // Operations (manufacturing_ops, software_ops) and other tools may return diff as markdown string
    if (typeof diff === "string") {
      return (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <MarkdownText>{diff}</MarkdownText>
        </div>
      );
    }

    const type = diff.type as "progression" | "similarity" | "subset" | "kg_diff" | undefined;
    console.log("[DiffRenderer] ENTER render", { type, proposalType, hasBaseArtifactTypes: !!(diff as any).right?.base_artifact_types?.length });
    const decisionSummary = previewData?.decision_summary;
    const traceabilityBlock = decisionSummary ? (
      <DecisionSummaryView decisionSummary={decisionSummary} className="mb-3" />
    ) : previewData?.impact_forecast || previewData?.coverage_analysis ? (
      <TraceabilityPreviewBlock previewData={previewData} />
    ) : null;

    let mainContent: ReactNode = null;
    switch (type) {
      case "kg_diff":
        mainContent = (
          <KgDiffDiagramView
            payload={diff as KgDiffPayload}
            isLoading={false}
          />
        );
        break;

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
                      {(() => {
                        const baseTypes = (diff.right as { base_artifact_types?: string[] }).base_artifact_types;
                        return baseTypes && baseTypes.length > 0 ? (
                          <div className="text-muted-foreground text-xs">
                            Links to base artifacts: {baseTypes.join(", ")}
                          </div>
                        ) : null;
                      })()}
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
          break;
        }
        break;

      case "similarity":
        if (diff.options) {
          mainContent = (
            <ConceptBriefDiffViewComponent
              diffData={diff as ConceptBriefDiffView}
              isLoading={false}
              threadId={threadId ?? undefined}
            />
          );
          break;
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
          break;
        }
        mainContent = (
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
        break;
      }
    }

    if (mainContent == null) {
      mainContent = (
        <div className="text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 inline mr-2" />
          Preview not available for {proposalType ?? type ?? "unknown"}
        </div>
      );
    }
    console.log("[DiffRenderer] EXIT render: SUCCESS", { type, proposalType });
    return (
      <>
        {traceabilityBlock}
        {mainContent}
      </>
    );
  }
}

if (contentRendererRegistry) {
  contentRendererRegistry.register("diff", new DiffRenderer());
}
