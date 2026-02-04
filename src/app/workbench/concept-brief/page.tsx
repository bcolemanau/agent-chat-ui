"use client";

import { ConceptBriefDiffView } from "@/components/workbench/concept-brief-diff-view";
import { useStreamContext } from "@/providers/Stream";
import { useEffect, useState } from "react";
import type { ConceptBriefDiffView as ConceptBriefDiffViewType } from "@/lib/diff-types";

export default function ConceptBriefPage() {
  const stream = useStreamContext();
  const [diffData, setDiffData] = useState<ConceptBriefDiffViewType | undefined>();
  const [previewData, _setPreviewData] = useState<Record<string, unknown> | undefined>();

  useEffect(() => {
    let interrupts: unknown = null;
    if ((stream as any)?.interrupt) {
      interrupts = (stream as any).interrupt;
    } else if (typeof (stream as any)?.getInterrupt === "function") {
      try {
        interrupts = (stream as any).getInterrupt();
      } catch {
        /* ignore */
      }
    } else if ((stream as any)?.values?.interrupt) {
      interrupts = (stream as any).values.interrupt;
    } else if ((stream as any)?.pendingInterrupt) {
      interrupts = (stream as any).pendingInterrupt;
    }

    if (interrupts) {
      const arr = Array.isArray(interrupts) ? interrupts : [interrupts];
      const conceptInterrupt = arr.find((int: any) => {
        const name = int?.value?.action_requests?.[0]?.name || int?.action_requests?.[0]?.name;
        return name === "generate_concept_brief";
      });
      if (conceptInterrupt) {
        const actionRequest =
          conceptInterrupt.value?.action_requests?.[0] || conceptInterrupt.action_requests?.[0];
        const previewData =
          actionRequest?.preview_data ||
          actionRequest?.args?.preview_data ||
          conceptInterrupt.value?.preview_data ||
          conceptInterrupt.preview_data;
        if (previewData?.diff) {
          setDiffData(previewData.diff as ConceptBriefDiffViewType);
        } else if (previewData?.type === "similarity") {
          setDiffData(previewData as ConceptBriefDiffViewType);
        }
      }
    }
  }, [stream]);

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
      console.error("[ConceptBriefPage] Failed to approve:", error);
    }
  };

  const handleReject = async () => {
    try {
      await stream.submit({} as any, {
        command: {
          resume: { decisions: [{ type: "reject", message: "Concept brief options rejected" }] },
        },
      });
    } catch (error) {
      console.error("[ConceptBriefPage] Failed to reject:", error);
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
