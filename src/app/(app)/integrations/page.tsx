"use client";

import React from "react";
import { Plug, ExternalLink } from "lucide-react";
import Link from "next/link";
import { BacklogView } from "@/components/workbench/backlog-view";

/**
 * Product-level Integrations page (Phase 1 route refactor).
 * - Product-level integrations overview and link to Settings → Integrations.
 * - Project Management (sync projects/issues) view lives here; also configurable under Settings → Integrations.
 * @see docs/ROUTE_REFACTORING_PLAN.md
 */
export default function IntegrationsPage() {
    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="shrink-0 border-b bg-muted/10 px-6 py-4">
                <div className="max-w-6xl mx-auto flex flex-col gap-2">
                    <div className="flex items-center gap-3 text-primary">
                        <div className="p-2 bg-primary/10 rounded-lg">
                            <Plug className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
                            <p className="text-sm text-muted-foreground">
                                Product-level integrations and Project Management (sync projects/issues). Configure OAuth and sync in{" "}
                                <Link href="/settings" className="text-primary underline underline-offset-2 hover:no-underline inline-flex items-center gap-1">
                                    Settings → Integrations
                                    <ExternalLink className="w-3.5 h-3.5" />
                                </Link>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
                <BacklogView />
            </div>
        </div>
    );
}
