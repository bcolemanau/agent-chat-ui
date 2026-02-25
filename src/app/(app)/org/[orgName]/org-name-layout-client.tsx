"use client";

import { usePathname } from "next/navigation";
import { OrgScopeSync } from "./org-scope-sync";
import { LegacyOrgRedirect } from "./legacy-org-redirect";

/**
 * Wraps legacy single-segment /org/[orgName] with redirect + scope sync.
 * For /org/[orgName]/[orgId]/... just passes children through.
 */
export function OrgNameLayoutClient({
  orgName,
  children,
}: {
  orgName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const isLegacyRoute =
    segments[0] === "org" &&
    segments[1] === orgName &&
    (segments[2] == null || segments[2] === "project");

  if (isLegacyRoute) {
    return (
      <LegacyOrgRedirect orgId={orgName}>
        <OrgScopeSync orgId={orgName}>{children}</OrgScopeSync>
      </LegacyOrgRedirect>
    );
  }
  return <>{children}</>;
}
