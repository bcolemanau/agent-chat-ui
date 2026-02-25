"use client";

import { useEffect, useState } from "react";
import { useRouteScope } from "@/hooks/use-route-scope";
import { orgContextRef } from "@/lib/api-fetch";

const ORG_CONTEXT_KEY = "reflexion_org_context";

/**
 * Keeps orgContextRef in sync with route + localStorage so apiFetch() injects
 * X-Organization-Context consistently. Mount once in the app layout (client tree).
 */
export function OrgContextRefProvider({ children }: { children: React.ReactNode }) {
  const routeScope = useRouteScope();
  const [localOrgId, setLocalOrgId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const read = () => setLocalOrgId(localStorage.getItem(ORG_CONTEXT_KEY));
    read();
    window.addEventListener("orgContextChanged", read);
    return () => window.removeEventListener("orgContextChanged", read);
  }, []);

  const effectiveOrgId = routeScope.orgId ?? localOrgId ?? null;

  useEffect(() => {
    orgContextRef.current = effectiveOrgId;
    return () => {
      orgContextRef.current = null;
    };
  }, [effectiveOrgId]);

  return <>{children}</>;
}
