"use client";

import React, { useState, useEffect } from "react";
import { Bot, Loader2, ShieldAlert, ChevronDown, ChevronRight, Thermometer, Wrench, ListOrdered, AlertCircle, Edit } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface Agent {
    id: string;
    name: string;
    description: string;
    primary_role?: string;
    tools?: string[];
    workflow?: string;
    critical_instructions?: string;
    temperature?: number;
}

function AgentPromptSection({
    label,
    icon: Icon,
    content,
    defaultOpen = false,
}: {
    label: string;
    icon: React.ElementType;
    content: string | string[] | undefined;
    defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);
    if (content == null || (Array.isArray(content) && content.length === 0) || (typeof content === "string" && !content.trim()))
        return null;
    const isList = Array.isArray(content);
    return (
        <div className="border-b border-border/50 last:border-b-0">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="w-full flex items-center gap-2 py-2 text-left text-sm font-medium text-foreground hover:bg-muted/30 rounded px-1 -mx-1"
            >
                {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span>{label}</span>
            </button>
            {open && (
                <div className="pl-6 pb-3 text-sm text-muted-foreground">
                    {isList ? (
                        <ul className="list-disc list-inside space-y-1">
                            {(content as string[]).map((item, i) => (
                                <li key={i}>{item}</li>
                            ))}
                        </ul>
                    ) : (
                        <p className="whitespace-pre-wrap">{content as string}</p>
                    )}
                </div>
            )}
        </div>
    );
}

export function AgentAdministrator() {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorStatus, setErrorStatus] = useState<number | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
    const [editForm, setEditForm] = useState({
        name: "",
        description: "",
        primary_role: "",
        tools: "" as string,
        workflow: "",
        critical_instructions: "",
        temperature: 0,
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadAgents();
    }, []);

    const openEdit = (agent: Agent) => {
        setEditingAgent(agent);
        setEditForm({
            name: agent.name ?? "",
            description: agent.description ?? "",
            primary_role: agent.primary_role ?? "",
            tools: Array.isArray(agent.tools) ? agent.tools.join(", ") : "",
            workflow: agent.workflow ?? "",
            critical_instructions: agent.critical_instructions ?? "",
            temperature: agent.temperature ?? 0,
        });
    };

    const saveAgentConfig = async () => {
        if (!editingAgent) return;
        try {
            setSaving(true);
            const payload: Record<string, unknown> = {};
            if (editForm.name !== (editingAgent.name ?? "")) payload.name = editForm.name;
            if (editForm.description !== (editingAgent.description ?? "")) payload.description = editForm.description;
            if (editForm.primary_role !== (editingAgent.primary_role ?? "")) payload.primary_role = editForm.primary_role;
            if (editForm.workflow !== (editingAgent.workflow ?? "")) payload.workflow = editForm.workflow;
            if (editForm.critical_instructions !== (editingAgent.critical_instructions ?? "")) payload.critical_instructions = editForm.critical_instructions;
            const toolsList = editForm.tools
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            const currentTools = editingAgent.tools ?? [];
            if (toolsList.length !== currentTools.length || toolsList.some((t, i) => t !== currentTools[i])) payload.tools = toolsList;
            if (Number(editForm.temperature) !== (editingAgent.temperature ?? 0)) payload.temperature = Number(editForm.temperature);
            if (Object.keys(payload).length === 0) {
                toast.info("No changes to save");
                setEditingAgent(null);
                return;
            }
            const resp = await fetch(`/api/auth/agents/${encodeURIComponent(editingAgent.id)}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (resp.ok) {
                toast.success("Agent config updated");
                setEditingAgent(null);
                await loadAgents();
            } else {
                const err = await resp.json().catch(() => ({}));
                toast.error(err.error || "Failed to update agent config");
            }
        } catch (e) {
            console.error("[AGENT_ADMIN] Save failed:", e);
            toast.error("Failed to update agent config");
        } finally {
            setSaving(false);
        }
    };

    const loadAgents = async () => {
        try {
            setLoading(true);
            setErrorStatus(null);
            const resp = await fetch("/api/auth/agents");
            if (resp.ok) {
                const data = await resp.json();
                setAgents(Array.isArray(data) ? data : []);
            } else {
                setErrorStatus(resp.status);
                const err = await resp.json().catch(() => ({}));
                const msg = err.error || "Failed to load agents";
                toast.error(msg);
            }
        } catch (e) {
            console.error("[AGENT_ADMIN] Failed to load agents:", e);
            setErrorStatus(500);
            toast.error("Failed to load agents");
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold">Agent Administrator</h2>
                <p className="text-muted-foreground">View registered NewCo workflow agents and prompt configuration</p>
            </div>

            <div className="grid gap-4">
                {errorStatus === 403 ? (
                    <div className="flex items-center gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-amber-800 dark:text-amber-200">
                        <ShieldAlert className="h-5 w-5 shrink-0" />
                        <p className="text-sm font-medium">Admin access required. Only NewCo administrators can view the agents list.</p>
                    </div>
                ) : agents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No agents returned.</p>
                ) : (
                    agents.map((agent) => {
                        const hasPromptConfig = Boolean(
                            agent.primary_role ||
                                (agent.tools && agent.tools.length > 0) ||
                                agent.workflow ||
                                agent.critical_instructions ||
                                agent.temperature != null
                        );
                        const isExpanded = expandedId === agent.id;
                        return (
                            <Card key={agent.id}>
                                <CardHeader className="pb-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <Bot className="h-5 w-5 text-muted-foreground" />
                                            <div>
                                                <CardTitle>{agent.name}</CardTitle>
                                                <CardDescription>ID: {agent.id}</CardDescription>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => openEdit(agent)}
                                                className="gap-1"
                                            >
                                                <Edit className="h-3.5 w-3.5" />
                                                Edit
                                            </Button>
                                            {hasPromptConfig && (
                                            <button
                                                type="button"
                                                onClick={() => setExpandedId(isExpanded ? null : agent.id)}
                                                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                                            >
                                                {isExpanded ? "Hide prompt" : "Show prompt"}
                                                {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                            </button>
                                            )}
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <p className="text-sm text-muted-foreground">{agent.description}</p>

                                    {/* Config row: temperature */}
                                    {(agent.temperature != null || agent.tools?.length) && !isExpanded && (
                                        <div className="flex flex-wrap items-center gap-2 pt-1">
                                            {agent.temperature != null && (
                                                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                                    <Thermometer className="h-3.5 w-3.5" />
                                                    Temperature: {agent.temperature}
                                                </span>
                                            )}
                                            {agent.tools && agent.tools.length > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                    {agent.tools.slice(0, 5).map((t) => (
                                                        <Badge key={t} variant="secondary" className="text-xs font-mono">
                                                            {t}
                                                        </Badge>
                                                    ))}
                                                    {agent.tools.length > 5 && (
                                                        <Badge variant="outline" className="text-xs">
                                                            +{agent.tools.length - 5}
                                                        </Badge>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Expanded: Primary Role, Tools, Workflow, Critical Instructions, Temperature */}
                                    {isExpanded && hasPromptConfig && (
                                        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-0 mt-3">
                                            <AgentPromptSection
                                                label="Primary role"
                                                icon={Bot}
                                                content={agent.primary_role}
                                                defaultOpen={true}
                                            />
                                            <AgentPromptSection
                                                label="Tools"
                                                icon={Wrench}
                                                content={agent.tools?.length ? agent.tools : undefined}
                                            />
                                            <AgentPromptSection
                                                label="Workflow"
                                                icon={ListOrdered}
                                                content={agent.workflow}
                                            />
                                            <AgentPromptSection
                                                label="Critical instructions"
                                                icon={AlertCircle}
                                                content={agent.critical_instructions}
                                            />
                                            {agent.temperature != null && (
                                                <div className="flex items-center gap-2 py-2 text-sm">
                                                    <Thermometer className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                                    <span className="font-medium">Temperature</span>
                                                    <span className="text-muted-foreground">{agent.temperature}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })
                )}
            </div>

            {/* Edit agent config dialog */}
            <Dialog open={!!editingAgent} onOpenChange={(open) => !open && setEditingAgent(null)}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Edit agent configuration</DialogTitle>
                        <DialogDescription>
                            Update prompt sections and temperature for {editingAgent?.name ?? editingAgent?.id}. Changes are persisted and used by the graph where supported.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="edit-name">Name</Label>
                                <Input
                                    id="edit-name"
                                    value={editForm.name}
                                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                                    placeholder="Display name"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-temperature">Temperature</Label>
                                <Input
                                    id="edit-temperature"
                                    type="number"
                                    min={0}
                                    max={2}
                                    step={0.1}
                                    value={editForm.temperature}
                                    onChange={(e) => setEditForm((f) => ({ ...f, temperature: Number(e.target.value) || 0 }))}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-description">Description</Label>
                            <Input
                                id="edit-description"
                                value={editForm.description}
                                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                                placeholder="Short description"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-primary-role">Primary role</Label>
                            <Textarea
                                id="edit-primary-role"
                                value={editForm.primary_role}
                                onChange={(e) => setEditForm((f) => ({ ...f, primary_role: e.target.value }))}
                                placeholder="Primary role text"
                                rows={3}
                                className="resize-y font-mono text-sm"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-tools">Tools (comma-separated)</Label>
                            <Input
                                id="edit-tools"
                                value={editForm.tools}
                                onChange={(e) => setEditForm((f) => ({ ...f, tools: e.target.value }))}
                                placeholder="tool_one, tool_two"
                                className="font-mono"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-workflow">Workflow</Label>
                            <Textarea
                                id="edit-workflow"
                                value={editForm.workflow}
                                onChange={(e) => setEditForm((f) => ({ ...f, workflow: e.target.value }))}
                                placeholder="Workflow steps"
                                rows={3}
                                className="resize-y font-mono text-sm"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-critical">Critical instructions</Label>
                            <Textarea
                                id="edit-critical"
                                value={editForm.critical_instructions}
                                onChange={(e) => setEditForm((f) => ({ ...f, critical_instructions: e.target.value }))}
                                placeholder="Critical instructions"
                                rows={4}
                                className="resize-y font-mono text-sm"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingAgent(null)}>
                            Cancel
                        </Button>
                        <Button onClick={saveAgentConfig} disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
