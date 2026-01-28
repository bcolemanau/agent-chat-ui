/**
 * Hook to get the count of pending approvals.
 * 
 * Issue #14: Used for notification badge showing total pending count.
 */
import { useMemo } from "react";
import { useUnifiedApprovals } from "./use-unified-approvals";

export function useApprovalCount(): number {
  const approvals = useUnifiedApprovals();
  
  return useMemo(() => {
    // Count only pending approvals (not processing/approved/rejected)
    return approvals.filter(item => item.status === "pending").length;
  }, [approvals]);
}
