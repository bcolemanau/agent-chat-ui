"use client";

import { CopilotKit } from "@copilotkit/react-core";
import { WorkbenchContextToAgent } from "@/components/gcp-chat/workbench-context-to-agent";

const runtimeUrl =
  process.env.NEXT_PUBLIC_AGENT_ENGINE_AG_UI_URL ?? "/api/copilotkit";

export default function GcpChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CopilotKit runtimeUrl={runtimeUrl} agent="default">
      <WorkbenchContextToAgent />
      {children}
    </CopilotKit>
  );
}
