/**
 * Hook to get the count of pending previews (proposals awaiting approval).
 * Used for notification badge on Decisions tab.
 */
import { useMemo } from "react";
import { useUnifiedPreviews } from "./use-unified-previews";

export function useApprovalCount(): number {
  const previews = useUnifiedPreviews();

  return useMemo(() => {
    return previews.filter((item) => item.status === "pending").length;
  }, [previews]);
}
