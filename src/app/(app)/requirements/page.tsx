import { redirect } from "next/navigation";

/**
 * Redirect /requirements → /decisions (Phase 1 route refactor).
 * Requirements approval is reached from the Decisions list (generic artifact approval).
 * @see docs/ROUTE_REFACTORING_PLAN.md
 */
export default async function RequirementsRedirect({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = await searchParams;
    const q = new URLSearchParams(params as Record<string, string>).toString();
    redirect(`/decisions${q ? `?${q}` : ""}`);
}
