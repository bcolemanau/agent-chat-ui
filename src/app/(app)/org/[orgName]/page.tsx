import { redirect } from "next/navigation";

/** Legacy single-segment /org/[orgName] → redirect to canonical /org/[orgName]/[orgId]. */
export default async function LegacyOrgPage({
  params,
}: {
  params: Promise<{ orgName: string }>;
}) {
  const { orgName } = await params;
  redirect(`/org/${encodeURIComponent(orgName)}/${encodeURIComponent(orgName)}/map`);
}
