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
import { isReflexionAdmin } from '@/config/users';

interface Organization {
    id: string;
    name: string;
}

export function OrgSwitcher() {
    const { data: session } = useSession();
    const [organizations, setOrganizations] = React.useState<Organization[]>([]);
    const [selectedOrgId, setSelectedOrgId] = React.useState<string>('');
    const [loading, setLoading] = React.useState(false);

    const isAdmin = isReflexionAdmin(session?.user?.role);

    const fetchOrganizations = React.useCallback(async () => {
        try {
            setLoading(true);
            const resp = await fetch('/api/organizations');
            if (resp.ok) {
                const data = await resp.json();
                setOrganizations(Array.isArray(data) ? data : []);

                // Load from local storage or fallback to current session customerId
                const savedContext = localStorage.getItem('reflexion_org_context');
                if (savedContext && (data as Organization[]).some((org: Organization) => org.id === savedContext)) {
                    setSelectedOrgId(savedContext);
                } else if (session?.user?.customerId && (data as Organization[]).some((org: Organization) => org.id === session.user!.customerId)) {
                    setSelectedOrgId(session.user.customerId!);
                } else if ((data as Organization[]).length > 0) {
                    setSelectedOrgId((data as Organization[])[0].id);
                }
            }
        } catch (e) {
            console.error('Failed to fetch orgs:', e);
        } finally {
            setLoading(false);
        }
    }, [session?.user?.customerId]);

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

    const handleValueChange = (orgId: string) => {
        setSelectedOrgId(orgId);
        localStorage.setItem('reflexion_org_context', orgId);
        // Reload to apply context across components
        window.location.reload();
    };

    if (!isAdmin) return null;

    const selectedOrg = organizations.find(org => org.id === selectedOrgId);
    const selectedOrgName = selectedOrg?.name || 'Organization';

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
            <Select value={selectedOrgId} onValueChange={handleValueChange}>
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
