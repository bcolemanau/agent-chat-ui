import { OrgScopeSync } from "./org-scope-sync";

/** Canonical org route: /org/[orgName]/[orgId]. Sync orgId from URL for API calls. */
export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgName: string; orgId: string }>;
}) {
  const { orgId } = await params;
  return <OrgScopeSync orgId={orgId}>{children}</OrgScopeSync>;
}
