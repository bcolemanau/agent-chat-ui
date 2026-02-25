import { OrgScopeSync } from "./org-scope-sync";
import { LegacyOrgRedirect } from "./legacy-org-redirect";

/**
 * Legacy route: /org/[orgId] and /org/[orgId]/project/[projectId].
 * Syncs org context and redirects to canonical /org/[orgName]/[orgId] (and project path when present).
 */
export default async function LegacyOrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  return (
    <LegacyOrgRedirect orgId={orgId}>
      <OrgScopeSync orgId={orgId}>{children}</OrgScopeSync>
    </LegacyOrgRedirect>
  );
}
