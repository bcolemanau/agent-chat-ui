/**
 * Hook to unify all proposal previews from the graph into a single list.
 *
 * Preview-only: proposals come from ToolMessages (no HITL interrupt). Each item
 * is a preview that can be approved/applied via ApprovalCard using API endpoints.
 */
import { useMemo } from "react";
import { useStreamContext } from "@/providers/Stream";

export interface UnifiedPreviewItem {
  id: string;
  type: string; // tool_name (e.g., "classify_intent", "generate_project_configuration_summary")
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
  threadId?: string;
  fromMessages?: boolean; // True = from ToolMessage (apply via API)
}

export function useUnifiedPreviews(): UnifiedPreviewItem[] {
  const stream = useStreamContext();

  return useMemo(() => {
    const items: UnifiedPreviewItem[] = [];
    const values = (stream as any)?.values ?? {};
    const activeAgent = values.active_agent;
    const currentTriggerId = values.current_trigger_id;

    // Proposals in ToolMessage (classify_intent, generate_project_configuration_summary, generate_concept_brief, enrichment, etc.)
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
          // classify_intent: if active_agent is "project_configurator" and current_trigger_id matches, it's already applied
          if (toolName === "classify_intent") {
            const proposalTriggerId = args.trigger_id;
            if (
              activeAgent === "project_configurator" &&
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
              fromMessages: true,
            });
          }
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
    case "generate_project_configuration_summary":
    case "propose_hydration_complete":
      return "Project Configuration - Ready for Concept Phase";
    case "generate_concept_brief":
      return "Concept Brief Options";
    case "propose_enrichment":
    case "approve_enrichment":
    case "enrichment":
      return `Enrichment: ${request.args?.artifact_id || request.preview_data?.filename || "Unknown Artifact"}`;
    case "link_uploaded_document":
      return `Link Artifact: ${request.args?.filename || request.preview_data?.filename || request.args?.document_id || "Unknown"}`;
    case "propose_organization":
      return `Create organization: ${request.args?.name || request.preview_data?.name || request.args?.org_id || "Unknown"}`;
    case "propose_user_add":
      return `Add user: ${request.args?.email || request.preview_data?.email || "Unknown"} to ${request.args?.org_id || request.preview_data?.org_id || "org"}`;
    case "propose_user_edit":
      return `Update user: ${request.args?.user_email || request.preview_data?.user_email || "Unknown"} in ${request.args?.org_id || request.preview_data?.org_id || "org"}`;
    case "propose_user_remove":
      return `Remove user: ${request.args?.user_email || request.preview_data?.user_email || "Unknown"} from ${request.args?.org_id || request.preview_data?.org_id || "org"}`;
    default:
      return request.summary || request.description || `${toolName} Approval`;
  }
}
