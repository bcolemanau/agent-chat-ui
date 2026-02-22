"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";

/**
 * Parses pathname for Phase 3 route shape: /org/[orgId] and /org/[orgId]/project/[projectId].
 * Returns { orgId, projectId } when on those routes; otherwise nulls.
 */
export function useRouteScope(): { orgId: string | null; projectId: string | null } {
  const pathname = usePathname();
  return useMemo(() => {
    if (!pathname || typeof pathname !== "string") return { orgId: null, projectId: null };
    const segments = pathname.split("/").filter(Boolean);
    // /org/[orgId] -> segments = ['org', orgId]
    // /org/[orgId]/project/[projectId] -> segments = ['org', orgId, 'project', projectId]
    if (segments[0] !== "org" || segments.length < 2) return { orgId: null, projectId: null };
    const orgId = segments[1];
    if (segments[2] === "project" && segments.length >= 4) {
      return { orgId, projectId: segments[3] };
    }
    return { orgId, projectId: null };
  }, [pathname]);
}
