/**
 * Hook to unify all pending approvals from stream.interrupt into a single list.
 * 
 * Issue #14: Unified Approvals Inbox - aggregates all approval-requiring interrupts
 * (classify_intent, propose_hydration_complete, generate_concept_brief, enrichment)
 * into a single list for the Decisions view.
 */
import { useMemo } from "react";
import { useStreamContext } from "@/providers/Stream";
import { isAgentInboxInterruptSchema } from "@/lib/agent-inbox-interrupt";
import { Interrupt } from "@langchain/langgraph-sdk";
import { HITLRequest } from "@/components/thread/agent-inbox/types";

export interface UnifiedApprovalItem {
  id: string;
  type: string; // tool_name from action_requests (e.g., "classify_intent", "propose_hydration_complete")
  title: string;
  summary: string;
  status: "pending" | "processing" | "approved" | "rejected";
  data: {
    name: string;
    args: Record<string, unknown>;
    preview_data?: any;
    diff?: any;
    description?: string;
    summary?: string;
  };
  interruptId?: string; // Interrupt ID if from stream.interrupt
  interruptIndex?: number; // Index in interrupt array
}

export function useUnifiedApprovals(): UnifiedApprovalItem[] {
  const stream = useStreamContext();
  
  return useMemo(() => {
    const items: UnifiedApprovalItem[] = [];
    
    // Extract from stream.interrupt (HITL interrupts)
    const interrupts = (stream as any)?.interrupt;
    if (interrupts && isAgentInboxInterruptSchema(interrupts)) {
      const interruptArray = Array.isArray(interrupts) ? interrupts : [interrupts];
      
      interruptArray.forEach((interrupt: Interrupt<HITLRequest>, interruptIndex: number) => {
        if (!interrupt?.value?.action_requests) return;
        
        interrupt.value.action_requests.forEach((request, requestIndex) => {
          const toolName = request.name || "unknown";
          const summary = request.summary || request.description || `${toolName} requires approval`;
          
          // Extract diff from preview_data.diff (Issue #14 standard format) or fallback to request.diff
          const diff = request.preview_data?.diff || request.diff;
          
          items.push({
            id: `${interrupt.id || `interrupt-${interruptIndex}`}-${requestIndex}`,
            type: toolName,
            title: getApprovalTitle(toolName, request),
            summary: summary,
            status: "pending",
            data: {
              name: toolName,
              args: request.args || {},
              preview_data: request.preview_data,
              diff: diff,
              description: request.description,
              summary: request.summary,
            },
            interruptId: interrupt.id,
            interruptIndex: interruptIndex,
          });
        });
      });
    }
    
    // TODO: After enrichment refactor (Piece 2), enrichment items will also flow through
    // stream.interrupt with the same proposal+diff shape, so they'll be included above.
    // For now, if enrichment is still surfaced separately, merge that list here.
    
    return items;
  }, [stream]);
}

function getApprovalTitle(toolName: string, request: any): string {
  // Generate human-readable title based on tool name and request data
  switch (toolName) {
    case "classify_intent":
      return `Project Classification: ${request.args?.trigger_id || "Unknown Trigger"}`;
    case "propose_hydration_complete":
      return "Hydration Complete - Ready for Concept Phase";
    case "generate_concept_brief":
      return "Concept Brief Options";
    case "propose_enrichment":
    case "approve_enrichment":
    case "enrichment":
      return `Enrichment: ${request.args?.artifact_id || request.preview_data?.filename || "Unknown Artifact"}`;
    default:
      return request.summary || request.description || `${toolName} Approval`;
  }
}
