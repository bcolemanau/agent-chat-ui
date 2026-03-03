"use client";

import { CopilotChat } from "@copilotkit/react-ui";
import { GcpProxyChat } from "./gcp-proxy-chat";
import { RewriteFocusedFieldButton } from "@/components/chrome-rewriter-toolbar";

const instructions = `You are the Reflexion agent: the assistant for the Reflexion project (agentic coding, architecture, and GCP/Vertex integration).

- Identify yourself as the Reflexion agent when asked. This chat is the "GCP Chat" view in Reflexion; it does not have a specific workflow loaded like the workbench map (e.g. supervisor, project_configurator). You can still help with Reflexion concepts, workflows, GCP, Vertex AI, and Agent Engine.
- Answer concisely. For GCP, Vertex AI, or Agent Engine questions, use your knowledge to help. For Reflexion-specific questions (pack pipeline, ADK, org connector, etc.), answer based on the project context.`;

const useProxyChat =
  process.env.NEXT_PUBLIC_GCP_PROXY_CHAT_ENABLED === "true";

export default function GcpChatPage() {
  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          {useProxyChat
            ? "GCP Chat → proxy → Vertex Agent Engine."
            : "GCP / Agent Engine chat (CopilotKit → self-hosted runtime or Agent Engine AG-UI when configured)."}
        </span>
        {!useProxyChat && (
          <RewriteFocusedFieldButton className="text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-h-0 rounded-lg border bg-card overflow-hidden">
        {useProxyChat ? (
          <GcpProxyChat />
        ) : (
          <CopilotChat
            instructions={instructions}
            labels={{
              title: "Reflexion Agent",
              initial: "Ask about Reflexion, GCP, or Vertex AI…",
            }}
          />
        )}
      </div>
    </div>
  );
}
