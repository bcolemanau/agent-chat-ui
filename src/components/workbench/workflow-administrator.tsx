"use client";

import React, { useState, useEffect } from "react";
import { GitBranch, Loader2, ShieldAlert, Edit, ListOrdered } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

interface Workflow {
    id: string;
    name: string;
    description: string;
    phase_order: string[];
    approval_next?: Record<string, string> | null;
}

export function WorkflowAdministrator() {
    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorStatus, setErrorStatus] = useState<number | null>(null);
    const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
    const [editForm, setEditForm] = useState({ name: "", description: "" });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadWorkflows();
    }, []);

    const loadWorkflows = async () => {
        try {
            setLoading(true);
            setErrorStatus(null);
            const resp = await fetch("/api/auth/workflows");
            if (resp.ok) {
                const data = await resp.json();
                setWorkflows(Array.isArray(data) ? data : []);
            } else {
                setErrorStatus(resp.status);
                const err = await resp.json().catch(() => ({}));
                toast.error(err.error || "Failed to load workflows");
            }
        } catch (e) {
            console.error("[WORKFLOW_ADMIN] Failed to load workflows:", e);
            setErrorStatus(500);
            toast.error("Failed to load workflows");
        } finally {
            setLoading(false);
        }
    };

    const openEdit = (wf: Workflow) => {
        setEditingWorkflow(wf);
        setEditForm({
            name: wf.name ?? "",
            description: wf.description ?? "",
        });
    };

    const saveWorkflowConfig = async () => {
        if (!editingWorkflow) return;
        try {
            setSaving(true);
            const payload: Record<string, unknown> = {};
            if (editForm.name !== (editingWorkflow.name ?? "")) payload.name = editForm.name;
            if (editForm.description !== (editingWorkflow.description ?? "")) payload.description = editForm.description;
            if (Object.keys(payload).length === 0) {
                toast.info("No changes to save");
                setEditingWorkflow(null);
                return;
            }
            const resp = await fetch(`/api/auth/workflows/${encodeURIComponent(editingWorkflow.id)}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (resp.ok) {
                toast.success("Workflow config updated");
                setEditingWorkflow(null);
                await loadWorkflows();
            } else {
                const err = await resp.json().catch(() => ({}));
                toast.error(err.error || "Failed to update workflow config");
            }
        } catch (e) {
            console.error("[WORKFLOW_ADMIN] Save failed:", e);
            toast.error("Failed to update workflow config");
        } finally {
            setSaving(false);
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
                <h2 className="text-2xl font-bold">Workflow Config</h2>
                <p className="text-muted-foreground">View and edit registered workflows (phase order and display name). Admin-only.</p>
            </div>

            <div className="grid gap-4">
                {errorStatus === 403 ? (
                    <div className="flex items-center gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-amber-800 dark:text-amber-200">
                        <ShieldAlert className="h-5 w-5 shrink-0" />
                        <p className="text-sm font-medium">Admin access required. Only NewCo administrators can view workflows.</p>
                    </div>
                ) : workflows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No workflows returned.</p>
                ) : (
                    workflows.map((wf) => (
                        <Card key={wf.id}>
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <GitBranch className="h-5 w-5 text-muted-foreground" />
                                        <div>
                                            <CardTitle>{wf.name}</CardTitle>
                                            <CardDescription>ID: {wf.id}</CardDescription>
                                        </div>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => openEdit(wf)}
                                        className="gap-1"
                                    >
                                        <Edit className="h-3.5 w-3.5" />
                                        Edit
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {wf.description && (
                                    <p className="text-sm text-muted-foreground">{wf.description}</p>
                                )}
                                {Array.isArray(wf.phase_order) && wf.phase_order.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-2 pt-1">
                                        <ListOrdered className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        <span className="text-xs text-muted-foreground">Phases:</span>
                                        <span className="text-xs font-mono">
                                            {wf.phase_order.join(" → ")}
                                        </span>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            <Dialog open={!!editingWorkflow} onOpenChange={(open) => !open && setEditingWorkflow(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Edit workflow configuration</DialogTitle>
                        <DialogDescription>
                            Update name and description for {editingWorkflow?.name ?? editingWorkflow?.id}. Phase order is fixed at system level.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="wf-edit-name">Name</Label>
                            <Input
                                id="wf-edit-name"
                                value={editForm.name}
                                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                                placeholder="Display name"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="wf-edit-description">Description</Label>
                            <Textarea
                                id="wf-edit-description"
                                value={editForm.description}
                                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                                placeholder="Short description"
                                rows={3}
                                className="resize-y"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingWorkflow(null)}>
                            Cancel
                        </Button>
                        <Button onClick={saveWorkflowConfig} disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
