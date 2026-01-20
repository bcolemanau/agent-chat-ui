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

    const isAdmin = session?.user?.role === 'reflexion_admin';

    const fetchOrganizations = React.useCallback(async () => {
        try {
            const resp = await fetch('/api/organizations');
            if (resp.ok) {
                const data = await resp.json();
                setOrganizations(data);

                // Load from local storage or fallback to current session customerId
                const savedContext = localStorage.getItem('reflexion_org_context');
                if (savedContext) {
                    setSelectedOrgId(savedContext);
                } else if (session?.user?.customerId) {
                    setSelectedOrgId(session.user.customerId);
                }
            }
        } catch (e) {
            console.error('Failed to fetch orgs:', e);
        }
    }, [session?.user?.customerId]);

    React.useEffect(() => {
        if (isAdmin) {
            fetchOrganizations();
        }
    }, [isAdmin, fetchOrganizations]);

    const handleValueChange = (orgId: string) => {
        setSelectedOrgId(orgId);
        localStorage.setItem('reflexion_org_context', orgId);
        // Reload to apply context across components
        window.location.reload();
    };

    if (!isAdmin) return null;

    return (
        <div className="flex items-center gap-2">
            <Select value={selectedOrgId} onValueChange={handleValueChange}>
                <SelectTrigger className="w-[180px] h-9 bg-background border-border text-foreground">
                    <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
                    <SelectValue placeholder="Organization" />
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
