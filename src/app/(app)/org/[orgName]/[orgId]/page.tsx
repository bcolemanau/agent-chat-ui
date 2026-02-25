import { redirect } from "next/navigation";

export default async function OrgPage({
  params,
}: {
  params: Promise<{ orgName: string; orgId: string }>;
}) {
  const { orgName, orgId } = await params;
  redirect(`/org/${encodeURIComponent(orgName)}/${encodeURIComponent(orgId)}/map`);
}
