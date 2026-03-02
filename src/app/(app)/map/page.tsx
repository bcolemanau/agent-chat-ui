"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { WorldMapView } from "@/components/workbench/world-map-view";
import { ErrorBoundary } from "@/components/error-boundary";

/** Phase 3: Redirect flat /map to /org/[orgId]/map or /org/[orgId]/project/[projectId]/map when org in context.
 * Use projectId query when opening from E2E manifest so the project path uses the real project slug (not thread_id).
 * That way GET /workflow receives project_id=slug and returns the correct workflow (e.g. IOT). */
export default function MapPage() {
    const router = useRouter();
    const [threadId] = useQueryState("threadId");
    const [projectId] = useQueryState("projectId");
    const [orgIdFromQuery] = useQueryState("orgId");
    const [redirecting, setRedirecting] = useState(true);
    useEffect(() => {
        const org = typeof window !== "undefined" ? localStorage.getItem("reflexion_org_context") : null;
        const effectiveOrg = (orgIdFromQuery ?? org ?? "").trim();
        if (!effectiveOrg) {
            setRedirecting(false);
            return;
        }
        if (orgIdFromQuery) localStorage.setItem("reflexion_org_context", effectiveOrg);
        const projectSegment = (projectId ?? threadId ?? "").trim();
        if (projectSegment) {
            const qs = threadId ? `?threadId=${encodeURIComponent(threadId)}` : "";
            router.replace(`/org/${encodeURIComponent(effectiveOrg)}/${encodeURIComponent(effectiveOrg)}/project/${encodeURIComponent(projectSegment)}/${encodeURIComponent(projectSegment)}/map${qs}`);
        } else {
            router.replace(`/org/${encodeURIComponent(effectiveOrg)}/${encodeURIComponent(effectiveOrg)}/map`);
        }
    }, [router, threadId, projectId, orgIdFromQuery]);

    if (redirecting) return null;

    return (
        <ErrorBoundary
            name="WorldMapView"
            fallback={
                <div className="flex min-h-[50vh] items-center justify-center rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-6">
                    <p className="text-sm text-amber-800 dark:text-amber-200">Map failed to load. Reload the page to try again.</p>
                </div>
            }
        >
            <WorldMapView key={threadId ?? "no-thread"} />
        </ErrorBoundary>
    );
}
