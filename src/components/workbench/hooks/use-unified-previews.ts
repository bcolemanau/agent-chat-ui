/**
 * Hook to unify all proposal previews from the graph into a single list.
 *
 * Unified Previews: aggregates proposals from stream.interrupt (HITL) and from
 * ToolMessages (classify_intent, propose_hydration_complete, generate_concept_brief,
 * enrichment) into one list for the Decisions view. Each item is a preview that
 * can be approved/applied via ApprovalCard.
 */
import { useMemo } from "react";
import { useStreamContext } from "@/providers/Stream";
import { isAgentInboxInterruptSchema } from "@/lib/agent-inbox-interrupt";
import { Interrupt } from "@langchain/langgraph-sdk";
import { HITLRequest } from "@/components/thread/agent-inbox/types";

export interface UnifiedPreviewItem {
  id: string;
  type: string; // tool_name (e.g., "classify_intent", "propose_hydration_complete")
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
  threadId?: string; // Original thread where the interrupt was raised
}

export function useUnifiedPreviews(): UnifiedPreviewItem[] {
  const stream = useStreamContext();

  return useMemo(() => {
    const items: UnifiedPreviewItem[] = [];
    const values = (stream as any)?.values ?? {};
    const activeAgent = values.active_agent;
    const currentTriggerId = values.current_trigger_id;

    // Extract from stream.interrupt (HITL interrupts)
    const interrupts = (stream as any)?.interrupt;
    if (interrupts && isAgentInboxInterruptSchema(interrupts)) {
      const interruptArray = Array.isArray(interrupts) ? interrupts : [interrupts];

      interruptArray.forEach((interrupt: Interrupt<HITLRequest>, interruptIndex: number) => {
        if (!interrupt?.value?.action_requests) return;

        interrupt.value.action_requests.forEach((request, requestIndex) => {
          const toolName = request.name || "unknown";
          const summary = request.summary || request.description || `${toolName} requires approval`;

          // Extract diff from preview_data.diff (standard format) or fallback to request.diff
          const diff = request.preview_data?.diff || request.diff;

          items.push({
            id: `${interrupt.id || `interrupt-${interruptIndex}`}-${requestIndex}`,
            type: toolName,
            title: getPreviewTitle(toolName, request),
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
            threadId: (interrupt as any).thread_id,
          });
        });
      });
    }

    // Proposals in ToolMessage (e.g. classify_intent, generate_concept_brief, propose_hydration_complete)
    // when not using HITL interrupt. Surface the most recent so the Decisions pane can show it.
    const messages = (stream as any)?.messages ?? (stream as any)?.values?.messages ?? [];
    if (Array.isArray(messages) && messages.length > 0) {
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i] as any;
        const content = msg?.content;
        if (content === undefined || content === null) continue;
        const parsed =
          typeof content === "string"
            ? (() => {
                try {
                  return JSON.parse(content);
                } catch {
                  return null;
                }
              })()
            : content;
        if (parsed?.__type === "proposal" && parsed?.tool_name) {
          const toolName = parsed.tool_name as string;
          const args = parsed.args || {};
          const preview_data = parsed.preview_data || {};
          const diff = preview_data.diff ?? parsed.diff;

          // Filter out already-applied proposals
          // classify_intent: if active_agent is "hydrator" and current_trigger_id matches, it's already applied
          if (toolName === "classify_intent") {
            const proposalTriggerId = args.trigger_id;
            if (
              activeAgent === "hydrator" &&
              currentTriggerId &&
              proposalTriggerId &&
              currentTriggerId === proposalTriggerId
            ) {
              // This classification has already been applied - skip it
              continue;
            }
          }

          const existing = items.some(
            (it) => it.type === toolName && JSON.stringify(it.data?.args) === JSON.stringify(args)
          );
          if (!existing) {
            items.unshift({
              id: `proposal-from-messages-${toolName}-${i}`,
              type: toolName,
              title: getPreviewTitle(toolName, { args, ...parsed }),
              summary: parsed.model_summary || `${toolName} ready to apply`,
              status: "pending",
              data: {
                name: toolName,
                args,
                preview_data,
                diff,
              },
              threadId: (stream as any)?.threadId,
            });
          }
          break;
        }
      }
    }

    return items;
  }, [stream]);
}

function getPreviewTitle(toolName: string, request: any): string {
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
    case "link_uploaded_document":
      return `Link Artifact: ${request.args?.filename || request.preview_data?.filename || request.args?.document_id || "Unknown"}`;
    default:
      return request.summary || request.description || `${toolName} Approval`;
  }
}
