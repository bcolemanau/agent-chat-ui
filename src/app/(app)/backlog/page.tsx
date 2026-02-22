import { redirect } from "next/navigation";

/**
 * Redirect /backlog → /integrations (Phase 1 route refactor).
 * Project Management (sync projects/issues) now lives under Integrations.
 * @see docs/ROUTE_REFACTORING_PLAN.md
 */
export default async function BacklogRedirect({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = await searchParams;
    const q = new URLSearchParams(params as Record<string, string>).toString();
    redirect(`/integrations${q ? `?${q}` : ""}`);
}
