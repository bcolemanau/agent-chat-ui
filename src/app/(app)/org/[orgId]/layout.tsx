import { OrgScopeSync } from "./org-scope-sync";

/**
 * Phase 3: Org scope. Sync orgId from URL to localStorage so API calls use it.
 */
export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  return <OrgScopeSync orgId={orgId}>{children}</OrgScopeSync>;
}
