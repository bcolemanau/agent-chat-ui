"use client";

import { Suspense, useState, useEffect } from "react";
import { Sidebar } from "./sidebar";
import { useRouter } from "next/navigation";
import { UserMenu } from "@/components/thread/user-menu";
import { Breadcrumbs } from "./breadcrumbs";
import { OrgSwitcher } from "./org-switcher";
import { useStreamContext } from "@/providers/Stream";
import { Thread } from "@/components/thread";
import { MessageSquare, Map as MapIcon, Workflow, Activity, X, PanelRight, Sparkles, Circle, Download } from "lucide-react";
import { useRecording } from "@/providers/RecordingProvider";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useQueryState } from "nuqs";
import { cn } from "@/lib/utils";
import { useArtifactOpen, ArtifactContent, ArtifactTitle } from "@/components/thread/artifact";
import { PanelLeft, FileText, Layout, GitGraph } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { ProductPanel } from "@/components/product-panel/ProductPanel";

export function WorkbenchShell({ children }: { children: React.ReactNode }) {
    const stream = useStreamContext();
    const { isRecording, startRecording, stopRecording, downloadRecording } = useRecording();

    // Robust Mode Derivation
    const values = (stream as any)?.values;
    const rawAgent = values?.active_agent;
    // Fallback: If active_agent is missing, infer from visualization content or default to supervisor
    const activeAgent = rawAgent ||
        (values?.visualization_html?.includes("active_node='hydrator'") || values?.visualization_html?.includes("Hydrator")
            ? "hydrator"
            : "supervisor");

    const [viewMode, setViewMode] = useQueryState("view", { defaultValue: "map" });
    const [isWorkbenchOpen, setIsWorkbenchOpen] = useState(true);
    const [isArtifactOpen, closeArtifact] = useArtifactOpen();
    const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
    const router = useRouter();

    // Agent-Driven View Synchronization
    const workbenchView = (stream as any)?.values?.workbench_view;
    useEffect(() => {
        if (!workbenchView) return;

        console.log(`[WorkbenchShell] Syncing view to: ${workbenchView}`);

        if (["map", "workflow", "artifacts"].includes(workbenchView)) {
            // Internal Sub-view Toggle
            if (viewMode !== workbenchView) {
                setViewMode(workbenchView);
                closeArtifact();
                // Ensure we are on the map page if we switch to these sub-views
                if (!window.location.pathname.includes("/workbench/map")) {
                    router.push("/workbench/map");
                }
            }
        } else if (workbenchView === "discovery") {
            router.push("/workbench/discovery");
        } else if (workbenchView === "settings") {
            router.push("/workbench/settings");
        } else if (workbenchView === "backlog") {
            router.push("/workbench/backlog");
        }
    }, [workbenchView, setViewMode, closeArtifact, router, viewMode]);

    return (
        <div className="flex h-screen bg-background text-foreground overflow-hidden">
            {/* Sidebar */}
            <Sidebar />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col h-full min-w-0">
                {/* Level 1: Global Context Header */}
                <header className="h-14 border-b flex items-center justify-between px-6 bg-background z-20 shrink-0">
                    <div className="flex items-center gap-4">
                        <Suspense fallback={<div className="h-4 w-32 bg-muted animate-pulse rounded" />}>
                            <Breadcrumbs />
                        </Suspense>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Workflow Status */}
                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-muted/50 border border-border shadow-sm mr-2">
                            <Activity className={cn(
                                "w-3.5 h-3.5",
                                stream.isLoading ? "text-amber-500 animate-pulse" : "text-emerald-500"
                            )} />
                            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                Mode:
                            </span>
                            <span className="text-xs font-semibold text-foreground capitalize">
                                {activeAgent}
                            </span>
                        </div>

                        <div className="h-6 w-[1px] bg-border mx-1" />

                        {/* What's New Trigger */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setReleaseNotesOpen(true)}
                                    className="h-9 w-9 text-muted-foreground hover:text-foreground relative"
                                >
                                    <Sparkles className="w-4 h-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>What's New</TooltipContent>
                        </Tooltip>

                        {/* Theme Toggle at Global Level */}
                        <ThemeToggle />

                        {/* Session Recording (Debug) */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                        if (isRecording) {
                                            stopRecording();
                                            downloadRecording();
                                        } else {
                                            startRecording();
                                        }
                                    }}
                                    className={cn(
                                        "h-9 w-9 text-muted-foreground hover:text-foreground relative",
                                        isRecording && "text-red-500 hover:text-red-600 animate-pulse bg-red-500/10"
                                    )}
                                >
                                    {isRecording ? <Download className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {isRecording ? "Stop & Download Session" : "Record Session (Debug)"}
                            </TooltipContent>
                        </Tooltip>

                        {/* Workbench Sidebar Trigger */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setIsWorkbenchOpen(!isWorkbenchOpen)}
                                    className={cn(
                                        "h-9 w-9 text-muted-foreground hover:text-foreground relative transition-all",
                                        isWorkbenchOpen && "bg-muted text-foreground"
                                    )}
                                >
                                    <PanelRight className="w-4 h-4" />
                                    {stream.isLoading && (
                                        <span className="absolute top-2 right-2 flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                                        </span>
                                    )}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Toggle Workbench Panel</TooltipContent>
                        </Tooltip>

                        <UserMenu />
                    </div>
                </header>

                {/* Level 3: Content Stage */}
                <div className="flex-1 flex overflow-hidden">
                    <main className="flex-1 overflow-auto relative bg-background custom-scrollbar">
                        <div className="h-full w-full">
                            <Thread embedded hideArtifacts />
                        </div>
                    </main>

                    {isWorkbenchOpen && (
                        <aside className="w-[45%] min-w-[500px] border-l bg-background flex flex-col animate-in slide-in-from-right duration-300 shadow-xl z-30">
                            {/* Workbench Tabs - Now inside the Right Pane */}
                            <div className="h-12 border-b flex items-center px-6 bg-muted/10 shrink-0">
                                <div className="flex items-center space-x-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                            "h-8 px-3 gap-2 text-xs font-medium transition-all",
                                            viewMode === "map" ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                        )}
                                        onClick={() => { setViewMode("map"); closeArtifact(); }}
                                    >
                                        <MapIcon className="w-3.5 h-3.5" />
                                        Map
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                            "h-8 px-3 gap-2 text-xs font-medium transition-all",
                                            viewMode === "workflow" ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                        )}
                                        onClick={() => { setViewMode("workflow"); closeArtifact(); }}
                                    >
                                        <Workflow className="w-3.5 h-3.5" />
                                        Workflow
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                            "h-8 px-3 gap-2 text-xs font-medium transition-all",
                                            viewMode === "artifacts" ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                        )}
                                        onClick={() => { setViewMode("artifacts"); closeArtifact(); }}
                                    >
                                        <FileText className="w-3.5 h-3.5" />
                                        Artifacts
                                    </Button>
                                </div>
                            </div>

                            {/* Workbench Content */}
                            {isArtifactOpen ? (
                                <div className="h-full w-full flex flex-col relative">
                                    <div className="flex items-center justify-between border-b px-6 py-3 bg-background/95 backdrop-blur-sm sticky top-0 z-10 shrink-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mr-2">Artifact Viewer</span>
                                            <ArtifactTitle className="text-sm font-medium" />
                                        </div>
                                        <Button variant="ghost" size="sm" onClick={closeArtifact} className="h-8 w-8 p-0">
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <div className="flex-1 overflow-auto p-6 bg-muted/5">
                                        <ArtifactContent className="max-w-4xl mx-auto bg-background border rounded-lg shadow-sm min-h-[500px]" />
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full w-full overflow-hidden">
                                    {children}
                                </div>
                            )}
                        </aside>
                    )}
                </div>
            </div>

            <ProductPanel open={releaseNotesOpen} onClose={() => setReleaseNotesOpen(false)} />

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                    height: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.2);
                }
            `}</style>
        </div >
    );
}
