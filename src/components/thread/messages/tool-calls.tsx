import { AIMessage, ToolMessage } from "@langchain/langgraph-sdk";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, ClipboardCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useStreamContext } from "@/providers/Stream";
import { Button } from "@/components/ui/button";

function isComplexValue(value: any): boolean {
  return Array.isArray(value) || (typeof value === "object" && value !== null);
}

function getProposalTitle(toolName: string, proposal: Record<string, any>): string {
  const args = proposal.args || {};
  const preview = proposal.preview_data || {};
  switch (toolName) {
    case "classify_intent":
      return `Project Classification: ${args.trigger_id || "Unknown Trigger"}`;
    case "generate_project_configuration_summary":
    case "propose_hydration_complete":
      return "Project Configuration - Ready for Concept Phase";
    case "generate_concept_brief":
      return "Concept Brief Options";
    case "generate_ux_brief":
      return "UX Brief Options";
    case "generate_requirements_proposal":
      return "Requirements Proposal";
    case "generate_architecture_proposal":
      return "Architecture Proposal";
    case "generate_design_proposal":
      return "Design Proposal";
    case "generate_manufacturing_ops_proposal":
      return `Manufacturing Ops: ${args.template_type || "runbook"}`;
    case "generate_software_ops_proposal":
      return `Software Ops: ${args.template_type || "ops"}`;
    case "propose_enrichment":
    case "approve_enrichment":
    case "enrichment":
      return `Enrichment: ${args.artifact_id || preview.filename || "Unknown Artifact"}`;
    case "link_uploaded_document":
      return `Link Artifact: ${args.filename || preview.filename || args.document_id || "Unknown"}`;
    case "propose_organization":
      return `Create organization: ${args.name || preview.name || args.org_id || "Unknown"}`;
    case "organization_from_upload":
      return `Create organization from document: ${args.name || preview.name || args.org_id || "Unknown"}`;
    case "propose_user_add":
      return `Add user: ${args.email || preview.email || "Unknown"} to ${args.org_id || preview.org_id || "org"}`;
    case "propose_user_edit":
      return `Update user: ${args.user_email || preview.user_email || "Unknown"} in ${args.org_id || preview.org_id || "org"}`;
    case "propose_user_remove":
      return `Remove user: ${args.user_email || preview.user_email || "Unknown"} from ${args.org_id || preview.org_id || "org"}`;
    default:
      return proposal.model_summary || `${toolName} – review in Decisions`;
  }
}

