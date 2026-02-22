import { redirect } from "next/navigation";

/**
 * Redirect workbench /backlog → /integrations (Phase 1 route refactor).
 */
export default async function WorkbenchBacklogRedirect({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = await searchParams;
    const q = new URLSearchParams(params as Record<string, string>).toString();
    redirect(`/integrations${q ? `?${q}` : ""}`);
}
