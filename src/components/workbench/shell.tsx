"use client";

import { Suspense, useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { Sidebar } from "./sidebar";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { UserMenu } from "@/components/thread/user-menu";
import { Breadcrumbs } from "./breadcrumbs";
import { useStreamContext } from "@/providers/Stream";
import { Thread } from "@/components/thread";
import { MessageSquare, Map as MapIcon, Activity, X, Sparkles, Circle, Download, Minus, Maximize2, Settings } from "lucide-react";
import { useRecording } from "@/providers/RecordingProvider";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useQueryState } from "nuqs";
import { useRouteScope } from "@/hooks/use-route-scope";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useArtifactOpen, ArtifactContent, ArtifactTitle } from "@/components/thread/artifact";
import { PanelLeft, FileText, Layout, CheckSquare } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { ProductPanel } from "@/components/product-panel/ProductPanel";
import { useApprovalCount } from "./hooks/use-approval-count";
import { DecisionsPanel } from "./decisions-panel";
import { getWorkflowNodeColor } from "@/lib/workflow-agent-colors";
import { apiFetch, orgContextRef } from "@/lib/api-fetch";

export function WorkbenchShell({ children }: { children: React.ReactNode }) {
    const stream = useStreamContext();
    const router = useRouter();
    const pathname = usePathname();
    const { data: session, status } = useSession();
    const userRole = session?.user?.role;
    const isAdmin = Boolean(userRole && ["reflexion_admin", "admin", "newco_admin"].includes(userRole as string));
    const { isRecording, startRecording, stopRecording, downloadRecording } = useRecording();

    // Robust Mode Derivation (active_mode and active_agent are synced from graph/overlay)
    const values = (stream as any)?.values;
    const rawAgent = values?.active_mode ?? values?.active_agent;
    // Accept any mode string from backend; fallback to supervisor so we stay in sync when new phases are added
    const activeAgent: string =
        typeof rawAgent === "string" && rawAgent.trim() !== ""
            ? rawAgent
            : (values?.visualization_html?.includes("project_configurator")
                ? "project_configurator"
                : "supervisor");

    const [viewMode, setViewMode] = useQueryState("view", { defaultValue: "map" });
    const [threadId, setThreadId] = useQueryState("threadId");
    const { orgId, projectId, orgName, projectName } = useRouteScope();
    const orgSlug = orgName ?? orgId ?? "";
    const projectSlug = projectName ?? projectId ?? "";
    // Build canonical /org/[orgName]/[orgId]/... and /project/[projectName]/[projectId]/... when on scoped route
    const workbenchHref = (path: string) => {
        const base = path.split("?")[0];
        const qs = path.includes("?") ? path.slice(path.indexOf("?")) : "";
        if (orgId && projectId) return `/org/${encodeURIComponent(orgSlug)}/${encodeURIComponent(orgId)}/project/${encodeURIComponent(projectSlug)}/${encodeURIComponent(projectId)}${base}${qs}`;
        if (orgId) return `/org/${encodeURIComponent(orgSlug)}/${encodeURIComponent(orgId)}${base}${qs}`;
        return path;
    };
    // Scope from URL only: project (and org). No thread-as-scope fallback.
    const effectiveProjectIdForScope = projectId ?? undefined;
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

    // Workflow strip in workbench pane: name, version, mini diagram (from GET /api/workflow)
    type WorkflowDiagramStrip = { workflow_id: string; name?: string; version?: string; nodes: { id: string; label: string }[]; active_node?: string };
    const [workflowStrip, setWorkflowStrip] = useState<WorkflowDiagramStrip | null>(null);
    const [workflowStripLoading, setWorkflowStripLoading] = useState(false);
    const [workflowSelectOpen, setWorkflowSelectOpen] = useState(false);
    // Delay unmounting the workflow Select by one frame so Radix portal closes first (avoids removeChild NotFoundError)
    const prevWouldShowWorkflowSelectRef = useRef(false);
    const keepWorkflowSelectMountedRef = useRef(false);
    const previousActiveNodeIdRef = useRef<string | null>(null);
    const [, setWorkflowSelectUnmountTick] = useState(0);

    // Issue #14: Approval count for badge
    const approvalCount = useApprovalCount();
    const lastApprovalCount = useRef<number>(0);

    // Fetch workflow diagram for mini strip (header + workbench pane). Run when on workbench so strip is ready.
    // Scope from URL only: pass project_id so backend returns project-level pack (e.g. IOT). No thread-as-scope.
    useEffect(() => {
        const onWorkbench = pathname != null && pathname !== "/";
        if (!onWorkbench) return;
        let cancelled = false;
        setWorkflowStripLoading(true);
        const params = new URLSearchParams();
        if (activeAgent) params.set("active_node", activeAgent);
        if (effectiveProjectIdForScope) params.set("project_id", effectiveProjectIdForScope);
        apiFetch(`/api/workflow${params.toString() ? `?${params.toString()}` : ""}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data: WorkflowDiagramStrip | null) => {
                if (!cancelled && data?.nodes) {
                    setWorkflowStrip({
                        workflow_id: data.workflow_id,
                        name: data.name,
                        version: data.version ?? data.workflow_id,
                        nodes: data.nodes,
                        active_node: data.active_node,
                    });
                } else if (!cancelled) {
                    setWorkflowStrip(null);
                }
            })
            .catch(() => { if (!cancelled) setWorkflowStrip(null); })
            .finally(() => { if (!cancelled) setWorkflowStripLoading(false); });
        return () => { cancelled = true; };
    }, [pathname, activeAgent, orgId, effectiveProjectIdForScope]);

    // Nodes to show in strip and dropdown (from API); hide Administration for non-admins
    const displayNodes = useMemo(
        () =>
            workflowStrip?.nodes
                ? isAdmin
                    ? workflowStrip.nodes
                    : workflowStrip.nodes.filter((n) => n.id !== "administration")
                : [],
        [workflowStrip?.nodes, isAdmin]
    );

    // Close workflow strip Select before it unmounts to avoid portal removeChild (Root ErrorBoundary)
    const wouldShowWorkflowSelect = Boolean(effectiveProjectIdForScope && displayNodes.length > 0 && (workflowStrip?.active_node ?? activeAgent));
    useEffect(() => {
        if (!wouldShowWorkflowSelect) setWorkflowSelectOpen(false);
    }, [wouldShowWorkflowSelect]);

    // Keep Select mounted one frame with open=false when hiding, so Radix portal can close before unmount
    if (!wouldShowWorkflowSelect && prevWouldShowWorkflowSelectRef.current) keepWorkflowSelectMountedRef.current = true;
    const shouldRenderWorkflowSelect = wouldShowWorkflowSelect || keepWorkflowSelectMountedRef.current;
    useLayoutEffect(() => {
        prevWouldShowWorkflowSelectRef.current = wouldShowWorkflowSelect;
        if (wouldShowWorkflowSelect) previousActiveNodeIdRef.current = activeAgent;
        if (keepWorkflowSelectMountedRef.current) {
            keepWorkflowSelectMountedRef.current = false;
            setWorkflowSelectUnmountTick((t) => t + 1);
        }
    }, [wouldShowWorkflowSelect, activeAgent]);

    // When thread returns 404 (deleted, backend restarted), clear URL so user can start fresh
    useEffect(() => {
        const onNotFound = () => setThreadId(null);
        window.addEventListener("threadNotFound", onNotFound);
        return () => window.removeEventListener("threadNotFound", onNotFound);
    }, [setThreadId]);

    // Auth guard: redirect unauthenticated users to login
    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/");
        }
    }, [status, router]);

    // Role-based initial load: admin → settings (no org), non-admin → org + latest thread
    useEffect(() => {
        if (status !== "authenticated" || !session?.user) return;
        const INIT_KEY = "reflexion_initial_route_done";
        if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(INIT_KEY)) return;
        // Only run on default landing: /map with no project in URL (scope from URL only)
        const onMap = pathname?.startsWith("/map");
        if (!onMap || (effectiveProjectIdForScope ?? "").trim() !== "") return;

        const customerId = (session.user as { customerId?: string }).customerId;
        if (isAdmin) {
            localStorage.removeItem("reflexion_org_context");
            sessionStorage.setItem(INIT_KEY, "1");
            router.replace("/settings");
            return;
        }
        // Non-admin: set their org and latest thread
        const orgId = customerId?.trim() || "";
        if (!orgId) {
            sessionStorage.setItem(INIT_KEY, "1");
            return;
        }
        localStorage.setItem("reflexion_org_context", orgId);
        window.dispatchEvent(new CustomEvent("orgContextChanged"));
        orgContextRef.current = orgId;
        apiFetch("/api/projects")
            .then((r) => (r.ok ? r.json() : []))
            .then((projects: Array<{ id: string; name?: string; slug?: string; thread_id?: string; updated_at?: string }>) => {
                const latest = projects[0]; // API returns sorted by updated_at desc
                sessionStorage.setItem(INIT_KEY, "1");
                if (latest?.id && orgId) {
                    const pslug = latest.slug ?? latest.id;
                    router.replace(`/org/${encodeURIComponent(orgId)}/${encodeURIComponent(orgId)}/project/${encodeURIComponent(pslug)}/${encodeURIComponent(latest.id)}/map`);
                }
                // No thread-as-scope fallback: only redirect to project when we have project id from API
            })
            .catch(() => sessionStorage.setItem(INIT_KEY, "1"));
    }, [status, session, isAdmin, pathname, effectiveProjectIdForScope, router]);

    // Decisions has its own route (/decisions); we do NOT set view=decisions in URL so we keep one canonical URL

    // Agent-Driven View Synchronization (Backend -> UI)
    const workbenchView = (stream as any)?.values?.workbench_view;
    const lastSyncedView = useRef<string | undefined>(undefined);

    // Check for hydration/project-config proposal interrupt and navigate to decisions (Phase 1: /hydration folded into /decisions)
    useEffect(() => {
        const interrupts = (stream as any)?.interrupt;
        if (interrupts) {
            const interruptArray = Array.isArray(interrupts) ? interrupts : [interrupts];
            const hydrationInterrupt = interruptArray.find(
                (int: any) => {
                    const actionName = int?.value?.action_requests?.[0]?.name || int?.action_requests?.[0]?.name;
                    return actionName === "generate_project_configuration_summary" || actionName === "propose_hydration_complete";
                }
            );

            if (hydrationInterrupt && !window.location.pathname.includes("/decisions")) {
                console.log("[WorkbenchShell] Hydration/project-config proposal detected, navigating to decisions");
                router.push(workbenchHref("/decisions"));
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- workbenchHref stable per threadId
    }, [stream, router]);

    useEffect(() => {
        if (!workbenchView) return;

        // Only sync if the backend specifically changed its requested view
        // effectively treating it as an event rather than a state enforcement
        if (workbenchView !== lastSyncedView.current) {
            console.log(`[WorkbenchShell] Backend synced view to: ${workbenchView}`);
            lastSyncedView.current = workbenchView;

            if (["map", "workflow", "artifacts"].includes(workbenchView)) {
                // Internal sub-views live under /map
                setViewMode(workbenchView);
                closeArtifact();
                if (!window.location.pathname.includes("/map")) {
                    router.push(workbenchHref("/map"));
                }
            } else if (workbenchView === "decisions") {
                setViewMode("decisions");
                closeArtifact();
                router.push(workbenchHref("/decisions"));
            } else if (workbenchView === "discovery") {
                router.push(workbenchHref("/discovery"));
            } else if (workbenchView === "settings") {
                router.push(workbenchHref("/settings"));
            } else if (workbenchView === "backlog") {
                router.push(workbenchHref("/integrations"));
            } else if (workbenchView === "hydration") {
                router.push(workbenchHref("/decisions"));
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- workbenchHref stable per threadId
    }, [workbenchView, setViewMode, closeArtifact, router]);
    
    // Issue #14: Auto-routing to Decisions view when new approvals arrive
    useEffect(() => {
        const currentPath = window.location.pathname;
        const isOnDecisionsPage = currentPath.includes("/decisions");
        
        // If approval count increased and we're not already on decisions page, auto-route
        if (approvalCount > 0 && approvalCount > lastApprovalCount.current && !isOnDecisionsPage) {
            console.log(`[WorkbenchShell] New approvals detected (${approvalCount}), auto-routing to Decisions view`);
            setViewMode("decisions");
            lastSyncedView.current = "decisions";
            router.push(workbenchHref("/decisions"));
        }
        
        lastApprovalCount.current = approvalCount;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- workbenchHref stable per threadId
    }, [approvalCount, router]);

    // Normalize legacy workflow view to map (workflow tab removed)
    useEffect(() => {
        if (viewMode === "workflow") {
            setViewMode("map");
        }
    }, [viewMode, setViewMode]);

    // User-Driven View Synchronization (UI -> Backend)
    useEffect(() => {
        if (!viewMode || viewMode === "workflow") return;

        // Detect manual user-initiated view changes (including URL updates)
        if (viewMode !== lastSyncedView.current) {
            console.log(`[WorkbenchShell] User-initiated view change to: ${viewMode}`);
            lastSyncedView.current = viewMode;
            stream.setWorkbenchView(viewMode as any).catch(e => {
                console.warn("[WorkbenchShell] Failed to sync view to backend:", e);
            });
        }
    }, [viewMode, stream]);

    // Fix: If on /decisions but viewMode is a map sub-view, navigate to /map
    // BUT only if we're not explicitly intending to stay on decisions (e.g. via tab selection)
    useEffect(() => {
        if (pathname?.includes("/decisions") && ["map", "artifacts"].includes(viewMode)) {
            // Check if this was a recent manual navigation to decisions
            const isManualDecisions = lastSyncedView.current === "decisions";
            if (!isManualDecisions) {
                console.log(`[WorkbenchShell] On decisions route but viewMode is ${viewMode}, navigating to /map`);
                router.push(workbenchHref(`/map?view=${viewMode}`));
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- workbenchHref stable per threadId
    }, [pathname, viewMode, router]);

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

    // Skip auth loading gate on /gcp-chat so the page can render when session is slow or not configured
    if (status === "loading" && pathname !== "/gcp-chat") {
        return (
            <div className="flex workbench-root-height items-center justify-center">
                <span className="text-sm text-muted-foreground">Checking authentication…</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col bg-background text-foreground overflow-hidden workbench-root-height">
            {/* Level 1: Global header — full width, always left to right (above sidebar) */}
            <header className="h-14 border-b flex items-center justify-between px-6 bg-background z-20 shrink-0" data-workbench-container>
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Suspense fallback={<div className="h-4 w-32 bg-muted animate-pulse rounded" />}>
                            <Breadcrumbs />
                        </Suspense>
                        <span className="text-muted-foreground/50 shrink-0">/</span>
                        {/* Workflow visualization (connects to breadcrumb); active node = agent selector */}
                        {workflowStripLoading ? (
                            <div className="h-6 w-24 bg-muted animate-pulse rounded shrink-0" aria-hidden />
                        ) : workflowStrip && displayNodes.length > 0 ? (
                            <div className="flex items-center gap-1.5 shrink min-w-0 overflow-x-auto">
                                <span className="text-sm text-foreground/90 shrink-0 whitespace-nowrap font-medium">
                                    {workflowStrip.name ?? workflowStrip.workflow_id}
                                    <span className="text-muted-foreground font-normal"> ({workflowStrip.version ?? workflowStrip.workflow_id})</span>
                                </span>
                                <div className="flex items-center gap-0.5 shrink-0 border border-border/50 rounded-md px-1.5 py-0.5 bg-muted/30">
                                    {displayNodes.map((node, i) => {
                                        const isActive = workflowStrip.active_node === node.id || activeAgent === node.id;
                                        const showSelect = (isActive && effectiveProjectIdForScope) || (shouldRenderWorkflowSelect && !wouldShowWorkflowSelect && node.id === previousActiveNodeIdRef.current);
                                        const nodeColor = getWorkflowNodeColor(node.id);
                                        return (
                                            <span key={node.id} className="flex items-center shrink-0 gap-0.5">
                                                {showSelect ? (
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Select
                                                                value={previousActiveNodeIdRef.current ?? activeAgent}
                                                                disabled={!effectiveProjectIdForScope}
                                                                open={workflowSelectOpen && wouldShowWorkflowSelect}
                                                                onOpenChange={setWorkflowSelectOpen}
                                                                onValueChange={(value) => {
                                                                    const fn = (stream as any).setActiveAgentDebug as ((a: string) => Promise<void>) | undefined;
                                                                    if (fn) fn(value).catch((e) => console.warn("[WorkbenchShell] Failed to set active mode:", e));
                                                                }}
                                                            >
                                                                <SelectTrigger
                                                                    className={cn(
                                                                        "h-7 min-w-0 w-auto max-w-none overflow-visible px-2 py-0.5 text-sm font-medium border rounded-md text-foreground hover:opacity-90 shadow-none gap-1.5 ring-2 ring-primary/40 [&>span]:whitespace-nowrap [&>span]:overflow-visible [&>span]:text-inherit",
                                                                        stream.isLoading && "opacity-80"
                                                                    )}
                                                                    style={{ backgroundColor: `color-mix(in srgb, ${nodeColor} 28%, var(--muted))`, borderColor: `color-mix(in srgb, ${nodeColor} 55%, transparent)` }}
                                                                >
                                                                    <Activity className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                                                                    <SelectValue>{node.label}</SelectValue>
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {displayNodes.map((opt) => (
                                                                        <SelectItem key={opt.id} value={opt.id} className="text-sm capitalize">
                                                                            {opt.label}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </TooltipTrigger>
                                                        <TooltipContent>Switch agent (current: {node.label})</TooltipContent>
                                                    </Tooltip>
                                                ) : (
                                                    <span
                                                        className={cn(
                                                            "inline-block px-2 py-0.5 rounded-md text-sm font-medium whitespace-nowrap border",
                                                            isActive ? "text-foreground ring-2 ring-primary/40" : "text-muted-foreground"
                                                        )}
                                                        style={{
                                                            backgroundColor: isActive ? `color-mix(in srgb, ${nodeColor} 28%, var(--muted))` : `color-mix(in srgb, ${nodeColor} 14%, var(--background))`,
                                                            borderColor: isActive ? `color-mix(in srgb, ${nodeColor} 55%, transparent)` : `color-mix(in srgb, ${nodeColor} 35%, transparent)`,
                                                        }}
                                                        title={node.label}
                                                    >
                                                        {node.label}
                                                    </span>
                                                )}
                                                {i < displayNodes.length - 1 && (
                                                    <span className="text-muted-foreground/60 text-sm shrink-0">→</span>
                                                )}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <span className="text-sm text-muted-foreground italic">Workflow: —</span>
                        )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
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

            {/* Level 2: Sidebar + main content (below global header) */}
            <div className="flex flex-1 min-h-0 overflow-hidden">
                {/* Sidebar - Collapsible */}
                <div className={cn(
                    "relative transition-all duration-300 border-r bg-muted/20 flex flex-col overflow-hidden",
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

                {/* Main Content Area — workbench + agent panel only (no header); min-h-0 so only list/detail panes scroll */}
                <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden" data-workbench-container>
                {/* Content Stage - Workbench in center, Chat on right */}
                <div className="flex-1 flex overflow-hidden min-h-0">
                    {/* Center Area - Workbench (and NodeDetailPanel when node selected); flex-1 so height is constrained */}
                    <div 
                        className="flex-1 flex flex-col overflow-hidden min-h-0 transition-all"
                        style={{
                            width: isWorkbenchMaximized ? '100%' : isAgentPanelOpen && !isAgentPanelMinimized && !isAgentPanelMaximized ? `calc(100% - ${agentPanelHeight}px)` : '100%',
                            maxWidth: isWorkbenchMaximized ? '100%' : isAgentPanelOpen && !isAgentPanelMinimized && !isAgentPanelMaximized ? `calc(100% - ${agentPanelHeight}px)` : '100%'
                        }}
                    >
                        {pathname?.includes("/gcp-chat") && (
                            <div className="h-full w-full min-h-0 overflow-hidden flex flex-col">
                                {children}
                            </div>
                        )}
                        {!pathname?.includes("/gcp-chat") && isWorkbenchOpen && (
                            <aside className={cn(
                                "border-l bg-background flex flex-col shadow-xl z-30 transition-all min-h-0 overflow-hidden",
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
                                            pathname?.includes("/map") && viewMode === "map" ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                        )}
                                        onClick={() => {
                                            setViewMode("map");
                                            closeArtifact();
                                            stream.setWorkbenchView("map");
                                            if (!pathname?.includes("/map")) router.push(workbenchHref("/map"));
                                        }}
                                    >
                                        <MapIcon className="w-3.5 h-3.5" />
                                        Map
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                            "h-8 px-3 gap-2 text-xs font-medium transition-all",
                                            pathname?.includes("/map") && viewMode === "artifacts" ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                        )}
                                        onClick={() => {
                                            setViewMode("artifacts");
                                            closeArtifact();
                                            stream.setWorkbenchView("artifacts");
                                            const mapHref = workbenchHref("/map");
                                            router.push(`${mapHref}${mapHref.includes("?") ? "&" : "?"}view=artifacts`);
                                        }}
                                    >
                                        <FileText className="w-3.5 h-3.5" />
                                        Artifacts
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                            "h-8 px-3 gap-2 text-xs font-medium transition-all relative",
                                            pathname?.includes("/decisions") || viewMode === "decisions" ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                        )}
                                        onClick={() => {
                                            closeArtifact();
                                            setViewMode("decisions");
                                            lastSyncedView.current = "decisions";
                                            stream.setWorkbenchView("decisions" as any);
                                            router.push(workbenchHref("/decisions"));
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
                                    {isAdmin && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className={cn(
                                                "h-8 px-3 gap-2 text-xs font-medium transition-all",
                                                pathname?.includes("/settings") ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                            )}
                                            onClick={() => {
                                                closeArtifact();
                                                lastSyncedView.current = "settings";
                                                stream.setWorkbenchView("settings" as any);
                                                router.push(workbenchHref("/settings"));
                                            }}
                                        >
                                            <Settings className="w-3.5 h-3.5" />
                                            System Settings
                                        </Button>
                                    )}
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
                            ) : pathname?.includes("/decisions") ? (
                                // Show Decisions if we're on the decisions route
                                <div className="h-full w-full min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar">
                                    {children}
                                </div>
                            ) : pathname?.includes("/integrations") ? (
                                // Integrations (product-level + Project Management view)
                                <div className="h-full w-full min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar">
                                    {children}
                                </div>
                            ) : viewMode === "decisions" ? (
                                <div className="h-full w-full min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar">
                                    <DecisionsPanel />
                                </div>
                            ) : (
                                /* Map/Artifacts: no single scroll so list and detail panes scroll independently; edit header stays fixed */
                                <div className="h-full w-full min-h-0 overflow-hidden flex flex-col">
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
