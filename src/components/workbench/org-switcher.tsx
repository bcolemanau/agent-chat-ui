'use client';

import * as React from 'react';
import { useSession } from 'next-auth/react';
import { Building2 } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface Organization {
    id: string;
    name: string;
}

export function OrgSwitcher() {
    const { data: session } = useSession();
    const [organizations, setOrganizations] = React.useState<Organization[]>([]);
    const [selectedOrgId, setSelectedOrgId] = React.useState<string>('');
    const [loading, setLoading] = React.useState(false);

    // Check if user is NewCo/Reflexion Admin (match backend: admin, newco_admin, NewCo Administrator, reflexion_admin)
    const userRole = (session?.user?.role ?? '') as string;
    const isAdmin = ['reflexion_admin', 'admin', 'newco_admin', 'Newco_admin', 'NewCo Administrator'].includes(userRole);

    const fetchOrganizations = React.useCallback(async () => {
        if (!isAdmin) return;
        
        try {
            setLoading(true);
            const resp = await fetch('/api/organizations');
            if (resp.ok) {
                const data = await resp.json();
                setOrganizations(data);

                // Load from local storage or fallback to current session customerId
                const savedContext = localStorage.getItem('reflexion_org_context');
                let effectiveOrgId = '';
                if (savedContext && data.some((org: Organization) => org.id === savedContext)) {
                    effectiveOrgId = savedContext;
                } else if (session?.user?.customerId && data.some((org: Organization) => org.id === session.user.customerId)) {
                    effectiveOrgId = session.user.customerId;
                } else if (data.length > 0) {
                    effectiveOrgId = data[0].id;
                }
                setSelectedOrgId(effectiveOrgId);
                // Sync to localStorage so sidebar/project list use the same org on first load
                if (effectiveOrgId && typeof window !== 'undefined') {
                    const current = localStorage.getItem('reflexion_org_context');
                    if (current !== effectiveOrgId) {
                        localStorage.setItem('reflexion_org_context', effectiveOrgId);
                        window.dispatchEvent(new CustomEvent('reflexion_org_context_changed', { detail: { orgId: effectiveOrgId } }));
                    }
                }
            }
        } catch (e) {
            console.error('Failed to fetch orgs:', e);
        } finally {
            setLoading(false);
        }
    }, [isAdmin, session?.user?.customerId]);

    React.useEffect(() => {
        fetchOrganizations();
    }, [fetchOrganizations]);

    // Non-admin: sync session org to localStorage on first load so project list is scoped correctly
    React.useEffect(() => {
        if (isAdmin || typeof session === 'undefined') return;
        const customerId = (session?.user as { customerId?: string })?.customerId;
        if (!customerId || typeof window === 'undefined') return;
        const current = localStorage.getItem('reflexion_org_context');
        if (current !== customerId) {
            localStorage.setItem('reflexion_org_context', customerId);
            window.dispatchEvent(new CustomEvent('reflexion_org_context_changed', { detail: { orgId: customerId } }));
        }
    }, [isAdmin, session?.user]);

    // Listen for storage events to refresh when organizations are updated in another tab
    React.useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'reflexion_orgs_updated') {
                fetchOrganizations();
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, [fetchOrganizations]);

    // Also listen for custom events (for same-tab updates)
    React.useEffect(() => {
        const handleCustomEvent = () => {
            fetchOrganizations();
        };
        window.addEventListener('organizationsUpdated', handleCustomEvent);
        return () => window.removeEventListener('organizationsUpdated', handleCustomEvent);
    }, [fetchOrganizations]);

    const handleValueChange = (orgId: string) => {
        setSelectedOrgId(orgId);
        localStorage.setItem('reflexion_org_context', orgId);
        // Reload to apply context across components
        window.location.reload();
    };

    // Session still loading: show placeholder so breadcrumb slot is always visible on startup
    if (typeof session === 'undefined' || session === null) {
        return (
            <div className="flex items-center gap-2 w-[180px] h-7">
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground truncate">Organization…</span>
            </div>
        );
    }

    // Non-admin: show current org as read-only so breadcrumb always shows organization context
    if (!isAdmin) {
        const currentOrgId = typeof window !== 'undefined' ? localStorage.getItem('reflexion_org_context') : null;
        const displayId = currentOrgId || (session?.user as { customerId?: string })?.customerId || 'default';
        return (
            <div className="flex items-center gap-2 min-w-0 max-w-[200px]" title={`Organization: ${displayId}`}>
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium text-foreground truncate">
                    {displayId === 'default' ? 'Default (default)' : displayId}
                </span>
            </div>
        );
    }

    if (loading && organizations.length === 0) {
        return (
            <div className="flex items-center gap-2 w-[180px] h-9">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Loading...</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <Select value={selectedOrgId} onValueChange={handleValueChange}>
                <SelectTrigger className="h-7 w-auto min-w-0 max-w-[200px] px-2 py-0.5 text-sm font-medium bg-muted/50 border border-border rounded-md text-foreground hover:bg-muted gap-1.5 shadow-none [&>span]:whitespace-nowrap [&>span]:overflow-visible">
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <SelectValue placeholder="Organization">
                        {organizations.find(org => org.id === selectedOrgId)?.name || 'Organization'}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-background border-border text-foreground">
                    {organizations.map((org) => (
                        <SelectItem key={org.id} value={org.id} className="focus:bg-muted focus:text-foreground">
                            {org.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
