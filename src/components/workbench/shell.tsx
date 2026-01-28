"use client";

import { Suspense, useState, useEffect, useLayoutEffect, useRef } from "react";
import { Sidebar } from "./sidebar";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { UserMenu } from "@/components/thread/user-menu";
import { Breadcrumbs } from "./breadcrumbs";
import { OrgSwitcher } from "./org-switcher";
import { useStreamContext } from "@/providers/Stream";
import { Thread } from "@/components/thread";
import { MessageSquare, Map as MapIcon, Workflow, Activity, X, PanelRight, Sparkles, Circle, Download, Minus, Maximize2 } from "lucide-react";
import { useRecording } from "@/providers/RecordingProvider";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useQueryState } from "nuqs";
import { cn } from "@/lib/utils";
import { useArtifactOpen, ArtifactContent, ArtifactTitle } from "@/components/thread/artifact";
import { PanelLeft, FileText, Layout, GitGraph, CheckSquare, AlertCircle } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { ProductPanel } from "@/components/product-panel/ProductPanel";
import { useUnifiedApprovals } from "./hooks/use-unified-approvals";
import { useApprovalCount } from "./hooks/use-approval-count";
import { ApprovalCard } from "./approval-card";
import { AlertCircle } from "lucide-react";

function DecisionsView() {
    const stream = useStreamContext();
    const approvals = useUnifiedApprovals();
    
    // Group approvals by type for better organization
    const groupedApprovals = approvals.reduce((acc, item) => {
        if (!acc[item.type]) {
            acc[item.type] = [];
        }
        acc[item.type].push(item);
        return acc;
    }, {} as Record<string, typeof approvals>);
    
    const approvalTypes = Object.keys(groupedApprovals);
    
    return (
        <div className="flex flex-col h-full overflow-auto p-6">
            <div className="mb-6 shrink-0">
                <h1 className="text-2xl font-semibold">Decisions</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Review and approve pending actions from agents
                </p>
            </div>
            
            {approvals.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                    <div className="text-center max-w-md">
                        <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No Pending Decisions</h3>
                        <p className="text-sm text-muted-foreground">
                            All approvals have been processed. New decisions will appear here when agents require your input.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col gap-6">
                    {approvalTypes.map((type) => (
                        <div key={type}>
                            <h2 className="text-lg font-medium mb-3 capitalize">
                                {getTypeLabel(type)} ({groupedApprovals[type].length})
                            </h2>
                            <div className="grid gap-4">
                                {groupedApprovals[type].map((item) => (
                                    <ApprovalCard
                                        key={item.id}
                                        item={item}
                                        stream={stream}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
        classify_intent: "Project Classification",
        propose_hydration_complete: "Hydration Complete",
        generate_concept_brief: "Concept Brief Options",
        approve_enrichment: "Enrichment",
        enrichment: "Enrichment",
    };
    return labels[type] || type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}

export function WorkbenchShell({ children }: { children: React.ReactNode }) {
    const stream = useStreamContext();
    const router = useRouter();
    const { status } = useSession();
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
    const [isWorkbenchMinimized, setIsWorkbenchMinimized] = useState(false);
    const [isWorkbenchMaximized, setIsWorkbenchMaximized] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isAgentPanelOpen, setIsAgentPanelOpen] = useState(true);
    const [isAgentPanelMinimized, setIsAgentPanelMinimized] = useState(false);
    const [isAgentPanelMaximized, setIsAgentPanelMaximized] = useState(false);
    const [agentPanelHeight, setAgentPanelHeight] = useState(400); // Default width in pixels (reused for right panel)
    const [isResizing, setIsResizing] = useState(false);
    const [isArtifactOpen, closeArtifact] = useArtifactOpen();
    const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const agentPanelRef = useRef<HTMLDivElement>(null);
    
    // Issue #14: Approval count for badge
    const approvalCount = useApprovalCount();
    const lastApprovalCount = useRef<number>(0);
    
    // Auth guard: redirect unauthenticated users to login
    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/");
        }
    }, [status, router]);

    // Agent-Driven View Synchronization (Backend -> UI)
    const workbenchView = (stream as any)?.values?.workbench_view;
    const lastSyncedView = useRef<string | undefined>(undefined);

    // Check for hydration proposal interrupt and navigate to hydration page
    useEffect(() => {
        const interrupts = (stream as any)?.interrupt;
        if (interrupts) {
            const interruptArray = Array.isArray(interrupts) ? interrupts : [interrupts];
            const hydrationInterrupt = interruptArray.find(
                (int: any) => {
                    const actionName = int?.value?.action_requests?.[0]?.name || int?.action_requests?.[0]?.name;
                    return actionName === "propose_hydration_complete";
                }
            );

            if (hydrationInterrupt && !window.location.pathname.includes("/workbench/hydration")) {
                console.log("[WorkbenchShell] Hydration proposal detected, navigating to hydration page");
                router.push("/workbench/hydration");
            }
        }
    }, [stream, router]);

    useEffect(() => {
        if (!workbenchView) return;

        // Only sync if the backend specifically changed its requested view
        // effectively treating it as an event rather than a state enforcement
        if (workbenchView !== lastSyncedView.current) {
            console.log(`[WorkbenchShell] Backend synced view to: ${workbenchView}`);
            lastSyncedView.current = workbenchView;

            if (["map", "workflow", "artifacts", "decisions"].includes(workbenchView)) {
                // Internal Sub-view Toggle
                setViewMode(workbenchView);
                closeArtifact();
                // Ensure we are on the map page if we switch to these sub-views
                if (!window.location.pathname.includes("/workbench/map")) {
                    router.push("/workbench/map");
                }
            } else if (workbenchView === "discovery") {
                router.push("/workbench/discovery");
            } else if (workbenchView === "settings") {
                router.push("/workbench/settings");
            } else if (workbenchView === "backlog") {
                router.push("/workbench/backlog");
            } else if (workbenchView === "hydration") {
                router.push("/workbench/hydration");
            }
        }
    }, [workbenchView, setViewMode, closeArtifact, router]);
    
    // Issue #14: Auto-routing to Decisions view when new approvals arrive
    useEffect(() => {
        const currentPath = window.location.pathname;
        const isOnDecisionsPage = currentPath.includes("/workbench/decisions");
        
        // If approval count increased and we're not already on decisions page, auto-route
        if (approvalCount > 0 && approvalCount > lastApprovalCount.current && !isOnDecisionsPage) {
            console.log(`[WorkbenchShell] New approvals detected (${approvalCount}), auto-routing to Decisions view`);
            router.push("/workbench/decisions");
        }
        
        lastApprovalCount.current = approvalCount;
    }, [approvalCount, router]);

    // User-Driven View Synchronization (UI -> Backend)
    useEffect(() => {
        if (!viewMode) return;

        // Detect manual user-initiated view changes (including URL updates)
        if (viewMode !== lastSyncedView.current) {
            console.log(`[WorkbenchShell] User-initiated view change to: ${viewMode}`);
            lastSyncedView.current = viewMode;
            stream.setWorkbenchView(viewMode as any).catch(e => {
                console.warn("[WorkbenchShell] Failed to sync view to backend:", e);
            });
        }
    }, [viewMode, stream]);

    // Handle panel resizing (now horizontal for right panel)
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            
            const container = document.querySelector('[data-workbench-container]') as HTMLElement;
            if (!container) return;
            
            const containerRect = container.getBoundingClientRect();
            const containerWidth = containerRect.width;
            
            // Calculate new agent panel width from right
            const mouseX = e.clientX;
            const relativeX = containerRect.right - mouseX;
            
            // Constrain between min and max widths
            const minWidth = 300; // Minimum 300px for agent panel
            const maxWidth = containerWidth - 400; // Leave at least 400px for workbench
            const newWidth = Math.max(minWidth, Math.min(maxWidth, relativeX));
            
            setAgentPanelHeight(newWidth); // Reusing agentPanelHeight state for width
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizing]);

    // Ensure layout is calculated synchronously before paint
    useLayoutEffect(() => {
        setIsMounted(true);
        // Force a layout recalculation
        if (agentPanelRef.current) {
            // Trigger a reflow to ensure height constraints are applied
            void agentPanelRef.current.offsetHeight;
        }
    }, []);

    // Recalculate when agent panel opens/closes
    useLayoutEffect(() => {
        if (isAgentPanelOpen && agentPanelRef.current) {
            // Force layout recalculation
            void agentPanelRef.current.offsetWidth;
        }
    }, [isAgentPanelOpen, agentPanelHeight]);

    if (status === "loading") {
        return (
            <div className="flex h-screen items-center justify-center">
                <span className="text-sm text-muted-foreground">Checking authentication…</span>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-background text-foreground overflow-hidden">
            {/* Sidebar - Collapsible */}
            <div className={cn(
                "relative transition-all duration-300 border-r bg-muted/20 flex flex-col h-full overflow-hidden",
                isSidebarCollapsed ? "w-0 border-0" : "w-64"
            )}>
                {!isSidebarCollapsed && <Sidebar />}
                {/* Collapse Toggle Button */}
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                        "absolute top-4 z-50 h-6 w-6 rounded-full border bg-background shadow-md hover:bg-muted transition-all",
                        isSidebarCollapsed ? "-right-3" : "-right-3"
                    )}
                    onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                >
                    <PanelLeft className={cn("h-3.5 w-3.5 transition-transform", isSidebarCollapsed && "rotate-180")} />
                </Button>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col h-full min-w-0" data-workbench-container>
                {/* Level 1: Global Context Header */}
                <header className="h-14 border-b flex items-center justify-between px-6 bg-background z-20 shrink-0">
                    <div className="flex items-center gap-4">
                        <Suspense fallback={<div className="h-4 w-32 bg-muted animate-pulse rounded" />}>
                            <Breadcrumbs />
                        </Suspense>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Workflow Status + Debug Agent Switcher */}
                        <div className="flex items-center gap-2 mr-2">
                            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-muted/50 border border-border shadow-sm">
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

                            {/* Debug-only agent switcher (quick manual override) */}
                            <div className="flex items-center gap-1">
                                {["supervisor", "hydrator", "concept"].map((agent) => (
                                    <Tooltip key={agent}>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className={cn(
                                                    "h-7 w-7 text-[10px] font-semibold uppercase rounded-full border border-dashed",
                                                    activeAgent === agent
                                                        ? "bg-primary/10 text-primary border-primary/40"
                                                        : "text-muted-foreground hover:text-foreground"
                                                )}
                                                onClick={() => {
                                                    const fn = (stream as any).setActiveAgentDebug as
                                                        | ((a: "supervisor" | "hydrator" | "concept") => Promise<void>)
                                                        | undefined;
                                                    if (fn) {
                                                        fn(agent as "supervisor" | "hydrator" | "concept").catch((e) =>
                                                            console.warn("[WorkbenchShell] Failed to set active agent (debug):", e)
                                                        );
                                                    } else {
                                                        console.warn("[WorkbenchShell] setActiveAgentDebug not available on stream context");
                                                    }
                                                }}
                                            >
                                                {agent.charAt(0).toUpperCase()}
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Debug: Switch to {agent} agent</TooltipContent>
                                    </Tooltip>
                                ))}
                            </div>
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

                        {/* Workbench Panel Trigger */}
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
                                    <Layout className="w-4 h-4" />
                                    {stream.isLoading && (
                                        <span className="absolute top-2 right-2 flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                                        </span>
                                    )}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Toggle Workbench</TooltipContent>
                        </Tooltip>

                        {/* Agent Panel Toggle */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setIsAgentPanelOpen(!isAgentPanelOpen)}
                                    className={cn(
                                        "h-9 w-9 text-muted-foreground hover:text-foreground relative transition-all",
                                        isAgentPanelOpen && "bg-muted text-foreground"
                                    )}
                                >
                                    <MessageSquare className="w-4 h-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Toggle Agent Chat</TooltipContent>
                        </Tooltip>

                        <UserMenu />
                    </div>
                </header>

                {/* Level 3: Content Stage - Workbench in center, Chat on right */}
                <div className="flex-1 flex overflow-hidden min-h-0">
                    {/* Center Area - Workbench (and NodeDetailPanel when node selected) */}
                    <div 
                        className="flex flex-col overflow-hidden min-h-0 transition-all"
                        style={{
                            width: isWorkbenchMaximized ? '100%' : isAgentPanelOpen && !isAgentPanelMinimized && !isAgentPanelMaximized ? `calc(100% - ${agentPanelHeight}px)` : '100%',
                            maxWidth: isWorkbenchMaximized ? '100%' : isAgentPanelOpen && !isAgentPanelMinimized && !isAgentPanelMaximized ? `calc(100% - ${agentPanelHeight}px)` : '100%'
                        }}
                    >
                        {isWorkbenchOpen && (
                            <aside className={cn(
                                "border-l bg-background flex flex-col shadow-xl z-30 transition-all",
                                isWorkbenchMinimized ? "h-12" : "flex-1"
                            )}>
                            {/* Workbench Tabs - Now inside the Right Pane */}
                            <div className="h-12 border-b flex items-center justify-between px-6 bg-muted/10 shrink-0">
                                <div className="flex items-center space-x-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                            "h-8 px-3 gap-2 text-xs font-medium transition-all",
                                            viewMode === "map" ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                        )}
                                        onClick={() => { setViewMode("map"); closeArtifact(); stream.setWorkbenchView("map"); }}
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
                                        onClick={() => { setViewMode("workflow"); closeArtifact(); stream.setWorkbenchView("workflow"); }}
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
                                        onClick={() => { setViewMode("artifacts"); closeArtifact(); stream.setWorkbenchView("artifacts"); }}
                                    >
                                        <FileText className="w-3.5 h-3.5" />
                                        Artifacts
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                            "h-8 px-3 gap-2 text-xs font-medium transition-all relative",
                                            viewMode === "decisions" ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                        )}
                                        onClick={() => { 
                                            router.push("/workbench/decisions");
                                            closeArtifact();
                                        }}
                                    >
                                        <CheckSquare className="w-3.5 h-3.5" />
                                        Decisions
                                        {approvalCount > 0 && (
                                            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                                                {approvalCount > 9 ? "9+" : approvalCount}
                                            </span>
                                        )}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                            "h-8 px-3 gap-2 text-xs font-medium transition-all",
                                            viewMode === "decisions" ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                        )}
                                        onClick={() => { setViewMode("decisions"); closeArtifact(); stream.setWorkbenchView("decisions" as any); }}
                                    >
                                        <CheckSquare className="w-3.5 h-3.5" />
                                        Decisions
                                    </Button>
                                </div>
                                {/* Workbench Panel Controls */}
                                <div className="flex items-center gap-1">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                                onClick={() => {
                                                    setIsWorkbenchMinimized(!isWorkbenchMinimized);
                                                    if (isWorkbenchMinimized && isWorkbenchMaximized) {
                                                        setIsWorkbenchMaximized(false);
                                                    }
                                                }}
                                            >
                                                <Minus className="h-3.5 w-3.5" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>{isWorkbenchMinimized ? "Restore Workbench" : "Minimize Workbench"}</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                                onClick={() => {
                                                    setIsWorkbenchMaximized(!isWorkbenchMaximized);
                                                    if (isWorkbenchMaximized) {
                                                        setIsAgentPanelMaximized(false);
                                                    }
                                                }}
                                            >
                                                <Maximize2 className={cn("h-3.5 w-3.5", isWorkbenchMaximized && "rotate-180")} />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>{isWorkbenchMaximized ? "Restore Workbench" : "Maximize Workbench"}</TooltipContent>
                                    </Tooltip>
                                </div>
                            </div>

                            {/* Workbench Content */}
                            {!isWorkbenchMinimized && (isArtifactOpen ? (
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
                            ) : viewMode === "decisions" ? (
                                <div className="h-full w-full overflow-hidden">
                                    <DecisionsView />
                                </div>
                            ) : (
                                <div className="h-full w-full overflow-hidden">
                                    {children}
                                </div>
                            ))}
                            </aside>
                        )}
                    </div>

                    {/* Resizable Divider - Vertical */}
                    {isAgentPanelOpen && !isAgentPanelMinimized && !isWorkbenchMaximized && (
                        <div
                            className={cn(
                                "w-1 border-l border-r bg-border cursor-col-resize hover:bg-primary/20 transition-colors relative group",
                                isResizing && "bg-primary/30"
                            )}
                            onMouseDown={handleMouseDown}
                            style={{ minWidth: '4px' }}
                        >
                            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 flex items-center justify-center">
                                <div className="w-0.5 h-16 bg-muted-foreground/30 group-hover:bg-primary/50 rounded-full transition-colors" />
                            </div>
                        </div>
                    )}

                    {/* Agent Chat Panel - Right */}
                    <div 
                        ref={agentPanelRef}
                        className={cn(
                            "relative shrink-0 overflow-hidden border-l transition-all",
                            isAgentPanelMaximized ? "w-full" : isAgentPanelOpen && !isAgentPanelMinimized ? "" : "w-0"
                        )}
                        style={{ 
                            width: isAgentPanelOpen && !isAgentPanelMaximized ? (isAgentPanelMinimized ? '0px' : `${agentPanelHeight}px`) : isAgentPanelMaximized ? '100%' : '0px', 
                            maxWidth: isAgentPanelOpen && !isAgentPanelMaximized ? (isAgentPanelMinimized ? '0px' : `${agentPanelHeight}px`) : isAgentPanelMaximized ? '100%' : '0px',
                            minWidth: isAgentPanelOpen && !isAgentPanelMaximized ? (isAgentPanelMinimized ? '0px' : `${agentPanelHeight}px`) : isAgentPanelMaximized ? '100%' : '0px'
                        }}
                    >
                        {isAgentPanelOpen && isMounted ? (
                            <div 
                                className={cn(
                                    "bg-background transition-all duration-300 flex flex-col h-full overflow-hidden",
                                    !isResizing && "transition-all",
                                    isAgentPanelMinimized && "h-10"
                                )}
                                style={{ height: isAgentPanelMinimized ? '40px' : '100%', maxHeight: isAgentPanelMinimized ? '40px' : '100%' }}
                            >
                                {/* Agent Panel Header */}
                                <div className="h-10 border-b flex items-center justify-between px-4 bg-muted/30 shrink-0" style={{ flexShrink: 0, height: '40px' }}>
                                    <div className="flex items-center gap-2">
                                        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="text-xs font-semibold text-foreground">Agent Chat</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                                    onClick={() => {
                                                        setIsAgentPanelMinimized(!isAgentPanelMinimized);
                                                        if (isAgentPanelMinimized && isAgentPanelMaximized) {
                                                            setIsAgentPanelMaximized(false);
                                                        }
                                                    }}
                                                >
                                                    <Minus className="h-3.5 w-3.5" />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>{isAgentPanelMinimized ? "Restore Chat" : "Minimize Chat"}</TooltipContent>
                                        </Tooltip>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                                    onClick={() => {
                                                        setIsAgentPanelMaximized(!isAgentPanelMaximized);
                                                        if (isAgentPanelMaximized) {
                                                            setIsWorkbenchMaximized(false);
                                                        }
                                                    }}
                                                >
                                                    <Maximize2 className={cn("h-3.5 w-3.5", isAgentPanelMaximized && "rotate-180")} />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>{isAgentPanelMaximized ? "Restore Chat" : "Maximize Chat"}</TooltipContent>
                                        </Tooltip>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() => setIsAgentPanelOpen(false)}
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                                {/* Agent Chat Content */}
                                {!isAgentPanelMinimized && (
                                    <div className="flex-1 min-h-0 overflow-hidden bg-background" style={{ 
                                        height: `calc(100% - 40px)`, 
                                        maxHeight: `calc(100% - 40px)`, 
                                        display: 'flex', 
                                        flexDirection: 'column',
                                        flex: '1 1 auto'
                                    }}>
                                        <div className="h-full w-full overflow-hidden" style={{ 
                                            maxHeight: '100%', 
                                            height: '100%', 
                                            display: 'flex', 
                                            flexDirection: 'column' 
                                        }}>
                                            <Thread embedded hideArtifacts />
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : isAgentPanelOpen && !isMounted ? (
                            <div className="bg-background flex flex-col h-full overflow-hidden">
                                <div className="h-10 border-b flex items-center justify-between px-4 bg-muted/30 shrink-0">
                                    <div className="flex items-center gap-2">
                                        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="text-xs font-semibold text-foreground">Agent Chat</span>
                                    </div>
                                </div>
                                <div className="flex-1 min-h-0 overflow-hidden bg-background flex items-center justify-center">
                                    <div className="text-xs text-muted-foreground">Loading...</div>
                                </div>
                            </div>
                        ) : (
                            /* Agent Panel Toggle - Show when collapsed */
                            <Button
                                variant="ghost"
                                size="sm"
                                className="absolute top-1/2 right-4 -translate-y-1/2 h-8 px-3 bg-background border shadow-md hover:bg-muted z-50"
                                onClick={() => setIsAgentPanelOpen(true)}
                            >
                                <MessageSquare className="h-3.5 w-3.5 mr-2" />
                                <span className="text-xs">Show Agent Chat</span>
                            </Button>
                        )}
                    </div>
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
