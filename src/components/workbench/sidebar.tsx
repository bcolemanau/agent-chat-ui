"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRouteScope } from "@/hooks/use-route-scope";
import {
    FileText,
    Settings,
    Plug,
    Search,
    Trash2,
    Clock,
    Pencil
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryState } from "nuqs";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Search as SearchIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useStreamContext } from "@/providers/Stream";

interface Project {
    id: string;
    name: string;
    slug?: string;
    thread_id?: string;
    updated_at?: string;
}

function projectSlug(project: Project): string {
    return project.slug ?? project.id;
}

// Generate a more meaningful project name from thread ID
function formatProjectName(project: Project): string {
    // If name is already meaningful (not just a UUID), use it
    // Fixed UUID regex to match standard 8-4-4-4-12 format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (project.name && project.name !== project.id && !uuidRegex.test(project.name)) {
        return project.name;
    }
    
    // If name is a UUID or same as ID, generate a friendly name
    // Extract first 8 characters of UUID for readability
    const shortId = project.id.substring(0, 8);
    return `Project ${shortId}`;
}

// Removed static PROJECT_LINKS

const PRODUCT_LINKS = [
    { name: "Integrations", href: "/integrations", icon: Plug },
    { name: "Discovery", href: "/discovery", icon: Search },
    { name: "System Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
    const { data: session } = useSession();
    const pathname = usePathname();
    const router = useRouter();
    const { orgId, projectId, orgName } = useRouteScope();
    const orgSlug = orgName ?? orgId ?? "";
    const userRole = session?.user?.role;

    const [threadId, setThreadId] = useQueryState("threadId");
    const effectiveProjectId = projectId ?? threadId ?? undefined;
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(false);
    const [creatingProject, setCreatingProject] = useState(false);
    const stream = useStreamContext();
    const createNewThreadWithContext = (stream as { createNewThreadWithContext?: () => Promise<string | null> })?.createNewThreadWithContext;
    const [searchQuery, setSearchQuery] = useState("");
    const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState("");

    // Check if user is Reflexion Admin (keys are reflexion_admin or admin)
    const isAdmin = userRole === "reflexion_admin" || userRole === "admin";

    const fetchProjects = useCallback(async (): Promise<Project[]> => {
        try {
            setLoading(true);
            const orgContext = localStorage.getItem('reflexion_org_context');
            const headers: Record<string, string> = {};
            if (orgContext) {
                headers['X-Organization-Context'] = orgContext;
            }

            const res = await fetch('/api/projects', { headers });
            if (res.ok) {
                const data = await res.json();
                setProjects(data);
                return data;
            }
        } catch (error) {
            console.error("Failed to fetch projects:", error);
        } finally {
            setLoading(false);
        }
        return [];
    }, []);

    const startEditing = (e: React.MouseEvent, project: Project) => {
        e.stopPropagation();
        setEditingProjectId(project.id);
        setEditingName(formatProjectName(project));
    };

    const cancelEditing = () => {
        setEditingProjectId(null);
        setEditingName("");
    };

    const saveRename = useCallback(async () => {
        if (!editingProjectId || !editingName.trim()) {
            cancelEditing();
            return;
        }
        const name = editingName.trim();
        try {
            const orgContext = localStorage.getItem("reflexion_org_context");
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            if (orgContext) headers["X-Organization-Context"] = orgContext;

            const res = await fetch(`/api/projects/${encodeURIComponent(editingProjectId)}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ name }),
            });

            if (res.ok) {
                toast.success("Project renamed");
                cancelEditing();
                fetchProjects();
            } else {
                const err = await res.json().catch(() => ({}));
                if (res.status === 409) {
                    toast.warning(err?.error || err?.detail || "Project is busy. Try again in a moment.");
                } else {
                    toast.error(err?.error || "Failed to rename project");
                }
            }
        } catch (error) {
            console.error("Error renaming project:", error);
            toast.error("An error occurred while renaming");
        }
    }, [editingProjectId, editingName, fetchProjects]);

    const deleteProject = async (e: React.MouseEvent, project: Project) => {
        e.stopPropagation();
        if (!confirm("Are you sure you want to delete this project and all its data? This cannot be undone.")) {
            return;
        }

        try {
            const orgContext = localStorage.getItem('reflexion_org_context');
            const headers: Record<string, string> = {};
            if (orgContext) {
                headers['X-Organization-Context'] = orgContext;
            }

            const res = await fetch(`/api/projects?projectId=${encodeURIComponent(project.id)}`, {
                method: 'DELETE',
                headers
            });

            if (res.ok) {
                toast.success("Project deleted successfully");
                if (effectiveProjectId === projectSegment(project)) {
                    setThreadId(null);
                    if (orgId) router.push(`/org/${encodeURIComponent(orgSlug)}/${encodeURIComponent(orgId)}/map`);
                }
                fetchProjects();
            } else {
                const error = await res.json();
                toast.error(`Failed to delete project: ${error.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error("Error deleting project:", error);
            toast.error("An error occurred while deleting the project");
        }
    };

    useEffect(() => {
        fetchProjects();
        window.addEventListener('focus', fetchProjects);
        const handleOrgContextChanged = () => fetchProjects();
        window.addEventListener('orgContextChanged', handleOrgContextChanged);
        return () => {
            window.removeEventListener('focus', fetchProjects);
            window.removeEventListener('orgContextChanged', handleOrgContextChanged);
        };
    }, [fetchProjects]);

    const filteredProjects = useMemo(() => {
        if (!searchQuery) return projects;
        const query = searchQuery.toLowerCase();
        return projects.filter(p => 
            p.name.toLowerCase().includes(query) || 
            p.id.toLowerCase().includes(query)
        );
    }, [projects, searchQuery]);

    return (
        <aside className="w-64 border-r bg-muted/20 flex flex-col h-full overflow-hidden transition-all duration-300">
            <div className="p-6 shrink-0">
                <Link href="/" className="inline-block transition-transform hover:scale-105">
                    <h2 className="text-xl font-bold tracking-tight text-primary flex items-center gap-2">
                        <span className="bg-primary text-primary-foreground px-1.5 py-0.5 rounded text-sm">N</span>
                        NewCo
                    </h2>
                </Link>
            </div>

            <div className="px-4 mb-4 shrink-0">
                <div className="relative">
                    <SearchIcon className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search projects..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-background border rounded-md pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                    />
                </div>
            </div>

            <nav className="flex-1 overflow-y-auto space-y-6 px-4 py-2 custom-scrollbar">
                {/* Project Section */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                            Projects
                        </h3>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 hover:bg-muted"
                            disabled={creatingProject}
                            onClick={async () => {
                                if (createNewThreadWithContext) {
                                    setCreatingProject(true);
                                    try {
                                        await createNewThreadWithContext();
                                        window.dispatchEvent(new CustomEvent("orgContextChanged"));
                                    } finally {
                                        setCreatingProject(false);
                                    }
                                } else {
                                    setThreadId(null);
                                }
                            }}
                        >
                            <Plus className="h-3 w-3" />
                            <span className="sr-only">New Project</span>
                        </Button>
                    </div>

                    <div className="space-y-1">
                        {loading && projects.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-muted-foreground italic">Loading...</div>
                        ) : filteredProjects.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-muted-foreground italic">
                                {searchQuery ? "No matches found" : "No projects yet"}
                            </div>
                        ) : (
                            filteredProjects.map((project) => {
                                const pslug = projectSlug(project);
                                const isActive = effectiveProjectId === project.id || effectiveProjectId === project.thread_id;
                                const isEditing = editingProjectId === project.id;
                                return (
                                    <div key={project.id} className="group relative">
                                        <button
                                            onClick={() => {
                                                if (isEditing) return;
                                                if (orgId) router.push(`/org/${encodeURIComponent(orgSlug)}/${encodeURIComponent(orgId)}/project/${encodeURIComponent(pslug)}/${encodeURIComponent(project.id)}/map`);
                                                else setThreadId(project.id);
                                            }}
                                            className={cn(
                                                "w-full text-left flex flex-col rounded-md px-3 py-2.5 text-sm font-medium transition-all",
                                                isActive ? "bg-primary/10 text-primary shadow-sm" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                                            )}
                                        >
                                            <div className="flex items-center w-full pr-12">
                                                <FileText className={cn("mr-3 h-4 w-4 shrink-0 transition-transform group-hover:scale-110", isActive ? "text-primary" : "text-muted-foreground")} />
                                                {isEditing ? (
                                                    <input
                                                        type="text"
                                                        value={editingName}
                                                        onChange={(e) => setEditingName(e.target.value)}
                                                        onBlur={() => saveRename()}
                                                        onKeyDown={(e) => {
                                                            e.stopPropagation();
                                                            if (e.key === "Enter") {
                                                                e.currentTarget.blur();
                                                            } else if (e.key === "Escape") {
                                                                cancelEditing();
                                                            }
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="flex-1 min-w-0 bg-background border rounded px-2 py-0.5 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                                                        autoFocus
                                                        aria-label="Rename project"
                                                    />
                                                ) : (
                                                    <span className="truncate font-semibold" title={project.id}>{formatProjectName(project)}</span>
                                                )}
                                            </div>
                                            {project.updated_at && !isEditing && (
                                                <div className="flex items-center mt-1 ml-7 text-[10px] text-muted-foreground/70">
                                                    <Clock className="h-2.5 w-2.5 mr-1" />
                                                    {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}
                                                </div>
                                            )}
                                        </button>
                                        {!isEditing && (
                                            <>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="absolute right-8 top-1/2 -translate-y-1/2 h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                                                    onClick={(e) => startEditing(e, project)}
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                    <span className="sr-only">Rename Project</span>
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                                                    onClick={(e) => deleteProject(e, project)}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                    <span className="sr-only">Delete Project</span>
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                );
                            })
                        )}
                        <Button
                            variant="ghost"
                            className="w-full justify-start text-muted-foreground hover:text-foreground px-3 py-2 h-auto font-normal mt-2"
                            disabled={creatingProject}
                            onClick={async () => {
                                if (createNewThreadWithContext) {
                                    setCreatingProject(true);
                                    try {
                                        const returnedId = await createNewThreadWithContext(orgId ?? undefined);
                                        window.dispatchEvent(new CustomEvent("orgContextChanged"));
                                        if (returnedId && orgId) {
                                            const list = await fetchProjects();
                                            const proj = list.find((p: Project) => p.thread_id === returnedId || p.id === returnedId);
                                            const pid = proj?.id ?? returnedId;
                                            const pslug = proj ? projectSlug(proj) : returnedId;
                                            router.push(`/org/${encodeURIComponent(orgSlug)}/${encodeURIComponent(orgId)}/project/${encodeURIComponent(pslug)}/${encodeURIComponent(pid)}/map`);
                                        }
                                    } finally {
                                        setCreatingProject(false);
                                    }
                                } else {
                                    setThreadId(null);
                                }
                            }}
                        >
                            <Plus className="mr-3 h-4 w-4" />
                            New Project
                        </Button>
                    </div>
                </div>

                {/* Product Section - Admin Only */}
                {isAdmin && (
                    <div className="space-y-3 pt-2">
                        <h3 className="px-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                            NewCo Product
                        </h3>
                        <div className="space-y-1">
                            {PRODUCT_LINKS.map((link) => {
                                const Icon = link.icon;
                                const href = orgId ? `/org/${encodeURIComponent(orgSlug)}/${encodeURIComponent(orgId)}${link.href}` : link.href;
                                const isActive = pathname === href || pathname === link.href;
                                return (
                                    <Link
                                        key={link.href}
                                        href={href}
                                        className={cn(
                                            "group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-all",
                                            isActive ? "bg-primary/10 text-primary shadow-sm" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                                        )}
                                    >
                                        <Icon className={cn("mr-3 h-4 w-4 transition-transform group-hover:scale-110", isActive ? "text-primary" : "text-muted-foreground")} />
                                        {link.name}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                )}
            </nav>
        </aside>
    );
}
