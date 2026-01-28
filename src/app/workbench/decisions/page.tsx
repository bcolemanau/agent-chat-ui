"use client";

import { useUnifiedApprovals } from "@/components/workbench/hooks/use-unified-approvals";
import { ApprovalCard } from "@/components/workbench/approval-card";
import { useStreamContext } from "@/providers/Stream";
import { AlertCircle } from "lucide-react";

export default function DecisionsPage() {
  const stream = useStreamContext();
  const approvals = useUnifiedApprovals();
  
  // Group approvals by type for better organization
  const groupedApprovals = approvals.reduce((acc, item) => {
    if (!acc[item.type]) {
      acc[item.type] = [];
    }
    acc[item.type].push(item);
    return acc;
  }, {} as Record<string, typeof approvals>);
  
  const approvalTypes = Object.keys(groupedApprovals);

  return (
    <div className="flex flex-col h-full p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Decisions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review and approve pending actions from agents
        </p>
      </div>

      {approvals.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center max-w-md">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Pending Decisions</h3>
            <p className="text-sm text-muted-foreground">
              All approvals have been processed. New decisions will appear here when agents require your input.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {approvalTypes.map((type) => (
            <div key={type}>
              <h2 className="text-lg font-medium mb-3 capitalize">
                {getTypeLabel(type)} ({groupedApprovals[type].length})
              </h2>
              <div className="grid gap-4">
                {groupedApprovals[type].map((item) => (
                  <ApprovalCard
                    key={item.id}
                    item={item}
                    stream={stream}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    classify_intent: "Project Classification",
    propose_hydration_complete: "Hydration Complete",
    generate_concept_brief: "Concept Brief Options",
    approve_enrichment: "Enrichment",
    enrichment: "Enrichment",
  };
  return labels[type] || type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}
