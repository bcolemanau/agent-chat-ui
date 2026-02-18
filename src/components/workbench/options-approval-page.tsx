"use client";

import { ConceptBriefDiffView } from "@/components/workbench/concept-brief-diff-view";
import { useStreamContext } from "@/providers/Stream";
import { useEffect, useState } from "react";
import type { ConceptBriefDiffView as ConceptBriefDiffViewType } from "@/lib/diff-types";

/** Tool names that can use the options/similarity diff view (any artifact generate that returns options). */
const _OPTIONS_APPROVAL_TOOLS = [
  "generate_concept_brief",
  "generate_ux_brief",
  "generate_requirements_proposal",
  "generate_architecture_proposal",
  "generate_design_proposal",
  "generate_manufacturing_ops_proposal",
  "generate_software_ops_proposal",
] as const;
export type OptionsApprovalToolName = (typeof _OPTIONS_APPROVAL_TOOLS)[number];

export function isOptionsApprovalTool(name: string): name is OptionsApprovalToolName {
  return (_OPTIONS_APPROVAL_TOOLS as readonly string[]).includes(name);
}

export interface OptionsApprovalPageProps {
  /** Tool name to look for in stream interrupt (any artifact generate that can return options) */
  toolName: OptionsApprovalToolName | string;
  /** Message shown when user rejects (e.g. "Options rejected") */
  rejectMessage: string;
}

function getInterrupts(stream: any): unknown[] {
  let raw: unknown = null;
  if (stream?.interrupt) raw = stream.interrupt;
  else if (typeof stream?.getInterrupt === "function") {
    try {
      raw = stream.getInterrupt();
    } catch {
      /* ignore */
    }
  } else if (stream?.values?.interrupt) raw = stream.values.interrupt;
  else if (stream?.pendingInterrupt) raw = stream.pendingInterrupt;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function getPreviewFromInterrupt(int: any): Record<string, unknown> | undefined {
  const actionRequest = int?.value?.action_requests?.[0] || int?.action_requests?.[0];
  const preview =
    actionRequest?.preview_data ||
    actionRequest?.args?.preview_data ||
    int?.value?.preview_data ||
    int?.preview_data;
  return preview as Record<string, unknown> | undefined;
}

/**
 * Shared page content for option-style proposals (any artifact type that returns multiple options).
 * Finds the interrupt for the given tool, shows the options/similarity diff, and submits approve/reject.
 */
export function OptionsApprovalPage({ toolName, rejectMessage }: OptionsApprovalPageProps) {
  const stream = useStreamContext();
  const [diffData, setDiffData] = useState<ConceptBriefDiffViewType | undefined>();
  const [previewData, setPreviewData] = useState<Record<string, unknown> | undefined>();

  useEffect(() => {
    const interrupts = getInterrupts(stream as any);
    const match = interrupts.find((int: any) => {
      const name = int?.value?.action_requests?.[0]?.name || int?.action_requests?.[0]?.name;
      return name === toolName;
    });
    if (!match) return;
    const preview = getPreviewFromInterrupt(match);
    if (!preview) return;
    setPreviewData(preview);
    if (preview.diff) {
      setDiffData(preview.diff as unknown as ConceptBriefDiffViewType);
    } else if (preview.type === "similarity") {
      setDiffData(preview as unknown as ConceptBriefDiffViewType);
    }
  }, [stream, toolName]);

  const handleApprove = async (selectedOptionIndex: number) => {
    try {
      await stream.submit({} as any, {
        command: {
          resume: {
            decisions: [{ type: "approve", args: { selected_option_index: selectedOptionIndex } }],
          },
        },
      });
    } catch (error) {
      console.error(`[OptionsApprovalPage] ${toolName} approve failed:`, error);
    }
  };

  const handleReject = async () => {
    try {
      await stream.submit({} as any, {
        command: {
          resume: { decisions: [{ type: "reject", message: rejectMessage }] },
        },
      });
    } catch (error) {
      console.error(`[OptionsApprovalPage] ${toolName} reject failed:`, error);
    }
  };

  return (
    <ConceptBriefDiffView
      diffData={diffData}
      previewData={previewData}
      onApprove={handleApprove}
      onReject={handleReject}
    />
  );
}
