/**
 * Hook to get the count of active (pending) decisions only: proposals awaiting
 * approval that have not yet been approved or rejected. Used for the
 * notification badge on the Decisions tab.
 */
import { useMemo } from "react";
import { useStreamContext } from "@/providers/Stream";
import { useUnifiedPreviews } from "./use-unified-previews";
import { useProcessedDecisions } from "./use-processed-decisions";

export function useApprovalCount(): number {
  const stream = useStreamContext();
  const threadId = (stream as any)?.threadId ?? undefined;
  const previews = useUnifiedPreviews();
  const { processed } = useProcessedDecisions(threadId);

  const processedIds = useMemo(() => new Set(processed.map((p) => p.id)), [processed]);

  return useMemo(() => {
    return previews.filter((p) => !processedIds.has(p.id)).length;
  }, [previews, processedIds]);
}
