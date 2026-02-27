"use client";

import { CopilotKit } from "@copilotkit/react-core";
import { WorkbenchContextToAgent } from "@/components/gcp-chat/workbench-context-to-agent";

const runtimeUrl =
  process.env.NEXT_PUBLIC_AGENT_ENGINE_AG_UI_URL ?? "/api/copilotkit";

/** When proxy chat is enabled, we don't need CopilotKit; the page renders GcpProxyChat which uses /api/gcp-proxy-chat. */
const useProxyChat =
  process.env.NEXT_PUBLIC_GCP_PROXY_CHAT_ENABLED === "true";

export function GcpChatCopilotLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (useProxyChat) {
    return <>{children}</>;
  }
  return (
    <CopilotKit runtimeUrl={runtimeUrl} agent="default">
      <WorkbenchContextToAgent />
      {children}
    </CopilotKit>
  );
}
