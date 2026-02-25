"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";

/** Canonical route: /org/[orgName]/[orgId]/project/[projectName]/[projectId]/... */
export type RouteScope = {
  orgId: string | null;
  projectId: string | null;
  /** Name segment (slug) for URL building; null when on legacy URL. */
  orgName: string | null;
  projectName: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(s: string): boolean {
  return Boolean(s && UUID_RE.test(s));
}

/**
 * Parses pathname for org/project scope.
 * Supports canonical /org/[orgName]/[orgId]/project/[projectName]/[projectId] and
 * legacy /org/[orgId] and /org/[orgId]/project/[projectId].
 */
export function useRouteScope(): RouteScope {
  const pathname = usePathname();
  return useMemo((): RouteScope => {
    if (!pathname || typeof pathname !== "string")
      return { orgId: null, projectId: null, orgName: null, projectName: null };
    const segments = pathname.split("/").filter(Boolean);
    if (segments[0] !== "org" || segments.length < 2)
      return { orgId: null, projectId: null, orgName: null, projectName: null };

    // Canonical: /org/[orgName]/[orgId]/project/[projectName]/[projectId]
    if (segments.length >= 6 && segments[3] === "project") {
      return {
        orgId: segments[2],
        projectId: segments[5],
        orgName: segments[1],
        projectName: segments[4],
      };
    }
    // Canonical org only: /org/[orgName]/[orgId]
    if (segments.length >= 3 && segments[2] !== "project") {
      return {
        orgId: segments[2],
        projectId: null,
        orgName: segments[1],
        projectName: null,
      };
    }

    // Legacy: /org/[orgId] or /org/[orgId]/project/[projectId]
    const orgId = segments[1];
    if (segments[2] === "project" && segments.length >= 4) {
      return { orgId, projectId: segments[3], orgName: null, projectName: null };
    }
    return { orgId, projectId: null, orgName: null, projectName: null };
  }, [pathname]);
}
