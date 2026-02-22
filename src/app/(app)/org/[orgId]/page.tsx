import { redirect } from "next/navigation";

export default async function OrgPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  redirect(`/org/${encodeURIComponent(orgId)}/map`);
}
