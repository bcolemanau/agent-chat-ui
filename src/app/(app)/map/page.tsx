"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { WorldMapView } from "@/components/workbench/world-map-view";
import { ErrorBoundary } from "@/components/error-boundary";

/** Phase 3: Redirect flat /map to /org/[orgId]/map or /org/[orgId]/project/[projectId]/map when org in context. */
export default function MapPage() {
    const router = useRouter();
    const [threadId] = useQueryState("threadId");
    const [redirecting, setRedirecting] = useState(true);
    useEffect(() => {
        const org = typeof window !== "undefined" ? localStorage.getItem("reflexion_org_context") : null;
        if (!org?.trim()) {
            setRedirecting(false);
            return;
        }
        if (threadId) router.replace(`/org/${encodeURIComponent(org)}/${encodeURIComponent(org)}/project/${encodeURIComponent(threadId)}/${encodeURIComponent(threadId)}/map`);
        else router.replace(`/org/${encodeURIComponent(org)}/${encodeURIComponent(org)}/map`);
    }, [router, threadId]);

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
