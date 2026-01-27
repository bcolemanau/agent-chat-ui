"use client";

import { Suspense, useState, useEffect, useLayoutEffect, useRef } from "react";
import { Sidebar } from "./sidebar";
import { useRouter } from "next/navigation";
import { UserMenu } from "@/components/thread/user-menu";
import { Breadcrumbs } from "./breadcrumbs";
import { OrgSwitcher } from "./org-switcher";
import { useStreamContext } from "@/providers/Stream";
import { Thread } from "@/components/thread";
import { MessageSquare, Map as MapIcon, Workflow, Activity, X, Sparkles, Circle, Download, Minimize2, Maximize2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useRecording } from "@/providers/RecordingProvider";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useQueryState } from "nuqs";
import { cn } from "@/lib/utils";
import { useArtifactOpen, ArtifactContent, ArtifactTitle } from "@/components/thread/artifact";
import { PanelLeft, FileText, Layout, CheckSquare } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { ProductPanel } from "@/components/product-panel/ProductPanel";
import { EnrichmentView } from "./enrichment-view";
import { WorkbenchProvider, useWorkbenchContext, Node } from "./workbench-context";
import { NodeDetailPanel } from "./node-detail-panel";

function WorkbenchShellContent({ children }: { children: React.ReactNode }) {
    const stream = useStreamContext();
    const { isRecording, startRecording, stopRecording, downloadRecording } = useRecording();
    const { selectedNode, setSelectedNode } = useWorkbenchContext();

    // Robust Mode Derivation
    const values = (stream as any)?.values;
    const rawAgent = values?.active_agent;
    const activeAgent = rawAgent ||
        (values?.visualization_html?.includes("active_node='hydrator'") || values?.visualization_html?.includes("Hydrator")
            ? "hydrator"
            : "supervisor");

    const [viewMode, setViewMode] = useQueryState("view", { defaultValue: "map" });
    const [isWorkbenchOpen, setIsWorkbenchOpen] = useState(true);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isArtifactOpen, closeArtifact] = useArtifactOpen();
    const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const router = useRouter();
    const [threadId] = useQueryState("threadId");

    // Chat Panel States
    const [chatPanelWidth, setChatPanelWidth] = useState(400);
    const [isChatMinimized, setIsChatMinimized] = useState(false);
    const [isChatMaximized, setIsChatMaximized] = useState(false);
    const [chatPanelWidthBeforeMaximize, setChatPanelWidthBeforeMaximize] = useState(400);
    const [isChatResizing, setIsChatResizing] = useState(false);
    const chatPanelRef = useRef<HTMLDivElement>(null);

    // Detail View States
    const [detailViewHeight, setDetailViewHeight] = useState(300);
    const [isDetailViewMinimized, setIsDetailViewMinimized] = useState(false);
    const [isDetailViewMaximized, setIsDetailViewMaximized] = useState(false);
    const [detailViewHeightBeforeMaximize, setDetailViewHeightBeforeMaximize] = useState(300);
    const [isDetailViewResizing, setIsDetailViewResizing] = useState(false);
    const detailViewRef = useRef<HTMLDivElement>(null);

    // Workbench States
    const [isWorkbenchMinimized, setIsWorkbenchMinimized] = useState(false);
    const [isWorkbenchMaximized, setIsWorkbenchMaximized] = useState(false);

    // Agent-Driven View Synchronization (Backend -> UI)
    const workbenchView = (stream as any)?.values?.workbench_view;
    const lastSyncedView = useRef<string | undefined>(undefined);

    useEffect(() => {
        if (!workbenchView) return;
        if (workbenchView !== lastSyncedView.current) {
            console.log(`[WorkbenchShell] Backend synced view to: ${workbenchView}`);
            lastSyncedView.current = workbenchView;

            if (["map", "workflow", "artifacts", "enrichment"].includes(workbenchView)) {
                setViewMode(workbenchView);
                closeArtifact();
                if (!window.location.pathname.includes("/workbench/map")) {
                    router.push("/workbench/map");
                }
            } else if (workbenchView === "discovery") {
                router.push("/workbench/discovery");
            } else if (workbenchView === "settings") {
                router.push("/workbench/settings");
            } else if (workbenchView === "backlog") {
                router.push("/workbench/backlog");
            }
        }
    }, [workbenchView, setViewMode, closeArtifact, router]);

    // User-Driven View Synchronization (UI -> Backend)
    useEffect(() => {
        if (!viewMode) return;
        if (viewMode !== lastSyncedView.current) {
            console.log(`[WorkbenchShell] User-initiated view change to: ${viewMode}`);
            lastSyncedView.current = viewMode;
            stream.setWorkbenchView(viewMode as any).catch(e => {
                console.warn("[WorkbenchShell] Failed to sync view to backend:", e);
            });
        }
    }, [viewMode, stream]);

    // Chat Panel Resizing (Horizontal)
    const handleChatResizeMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsChatResizing(true);
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isChatResizing) return;
            
            const container = document.querySelector('[data-workbench-container]') as HTMLElement;
            if (!container) return;
            
            const containerRect = container.getBoundingClientRect();
            const containerWidth = containerRect.width;
            
            // Calculate new chat panel width from right edge
            const mouseX = e.clientX;
            const relativeX = containerRect.right - mouseX;
            
            // Constrain between min and max widths
            const minWidth = 300;
            const maxWidth = containerWidth * 0.5; // Max 50% of container
            const newWidth = Math.max(minWidth, Math.min(maxWidth, relativeX));
            
            setChatPanelWidth(newWidth);
        };

        const handleMouseUp = () => {
            setIsChatResizing(false);
        };

        if (isChatResizing) {
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
    }, [isChatResizing]);

    // Detail View Resizing (Vertical)
    const handleDetailViewResizeMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsDetailViewResizing(true);
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDetailViewResizing) return;
            
            const container = document.querySelector('[data-workbench-center]') as HTMLElement;
            if (!container) return;
            
            const containerRect = container.getBoundingClientRect();
            const containerHeight = containerRect.height;
            
            // Calculate new detail view height from bottom
            const mouseY = e.clientY;
            const relativeY = containerRect.bottom - mouseY;
            
            // Constrain between min and max heights
            const minHeight = 150;
            const maxHeight = containerHeight * 0.7; // Max 70% of center area
            const newHeight = Math.max(minHeight, Math.min(maxHeight, relativeY));
            
            setDetailViewHeight(newHeight);
        };

        const handleMouseUp = () => {
            setIsDetailViewResizing(false);
        };

        if (isDetailViewResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isDetailViewResizing]);

    // Minimize/Maximize Handlers
    const handleChatMinimize = () => {
        if (isChatMaximized) {
            setChatPanelWidth(chatPanelWidthBeforeMaximize);
            setIsChatMaximized(false);
        }
        setIsChatMinimized(true);
    };

    const handleChatMaximize = () => {
        if (!isChatMaximized) {
            setChatPanelWidthBeforeMaximize(chatPanelWidth);
        }
        setIsChatMinimized(false);
        setIsChatMaximized(true);
        const container = document.querySelector('[data-workbench-container]') as HTMLElement;
        if (container) {
            setChatPanelWidth(Math.min(container.getBoundingClientRect().width * 0.5, 800));
        }
    };

    const handleChatRestore = () => {
        setIsChatMinimized(false);
        setIsChatMaximized(false);
        setChatPanelWidth(chatPanelWidthBeforeMaximize);
    };

    const handleDetailViewMinimize = () => {
        if (isDetailViewMaximized) {
            setDetailViewHeight(detailViewHeightBeforeMaximize);
            setIsDetailViewMaximized(false);
        }
        setIsDetailViewMinimized(true);
    };

    const handleDetailViewMaximize = () => {
        if (!isDetailViewMaximized) {
            setDetailViewHeightBeforeMaximize(detailViewHeight);
        }
        setIsDetailViewMinimized(false);
        setIsDetailViewMaximized(true);
        const container = document.querySelector('[data-workbench-center]') as HTMLElement;
        if (container) {
            setDetailViewHeight(container.getBoundingClientRect().height * 0.7);
        }
    };

    const handleDetailViewRestore = () => {
        setIsDetailViewMinimized(false);
        setIsDetailViewMaximized(false);
        setDetailViewHeight(detailViewHeightBeforeMaximize);
    };

    const handleWorkbenchMinimize = () => {
        if (isWorkbenchMaximized) {
            setIsWorkbenchMaximized(false);
        }
        setIsWorkbenchMinimized(true);
    };

    const handleWorkbenchMaximize = () => {
        setIsWorkbenchMinimized(false);
        setIsWorkbenchMaximized(true);
    };

    const handleWorkbenchRestore = () => {
        setIsWorkbenchMinimized(false);
        setIsWorkbenchMaximized(false);
    };

    useLayoutEffect(() => {
        setIsMounted(true);
    }, []);

    const isChatOpen = !isChatMinimized;
    const isDetailViewOpen = selectedNode !== null && !isDetailViewMinimized;

    return (
        <div className="flex h-screen bg-background text-foreground overflow-hidden">
            {/* Sidebar - Left */}
            <div className={cn(
                "relative transition-all duration-300 border-r bg-muted/20 flex flex-col h-full overflow-hidden",
                isSidebarCollapsed ? "w-0 border-0" : "w-64"
            )}>
                {!isSidebarCollapsed && <Sidebar />}
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

            {/* Center Area */}
            <div className="flex-1 flex flex-col h-full min-w-0" data-workbench-container>
                {/* Header */}
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

                        {/* What's New */}
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

                        <ThemeToggle />

                        {/* Session Recording */}
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

                        {/* Workbench Toggle */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                        if (isWorkbenchMinimized) handleWorkbenchRestore();
                                        else if (isWorkbenchMaximized) handleWorkbenchRestore();
                                        else handleWorkbenchMaximize();
                                    }}
                                    className={cn(
                                        "h-9 w-9 text-muted-foreground hover:text-foreground relative transition-all",
                                        isWorkbenchOpen && "bg-muted text-foreground"
                                    )}
                                >
                                    {isWorkbenchMinimized ? <ChevronUp className="w-4 h-4" /> : isWorkbenchMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                                    {stream.isLoading && (
                                        <span className="absolute top-2 right-2 flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                                        </span>
                                    )}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {isWorkbenchMinimized ? "Restore Workbench" : isWorkbenchMaximized ? "Restore Workbench" : "Maximize Workbench"}
                            </TooltipContent>
                        </Tooltip>

                        {/* Detail View Toggle (only show when node selected) */}
                        {selectedNode && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => {
                                            if (isDetailViewMinimized) handleDetailViewRestore();
                                            else if (isDetailViewMaximized) handleDetailViewRestore();
                                            else handleDetailViewMaximize();
                                        }}
                                        className="h-9 w-9 text-muted-foreground hover:text-foreground"
                                    >
                                        {isDetailViewMinimized ? <ChevronDown className="w-4 h-4" /> : isDetailViewMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Toggle Detail View</TooltipContent>
                            </Tooltip>
                        )}

                        {/* Chat Panel Toggle */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                        if (isChatMinimized) handleChatRestore();
                                        else if (isChatMaximized) handleChatRestore();
                                        else handleChatMaximize();
                                    }}
                                    className={cn(
                                        "h-9 w-9 text-muted-foreground hover:text-foreground relative transition-all",
                                        isChatOpen && "bg-muted text-foreground"
                                    )}
                                >
                                    {isChatMinimized ? <ChevronLeft className="w-4 h-4" /> : isChatMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {isChatMinimized ? "Restore Chat" : isChatMaximized ? "Restore Chat" : "Maximize Chat"}
                            </TooltipContent>
                        </Tooltip>

                        <UserMenu />
                    </div>
                </header>

                {/* Center Content: Workbench + Detail View */}
                <div className="flex-1 flex flex-col overflow-hidden min-h-0" data-workbench-center>
                    {/* Workbench */}
                    {isWorkbenchOpen && (
                        <div
                            className={cn(
                                "flex flex-col overflow-hidden bg-background border-l",
                                isWorkbenchMinimized && "h-[40px]",
                                isWorkbenchMaximized && "flex-1",
                                !isWorkbenchMinimized && !isWorkbenchMaximized && "flex-1"
                            )}
                        >
                            {/* Workbench Tabs */}
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
                                            "h-8 px-3 gap-2 text-xs font-medium transition-all",
                                            viewMode === "enrichment" ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                        )}
                                        onClick={() => { setViewMode("enrichment"); closeArtifact(); stream.setWorkbenchView("enrichment"); }}
                                    >
                                        <CheckSquare className="w-3.5 h-3.5" />
                                        Enrichment
                                    </Button>
                                </div>
                                {/* Workbench Minimize/Maximize Controls */}
                                <div className="flex items-center gap-2">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6"
                                                onClick={() => {
                                                    if (isWorkbenchMinimized) handleWorkbenchRestore();
                                                    else if (isWorkbenchMaximized) handleWorkbenchRestore();
                                                    else handleWorkbenchMaximize();
                                                }}
                                            >
                                                {isWorkbenchMinimized ? <ChevronDown className="h-3.5 w-3.5" /> : isWorkbenchMaximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {isWorkbenchMinimized ? "Restore" : isWorkbenchMaximized ? "Restore" : "Maximize"}
                                        </TooltipContent>
                                    </Tooltip>
                                </div>
                            </div>

                            {/* Workbench Content */}
                            {!isWorkbenchMinimized && (
                                <>
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
                                    ) : viewMode === "enrichment" ? (
                                        <div className="h-full w-full overflow-hidden">
                                            <EnrichmentView />
                                        </div>
                                    ) : (
                                        <div className="h-full w-full overflow-hidden">
                                            {children}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* Detail View Resize Handle */}
                    {selectedNode && !isDetailViewMinimized && (
                        <div
                            className={cn(
                                "h-1 border-t border-b bg-border cursor-row-resize hover:bg-primary/20 transition-colors relative group",
                                isDetailViewResizing && "bg-primary/30"
                            )}
                            onMouseDown={handleDetailViewResizeMouseDown}
                            style={{ minHeight: '4px' }}
                        >
                            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 flex items-center justify-center">
                                <div className="h-0.5 w-16 bg-muted-foreground/30 group-hover:bg-primary/50 rounded-full transition-colors" />
                            </div>
                        </div>
                    )}

                    {/* Detail View Panel */}
                    {selectedNode && (
                        <div
                            ref={detailViewRef}
                            className={cn(
                                "relative shrink-0 overflow-hidden bg-background border-t",
                                isDetailViewMinimized && "h-[40px]",
                                isDetailViewMaximized && "h-[70%]"
                            )}
                            style={{
                                height: isDetailViewMinimized
                                    ? '40px'
                                    : isDetailViewMaximized
                                        ? '70%'
                                        : `${detailViewHeight}px`,
                                display: isDetailViewMinimized ? 'flex' : 'block',
                                flexDirection: isDetailViewMinimized ? 'row' : 'column'
                            }}
                        >
                            {/* Detail View Header */}
                            <div className="h-10 border-b flex items-center justify-between px-4 bg-muted/30 shrink-0">
                                <div className="flex items-center gap-2">
                                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="text-xs font-semibold text-foreground">Detail View</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6"
                                                onClick={() => {
                                                    if (isDetailViewMinimized) handleDetailViewRestore();
                                                    else if (isDetailViewMaximized) handleDetailViewRestore();
                                                    else handleDetailViewMaximize();
                                                }}
                                            >
                                                {isDetailViewMinimized ? <ChevronUp className="h-3.5 w-3.5" /> : isDetailViewMaximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {isDetailViewMinimized ? "Restore" : isDetailViewMaximized ? "Restore" : "Maximize"}
                                        </TooltipContent>
                                    </Tooltip>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => setSelectedNode(null)}
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                            {/* Detail View Content */}
                            {!isDetailViewMinimized && (
                                <div className="flex-1 min-h-0 overflow-hidden">
                                    <NodeDetailPanel
                                        node={selectedNode}
                                        onClose={() => setSelectedNode(null)}
                                        position="bottom"
                                        threadId={threadId}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Chat Panel Resize Handle */}
            {isChatOpen && !isChatMinimized && (
                <div
                    className={cn(
                        "w-1 border-l border-r bg-border cursor-col-resize hover:bg-primary/20 transition-colors relative group",
                        isChatResizing && "bg-primary/30"
                    )}
                    onMouseDown={handleChatResizeMouseDown}
                    style={{ minWidth: '4px' }}
                >
                    <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 flex items-center justify-center">
                        <div className="h-16 w-0.5 bg-muted-foreground/30 group-hover:bg-primary/50 rounded-full transition-colors" />
                    </div>
                </div>
            )}

            {/* Chat Panel - Right */}
            <div
                ref={chatPanelRef}
                className={cn(
                    "relative shrink-0 overflow-hidden border-l bg-background",
                    isChatMinimized && "w-[40px]"
                )}
                style={{
                    width: isChatMinimized
                        ? '40px'
                        : isChatMaximized
                            ? '50%'
                            : `${chatPanelWidth}px`,
                    display: isChatMinimized ? 'flex' : 'block',
                    flexDirection: isChatMinimized ? 'column' : 'row'
                }}
            >
                {isChatOpen && isMounted ? (
                    <div className="flex flex-col h-full overflow-hidden">
                        {/* Chat Panel Header */}
                        <div className="h-10 border-b flex items-center justify-between px-4 bg-muted/30 shrink-0">
                            <div className="flex items-center gap-2">
                                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                                {!isChatMinimized && <span className="text-xs font-semibold text-foreground">Agent Chat</span>}
                            </div>
                            <div className="flex items-center gap-2">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() => {
                                                if (isChatMinimized) handleChatRestore();
                                                else if (isChatMaximized) handleChatRestore();
                                                else handleChatMaximize();
                                            }}
                                        >
                                            {isChatMinimized ? <ChevronRight className="h-3.5 w-3.5" /> : isChatMaximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {isChatMinimized ? "Restore" : isChatMaximized ? "Restore" : "Maximize"}
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                        </div>
                        {/* Chat Content */}
                        {!isChatMinimized && (
                            <div className="flex-1 min-h-0 overflow-hidden">
                                <Thread embedded hideArtifacts />
                            </div>
                        )}
                    </div>
                ) : isChatOpen && !isMounted ? (
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
                ) : null}
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
        </div>
    );
}

export function WorkbenchShell({ children }: { children: React.ReactNode }) {
    return (
        <WorkbenchProvider>
            <WorkbenchShellContent>{children}</WorkbenchShellContent>
        </WorkbenchProvider>
    );
}
