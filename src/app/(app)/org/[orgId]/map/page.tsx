"use client";

import { WorldMapView } from "@/components/workbench/world-map-view";
import { ErrorBoundary } from "@/components/error-boundary";

/** Phase 3: Org-level map (no project selected). */
export default function OrgMapPage() {
  return (
    <ErrorBoundary
      name="WorldMapView"
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-6">
          <p className="text-sm text-amber-800 dark:text-amber-200">Map failed to load. Reload the page to try again.</p>
        </div>
      }
    >
      <WorldMapView key="org-map" />
    </ErrorBoundary>
  );
}
