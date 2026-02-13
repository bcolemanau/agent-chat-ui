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

/** Sentinel value for "no org" (Home). Radix Select disallows empty string for SelectItem. */
const HOME_VALUE = '__home__';

interface Organization {
    id: string;
    name: string;
}

export function OrgSwitcher() {
    const { data: session } = useSession();
    const [organizations, setOrganizations] = React.useState<Organization[]>([]);
    const [selectedOrgId, setSelectedOrgId] = React.useState<string>('');
    const [loading, setLoading] = React.useState(false);

    // Check if user can manage organizations (match shell + Organization Management: reflexion_admin, admin, newco_admin)
    const userRole = session?.user?.role;
    const isAdmin = Boolean(userRole && ['reflexion_admin', 'admin', 'newco_admin'].includes(userRole as string));

    const fetchOrganizations = React.useCallback(async () => {
        if (!isAdmin) return;
        
        try {
            setLoading(true);
            const resp = await fetch('/api/organizations');
            if (resp.ok) {
                const data = await resp.json();
                setOrganizations(data);

                // Load from local storage. Admin "home" = no org (empty). Non-admin defaults to their org.
                const savedContext = localStorage.getItem('reflexion_org_context');
                let effectiveOrgId: string | undefined;
                if (savedContext === null || savedContext === '') {
                    // No org selected (admin home). Only keep empty for admin.
                    effectiveOrgId = isAdmin ? '' : (session?.user?.customerId && data.some((org: Organization) => org.id === session.user.customerId) ? session.user.customerId : data[0]?.id);
                } else if (data.some((org: Organization) => org.id === savedContext)) {
                    effectiveOrgId = savedContext;
                } else if (session?.user?.customerId && data.some((org: Organization) => org.id === session.user.customerId)) {
                    effectiveOrgId = session.user.customerId;
                } else if (data.length > 0) {
                    effectiveOrgId = data[0].id;
                }
                setSelectedOrgId(effectiveOrgId ?? HOME_VALUE);
                if (effectiveOrgId) {
                    localStorage.setItem('reflexion_org_context', effectiveOrgId);
                    window.dispatchEvent(new CustomEvent('orgContextChanged'));
                } else {
                    localStorage.removeItem('reflexion_org_context');
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

    // Selecting an org = work in that existing cloned branch (no clone; branch already exists).
    const handleValueChange = (orgId: string) => {
        setSelectedOrgId(orgId);
        if (orgId && orgId !== HOME_VALUE) {
            localStorage.setItem('reflexion_org_context', orgId);
        } else {
            localStorage.removeItem('reflexion_org_context');
        }
        // So Stream provider clears threadId on next load (thread from previous org is invalid)
        sessionStorage.setItem('reflexion_clear_thread_for_org_switch', '1');
        window.dispatchEvent(new CustomEvent('orgContextChanged'));
        window.location.reload();
    };

    if (!isAdmin) return null;

    const isHome = !selectedOrgId || selectedOrgId === HOME_VALUE;
    const selectedOrg = !isHome ? organizations.find(org => org.id === selectedOrgId) : null;
    const selectedOrgName = selectedOrg?.name || (isHome ? 'Home' : 'Organization');

    if (loading && organizations.length === 0) {
        return (
            <div className="flex items-center gap-2 min-w-[140px] h-9">
                <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground">Loading...</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 min-w-0">
            <Select value={isHome ? HOME_VALUE : selectedOrgId} onValueChange={handleValueChange}>
                <SelectTrigger
                    title={selectedOrgName}
                    className="h-9 min-w-[140px] max-w-[320px] w-auto bg-background border-border text-foreground [&>span:last-child]:min-w-0 [&>span:last-child]:truncate"
                >
                    <Building2 className="w-4 h-4 mr-2 text-muted-foreground shrink-0" />
                    <SelectValue placeholder="Organization">
                        {selectedOrgName}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-background border-border text-foreground">
                    <SelectItem value={HOME_VALUE} className="focus:bg-muted focus:text-foreground font-medium border-b border-border mb-1">
                        Home
                    </SelectItem>
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
