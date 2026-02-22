"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Phase 3: Redirect to org-scoped map when org is in context; else flat /map.
 */
export default function AppPage() {
    const router = useRouter();
    useEffect(() => {
        const org = typeof window !== "undefined" ? localStorage.getItem("reflexion_org_context") : null;
        if (org?.trim()) {
            router.replace(`/org/${encodeURIComponent(org)}/map`);
        } else {
            router.replace("/map");
        }
    }, [router]);
    return null;
}
