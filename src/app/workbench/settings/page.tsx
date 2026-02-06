"use client";

import React, { useState } from "react";
import { Settings, Shield, User, Globe, Activity, Building2, Bot, GitBranch, ChevronDown, ChevronRight } from "lucide-react";
import { OrganizationManagement } from "@/components/workbench/organization-management";
import { AgentAdministrator } from "@/components/workbench/agent-administrator";
import { WorkflowAdministrator } from "@/components/workbench/workflow-administrator";
type SectionKey = "org" | "agent" | "workflow" | "account" | "context" | "security";

export default function SettingsPage() {
    const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
        org: true,
        agent: true,
        workflow: true,
        account: true,
        context: true,
        security: true,
    });

    const toggleSection = (key: SectionKey) => {
        setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <div className="flex flex-col h-full min-h-0 bg-background">
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                <div className="max-w-4xl mx-auto w-full p-8 pb-12 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="flex flex-col gap-2 shrink-0">
                    <div className="flex items-center gap-3 text-primary mb-2">
                        <div className="p-2 bg-primary/10 rounded-lg">
                            <Settings className="w-6 h-6" />
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
                    </div>
                    <p className="text-muted-foreground text-lg max-w-2xl">
                        Manage your organization, user preferences, and API integrations.
                    </p>
                </div>

                <div className="space-y-4">
                    {/* Organization Management - Collapsible */}
                    <section className="rounded-xl border border-border bg-muted/10 overflow-hidden">
                        <button
                            type="button"
                            onClick={() => toggleSection("org")}
                            className="w-full flex items-center gap-2 p-4 text-left hover:bg-muted/20 transition-colors"
                        >
                            {openSections.org ? (
                                <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                            ) : (
                                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                            )}
                            <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground/80">
                                Organization Management
                            </span>
                        </button>
                        {openSections.org && (
                            <div className="px-6 pb-6 pt-0">
                                <OrganizationManagement />
                            </div>
                        )}
                    </section>

                    {/* Agent Administrator - Collapsible */}
                    <section className="rounded-xl border border-border bg-muted/10 overflow-hidden">
                        <button
                            type="button"
                            onClick={() => toggleSection("agent")}
                            className="w-full flex items-center gap-2 p-4 text-left hover:bg-muted/20 transition-colors"
                        >
                            {openSections.agent ? (
                                <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                            ) : (
                                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                            )}
                            <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground/80">
                                Agent Administrator
                            </span>
                        </button>
                        {openSections.agent && (
                            <div className="px-6 pb-6 pt-0">
                                <AgentAdministrator />
                            </div>
                        )}
                    </section>

                    {/* Workflow Config - Collapsible */}
                    <section className="rounded-xl border border-border bg-muted/10 overflow-hidden">
                        <button
                            type="button"
                            onClick={() => toggleSection("workflow")}
                            className="w-full flex items-center gap-2 p-4 text-left hover:bg-muted/20 transition-colors"
                        >
                            {openSections.workflow ? (
                                <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                            ) : (
                                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                            )}
                            <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground/80">
                                Workflow Config
                            </span>
                        </button>
                        {openSections.workflow && (
                            <div className="px-6 pb-6 pt-0">
                                <WorkflowAdministrator />
                            </div>
                        )}
                    </section>

                    {/* Account Configuration - Collapsible */}
                    <section className="rounded-xl border border-border bg-muted/10 overflow-hidden">
                        <button
                            type="button"
                            onClick={() => toggleSection("account")}
                            className="w-full flex items-center gap-2 p-4 text-left hover:bg-muted/20 transition-colors"
                        >
                            {openSections.account ? (
                                <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                            ) : (
                                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                            )}
                            <User className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground/80">
                                Account Configuration
                            </span>
                        </button>
                        {openSections.account && (
                            <div className="p-6 pt-0 flex items-center justify-between">
                                <div className="space-y-1">
                                    <p className="font-medium">User Profile</p>
                                    <p className="text-xs text-muted-foreground text-balance max-w-[400px]">Update your personal information and security credentials.</p>
                                </div>
                                <button className="px-4 py-2 bg-muted hover:bg-muted/80 rounded-md text-sm font-medium transition-colors">Edit Profile</button>
                            </div>
                        )}
                    </section>

                    {/* Organization Context - Collapsible */}
                    <section className="rounded-xl border border-border bg-muted/10 overflow-hidden">
                        <button
                            type="button"
                            onClick={() => toggleSection("context")}
                            className="w-full flex items-center gap-2 p-4 text-left hover:bg-muted/20 transition-colors"
                        >
                            {openSections.context ? (
                                <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                            ) : (
                                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                            )}
                            <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground/80">
                                Organization Context
                            </span>
                        </button>
                        {openSections.context && (
                            <div className="p-6 pt-0">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <p className="font-medium">Multi-Tenancy Mode</p>
                                        <p className="text-xs text-muted-foreground">Configured for active organization switching and RBAC enforcement.</p>
                                    </div>
                                    <Activity className="w-5 h-5 text-green-500" />
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Security & API - Collapsible */}
                    <section className="rounded-xl border border-border bg-muted/10 overflow-hidden">
                        <button
                            type="button"
                            onClick={() => toggleSection("security")}
                            className="w-full flex items-center gap-2 p-4 text-left hover:bg-muted/20 transition-colors"
                        >
                            {openSections.security ? (
                                <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                            ) : (
                                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                            )}
                            <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground/80">
                                Security & API
                            </span>
                        </button>
                        {openSections.security && (
                            <div className="p-6 pt-0 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-4 rounded-lg bg-background/50 border border-border/50">
                                    <p className="text-xs font-bold uppercase tracking-tighter text-muted-foreground mb-1">JWT Context</p>
                                    <p className="text-[10px] font-mono truncate">Active session signature verified</p>
                                </div>
                                <div className="p-4 rounded-lg bg-background/50 border border-border/50">
                                    <p className="text-xs font-bold uppercase tracking-tighter text-muted-foreground mb-1">Proxy Endpoints</p>
                                    <p className="text-[10px] font-mono truncate">http://localhost:8080</p>
                                </div>
                            </div>
                        )}
                    </section>
                </div>
                </div>
            </div>
        </div>
    );
}
