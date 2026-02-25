import { redirect } from "next/navigation";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ orgName: string; orgId: string; projectName: string; projectId: string }>;
}) {
  const { orgName, orgId, projectName, projectId } = await params;
  redirect(
    `/org/${encodeURIComponent(orgName)}/${encodeURIComponent(orgId)}/project/${encodeURIComponent(projectName)}/${encodeURIComponent(projectId)}/map`
  );
}
