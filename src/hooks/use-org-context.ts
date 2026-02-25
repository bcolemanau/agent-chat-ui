"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouteScope } from "@/hooks/use-route-scope";

const ORG_CONTEXT_KEY = "reflexion_org_context";

/**
 * Effective organization context for API calls: route first, then localStorage.
 * Use apiHeaders when calling org-scoped APIs so X-Organization-Context is sent consistently.
 *
 * @see docs/ORG_CONTEXT_AND_HEADERS.md
 */
export function useOrgContext(): {
  orgId: string | null;
  projectId: string | null;
  /** Headers to merge into fetch() for org-scoped requests. Empty if no org context. */
  apiHeaders: Record<string, string>;
} {
  const routeScope = useRouteScope();
  const [localOrgId, setLocalOrgId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setLocalOrgId(localStorage.getItem(ORG_CONTEXT_KEY));
  }, []);

  return useMemo(() => {
    const orgId = routeScope.orgId ?? localOrgId;
    const apiHeaders: Record<string, string> =
      orgId != null && orgId !== "" ? { "X-Organization-Context": orgId } : {};
    return {
      orgId: orgId ?? null,
      projectId: routeScope.projectId,
      apiHeaders,
    };
  }, [routeScope.orgId, routeScope.projectId, localOrgId]);
}
