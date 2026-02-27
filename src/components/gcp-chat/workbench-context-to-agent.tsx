"use client";

import { useCopilotReadable } from "@copilotkit/react-core";
import { useRouteScope } from "@/hooks/use-route-scope";
import { useQueryState } from "nuqs";

/**
 * Passes workbench context (org_id, project_id, thread_id) to the CopilotKit/AG-UI agent.
 * Used when GCP Chat is in workbench scope so the agent (or AG-UI bridge) can use
 * project/KG context for KG-aware responses.
 */
export function WorkbenchContextToAgent() {
  const { orgId, projectId } = useRouteScope();
  const [threadId] = useQueryState("threadId");

  const context = {
    org_id: orgId ?? undefined,
    project_id: projectId ?? undefined,
    thread_id: threadId ?? undefined,
  };

  useCopilotReadable({
    description: "Workbench context: org_id, project_id, thread_id for KG-aware chat",
    value: context,
  });

  return null;
}
