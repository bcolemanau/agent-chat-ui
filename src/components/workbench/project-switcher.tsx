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
import { useSession } from "next-auth/react";

interface Project {
    id: string;
    name: string;
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
    const { data: session } = useSession();
    const [projects, setProjects] = React.useState<Project[]>([]);
    const [threadId, setThreadId] = useQueryState("threadId");
    const [loading, setLoading] = React.useState(false);

    const fetchProjects = React.useCallback(async () => {
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
            }
        } catch (error) {
            console.error("Failed to fetch projects:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchProjects();

        // Refresh when org changes (using custom event or interval as a simple fallback)
        const handleFocus = () => fetchProjects();
        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [fetchProjects]);

    const currentProject = threadId ? projects.find((p) => p.id === threadId) : null;
    const currentLabel = currentProject ? formatProjectLabel(currentProject) : null;
    const triggerTitle = currentProject ? (currentProject.name || currentProject.id) : undefined;

    return (
        <Select
            value={threadId || "new"}
            onValueChange={(val) => setThreadId(val === "new" ? null : val)}
        >
            <SelectTrigger
                title={triggerTitle}
                className="h-7 w-auto min-w-0 max-w-[220px] px-2 py-0.5 text-sm font-medium bg-muted/50 border border-border rounded-md text-foreground hover:bg-muted gap-1.5 shadow-none [&>span:last-child]:min-w-0 [&>span:last-child]:truncate"
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
