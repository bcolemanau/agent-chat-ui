import { redirect } from "next/navigation";

/** Legacy /org/[orgName]/project/[projectId] → redirect to canonical project map. */
export default async function LegacyProjectPage({
  params,
}: {
  params: Promise<{ orgName: string; projectId: string }>;
}) {
  const { orgName, projectId } = await params;
  redirect(
    `/org/${encodeURIComponent(orgName)}/${encodeURIComponent(orgName)}/project/${encodeURIComponent(projectId)}/${encodeURIComponent(projectId)}/map`
  );
}
