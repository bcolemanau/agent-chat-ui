"use client";

import { useEffect } from "react";

export function OrgScopeSync({
  orgId,
  children,
}: {
  orgId: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const current = localStorage.getItem("reflexion_org_context");
    if (current !== orgId) {
      localStorage.setItem("reflexion_org_context", orgId);
      window.dispatchEvent(new CustomEvent("orgContextChanged"));
    }
  }, [orgId]);

  return <>{children}</>;
}