function DecisionProposalCard({
  toolName,
  proposal,
}: {
  toolName: string;
  proposal: Record<string, any>;
}) {
  const router = useRouter();
  const stream = useStreamContext();
  const title = getProposalTitle(toolName, proposal);
  const summary = proposal.model_summary || "A decision is ready for you to review.";

  const handleReviewInDecisions = () => {
    (stream as any)?.setWorkbenchView?.("decisions")?.catch?.(() => {});
    const threadId = (stream as any)?.threadId;
    const q = threadId ? `?threadId=${encodeURIComponent(threadId)}` : "";
    router.push(`/decisions${q}`);
  };

  return (
    <div className="mx-auto max-w-3xl rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <ClipboardCheck className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-medium text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">{summary}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleReviewInDecisions}
            className="mt-2"
          >
            Review in Decisions
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ToolCalls({
  toolCalls,
}: {
  toolCalls: AIMessage["tool_calls"];
}) {
  if (!toolCalls || toolCalls.length === 0) return null;

  console.log("[ToolCalls] Rendering tools:", toolCalls.map(tc => tc.name));

  return (
    <div className="mx-auto grid max-w-3xl grid-rows-[1fr_auto] gap-2">
      {toolCalls.map((tc, idx) => {
        const args = tc.args as Record<string, any>;
        const hasArgs = Object.keys(args).length > 0;
        return (
          <div
            key={idx}
            className="overflow-hidden rounded-lg border border-gray-200"
          >
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
              <h3 className="font-medium text-gray-900">
                {tc.name}
                {tc.id && (
                  <code className="ml-2 rounded bg-gray-100 px-2 py-1 text-sm">
                    {tc.id}
                  </code>
                )}
              </h3>
            </div>
            {hasArgs ? (
              <table className="min-w-full divide-y divide-gray-200">
                <tbody className="divide-y divide-gray-200">
                  {Object.entries(args).map(([key, value], argIdx) => (
                    <tr key={argIdx}>
                      <td className="px-4 py-2 text-sm font-medium whitespace-nowrap text-gray-900">
                        {key}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {isComplexValue(value) ? (
                          <code className="rounded bg-gray-50 px-2 py-1 font-mono text-sm break-all">
                            {JSON.stringify(value, null, 2)}
                          </code>
                        ) : (
                          String(value)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-4 py-2 text-sm text-muted-foreground italic">No arguments</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ToolResult({ message }: { message: ToolMessage }) {
  const [isExpanded, setIsExpanded] = useState(false);

  console.log("[ToolResult] Rendering result for:", message.name || message.tool_call_id);

  let parsedContent: any;
  let isJsonContent = false;

  try {
    if (typeof message.content === "string") {
      parsedContent = JSON.parse(message.content);
      isJsonContent = isComplexValue(parsedContent);
    }
  } catch {
    // Content is not JSON, use as is
    parsedContent = message.content;
  }

  // Stream decision into chat: show a friendly card so the user sees the decision and can open Decisions view
  const isProposal =
    typeof parsedContent === "object" &&
    parsedContent !== null &&
    parsedContent.__type === "proposal" &&
    parsedContent.tool_name;
  if (isProposal) {
    return (
      <DecisionProposalCard
        toolName={parsedContent.tool_name}
        proposal={parsedContent}
      />
    );
  }

  // get_kg_with_decisions: show Knowledge Graph Summary + entity counts + decisions count
  const isKgWithDecisions =
    message.name === "get_kg_with_decisions" &&
    typeof parsedContent === "object" &&
    parsedContent !== null &&
    "kg" in parsedContent;
  if (isKgWithDecisions) {
    const kg = (parsedContent as { kg?: { entity_counts?: Record<string, number>; artifact_count?: number; scope?: { artifacts?: string[] }; error?: string } }).kg;
    const decisions = (parsedContent as { decisions?: unknown[] }).decisions;
    const counts = kg?.entity_counts ?? {};
    const entityCountStr = Object.keys(counts).length > 0
      ? Object.entries(counts)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ")
      : "—";
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-border bg-card p-4 shadow-sm">
        <h4 className="text-sm font-semibold text-foreground mb-2">Knowledge Graph Summary</h4>
        {kg?.error ? (
          <p className="text-sm text-amber-600 dark:text-amber-400">{kg.error}</p>
        ) : (
          <div className="text-sm space-y-1.5">
            <div>
              <span className="font-medium text-muted-foreground">Entity counts: </span>
              <span className="text-foreground">{entityCountStr}</span>
            </div>
            {typeof kg?.artifact_count === "number" && (
              <div>
                <span className="font-medium text-muted-foreground">Artifacts: </span>
                <span className="text-foreground">{kg.artifact_count}</span>
              </div>
            )}
            {Array.isArray(decisions) && (
              <div>
                <span className="font-medium text-muted-foreground">Decisions (this thread): </span>
                <span className="text-foreground">{decisions.length}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const contentStr = isJsonContent
    ? JSON.stringify(parsedContent, null, 2)
    : String(message.content);
  const contentLines = contentStr.split("\n");
  const shouldTruncate = contentLines.length > 4 || contentStr.length > 500;
  const displayedContent =
    shouldTruncate && !isExpanded
      ? contentStr.length > 500
        ? contentStr.slice(0, 500) + "..."
        : contentLines.slice(0, 4).join("\n") + "\n..."
      : contentStr;

  return (
    <div className="mx-auto grid max-w-3xl grid-rows-[1fr_auto] gap-2">
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {message.name ? (
              <h3 className="font-medium text-gray-900">
                Tool Result:{" "}
                <code className="rounded bg-gray-100 px-2 py-1">
                  {message.name}
                </code>
              </h3>
            ) : (
              <h3 className="font-medium text-gray-900">Tool Result</h3>
            )}
            {message.tool_call_id && (
              <code className="ml-2 rounded bg-gray-100 px-2 py-1 text-sm">
                {message.tool_call_id}
              </code>
            )}
          </div>
        </div>
        <motion.div
          className="min-w-full bg-gray-100"
          initial={false}
          animate={{ height: "auto" }}
          transition={{ duration: 0.3 }}
        >
          <div className="p-3">
            <AnimatePresence
              mode="wait"
              initial={false}
            >
              <motion.div
                key={isExpanded ? "expanded" : "collapsed"}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
              >
                {isJsonContent ? (
                  <table className="min-w-full divide-y divide-gray-200">
                    <tbody className="divide-y divide-gray-200">
                      {(Array.isArray(parsedContent)
                        ? isExpanded
                          ? parsedContent
                          : parsedContent.slice(0, 5)
                        : Object.entries(parsedContent)
                      ).map((item, argIdx) => {
                        const [key, value] = Array.isArray(parsedContent)
                          ? [argIdx, item]
                          : [item[0], item[1]];
                        return (
                          <tr key={argIdx}>
                            <td className="px-4 py-2 text-sm font-medium whitespace-nowrap text-gray-900">
                              {key}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-500">
                              {isComplexValue(value) ? (
                                <code className="rounded bg-gray-50 px-2 py-1 font-mono text-sm break-all">
                                  {JSON.stringify(value, null, 2)}
                                </code>
                              ) : (
                                String(value)
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <code className="block text-sm">{displayedContent}</code>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
          {((shouldTruncate && !isJsonContent) ||
            (isJsonContent &&
              Array.isArray(parsedContent) &&
              parsedContent.length > 5)) && (
              <motion.button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex w-full cursor-pointer items-center justify-center border-t-[1px] border-gray-200 py-2 text-gray-500 transition-all duration-200 ease-in-out hover:bg-gray-50 hover:text-gray-600"
                initial={{ scale: 1 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {isExpanded ? <ChevronUp /> : <ChevronDown />}
              </motion.button>
            )}
        </motion.div>
      </div>
    </div>
  );
}
