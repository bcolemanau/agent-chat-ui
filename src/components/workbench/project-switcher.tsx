"use client";

import * as React from "react";
import { Briefcase, Plus } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useQueryState } from "nuqs";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useStreamContext } from "@/providers/Stream";
import { useRouteScope } from "@/hooks/use-route-scope";

interface Project {
    id: string;
    name: string;
    slug?: string;
    thread_id?: string;
}

/** Canonical URL uses project.id (slug). Use for Select value and navigation. */
function projectSlug(project: Project): string {
    return project.slug ?? project.id;
}

// Match sidebar display: meaningful names as-is, UUIDs as "Project xxxxxxxx"
function formatProjectLabel(project: Project): string {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (project.name && project.name !== project.id && !uuidRegex.test(project.name)) {
        return project.name;
    }
    const shortId = project.id.substring(0, 8);
    return `Project ${shortId}`;
}

export function ProjectSwitcher() {
    const { data: _session } = useSession();
    const router = useRouter();
    const { orgId, projectId, orgName } = useRouteScope();
    const [projects, setProjects] = React.useState<Project[]>([]);
    const [threadId, setThreadId] = useQueryState("threadId");
    const effectiveProjectId = projectId ?? threadId ?? undefined;
    const [_loading, setLoading] = React.useState(false);
    const [creatingProject, setCreatingProject] = React.useState(false);
    const stream = useStreamContext();
    const createNewThreadWithContext = (stream as { createNewThreadWithContext?: (orgId?: string) => Promise<string | null> })?.createNewThreadWithContext;
    const orgSlug = orgName ?? orgId ?? "";

    const fetchProjects = React.useCallback(async (): Promise<Project[]> => {
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

    React.useEffect(() => {
        fetchProjects();
        const handleFocus = () => fetchProjects();
        const handleOrgContextChanged = () => fetchProjects();
        window.addEventListener('focus', handleFocus);
        window.addEventListener('orgContextChanged', handleOrgContextChanged);
        return () => {
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('orgContextChanged', handleOrgContextChanged);
        };
    }, [fetchProjects]);

    const currentProject = effectiveProjectId
        ? projects.find((p) => p.id === effectiveProjectId || p.thread_id === effectiveProjectId)
        : null;
    const currentLabel = currentProject ? formatProjectLabel(currentProject) : null;
    const triggerTitle = currentProject ? (currentProject.name || currentProject.id) : undefined;

    const handleValueChange = React.useCallback(
        async (val: string) => {
            if (val === "new") {
                if (createNewThreadWithContext && !creatingProject) {
                    setCreatingProject(true);
                    try {
                        const returnedId = await createNewThreadWithContext(orgId ?? undefined);
                        window.dispatchEvent(new CustomEvent("orgContextChanged"));
                        if (returnedId && orgId) {
                            const list = await fetchProjects();
                            const afterCreate = list.find((p) => p.thread_id === returnedId || p.id === returnedId);
                            const finalId = afterCreate?.id ?? returnedId;
                            const finalSlug = afterCreate ? projectSlug(afterCreate) : returnedId;
                            router.push(
                                `/org/${encodeURIComponent(orgSlug)}/${encodeURIComponent(orgId)}/project/${encodeURIComponent(finalSlug)}/${encodeURIComponent(finalId)}/map`
                            );
                        }
                    } finally {
                        setCreatingProject(false);
                    }
                } else {
                    setThreadId(null);
                    if (orgId) router.push(`/org/${encodeURIComponent(orgSlug)}/${encodeURIComponent(orgId)}/map`);
                }
            } else {
                const proj = projects.find((p) => p.id === val || p.thread_id === val);
                const slug = proj ? projectSlug(proj) : val;
                const id = proj?.id ?? val;
                if (orgId) {
                    router.push(
                        `/org/${encodeURIComponent(orgSlug)}/${encodeURIComponent(orgId)}/project/${encodeURIComponent(slug)}/${encodeURIComponent(id)}/map`
                    );
                } else setThreadId(val);
            }
        },
        [createNewThreadWithContext, creatingProject, setThreadId, orgId, orgSlug, router, projects, fetchProjects]
    );

    return (
        <Select
            value={effectiveProjectId || "new"}
            onValueChange={handleValueChange}
            disabled={creatingProject}
        >
            <SelectTrigger
                title={triggerTitle}
                className="h-7 w-auto min-w-0 max-w-[300px] px-2 py-0.5 text-sm font-medium bg-muted/50 border border-border rounded-md text-foreground hover:bg-muted gap-1.5 shadow-none [&>span:last-child]:min-w-0 [&>span:last-child]:truncate"
            >
                <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <SelectValue placeholder="Select Project">
                    {currentLabel ?? undefined}
                </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-background border-border text-foreground">
                {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id} className="focus:bg-muted focus:text-foreground italic">
                        {formatProjectLabel(project)}
                    </SelectItem>
                ))}
                <SelectItem value="new" className="focus:bg-muted focus:text-foreground font-medium border-t border-border mt-1">
                    <div className="flex items-center gap-2">
                        <Plus className="w-3.5 h-3.5" />
                        New Project
                    </div>
                </SelectItem>
            </SelectContent>
        </Select>
    );
}
