"use client";

import { WorldMapView } from "@/components/workbench/world-map-view";
import { ErrorBoundary } from "@/components/error-boundary";
import { useRouteScope } from "@/hooks/use-route-scope";

/** Phase 3: Project-level map. projectId from path is used as threadId by Stream/shell. */
export default function ProjectMapPage() {
  const { projectId } = useRouteScope();
  return (
    <ErrorBoundary
      name="WorldMapView"
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-6">
          <p className="text-sm text-amber-800 dark:text-amber-200">Map failed to load. Reload the page to try again.</p>
        </div>
      }
    >
      <WorldMapView key={projectId ?? "no-project"} />
    </ErrorBoundary>
  );
}
