/**
 * Hook to get the count of active (pending) decisions only: proposals awaiting
 * approval that have not yet been approved or rejected. Used for the
 * notification badge on the Decisions tab. Scope from URL only (projectId, orgId).
 */
import { useMemo } from "react";
import { useRouteScope } from "@/hooks/use-route-scope";
import { useUnifiedPreviews } from "./use-unified-previews";
import { useProcessedDecisions } from "./use-processed-decisions";

export function useApprovalCount(): number {
  const { projectId, orgId } = useRouteScope();
  const previews = useUnifiedPreviews();
  const { processed } = useProcessedDecisions(projectId ?? undefined, orgId ?? undefined);

  const processedIds = useMemo(() => new Set(processed.map((p) => p.id)), [processed]);

  return useMemo(() => {
    return previews.filter((p) => !processedIds.has(p.id)).length;
  }, [previews, processedIds]);
}
