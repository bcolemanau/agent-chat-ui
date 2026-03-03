"use client";

import { CopilotChat } from "@copilotkit/react-ui";
import { RewriteFocusedFieldButton } from "@/components/chrome-rewriter-toolbar";

const instructions = `You are a helpful assistant for the Reflexion project (agentic coding / architecture).
Answer concisely. If the user asks about GCP, Vertex AI, or Agent Engine, use your knowledge to help.`;

export default function GcpChatPage() {
  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          GCP / Agent Engine chat (CopilotKit → self-hosted runtime or Agent
          Engine AG-UI when configured).
        </span>
        <RewriteFocusedFieldButton className="text-muted-foreground" />
      </div>
      <div className="flex-1 min-h-0 rounded-lg border bg-card">
        <CopilotChat
          instructions={instructions}
          labels={{
            title: "GCP Chat",
            initial: "Ask about Reflexion, GCP, or Vertex AI…",
          }}
        />
      </div>
    </div>
  );
}
