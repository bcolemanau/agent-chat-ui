import { OrgNameLayoutClient } from "./org-name-layout-client";

/**
 * Layout for /org/[orgName] (legacy single segment) and /org/[orgName]/[orgId] (canonical).
 * First dynamic segment is always [orgName] so Next.js accepts both route shapes.
 */
export default async function OrgNameLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgName: string }>;
}) {
  const { orgName } = await params;
  return <OrgNameLayoutClient orgName={orgName}>{children}</OrgNameLayoutClient>;
}
