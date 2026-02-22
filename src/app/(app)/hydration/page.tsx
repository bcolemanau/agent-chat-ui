import { redirect } from "next/navigation";

/**
 * Redirect /hydration → /decisions (Phase 1 route refactor).
 * "Project configuration complete for now" is approved from the Decisions panel.
 * @see docs/ROUTE_REFACTORING_PLAN.md
 */
export default async function HydrationRedirect({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = await searchParams;
    const q = new URLSearchParams(params as Record<string, string>).toString();
    redirect(`/decisions${q ? `?${q}` : ""}`);
}
