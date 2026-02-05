import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { getBackendBaseUrl } from "@/lib/backend-proxy";

export async function GET(
    _req: Request,
    context: { params: Promise<{ orgId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (!session.user.idToken) {
            return NextResponse.json({ error: "Missing authentication token" }, { status: 401 });
        }

        const { orgId } = await context.params;
        const targetUrl = `${getBackendBaseUrl()}/auth/organizations/${encodeURIComponent(orgId)}/users`;
        const resp = await fetch(targetUrl, {
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.user.idToken}`,
            },
        });

        if (!resp.ok) {
            const cloned = resp.clone();
            let errorText = "";
            try {
                const data = await cloned.json();
                errorText = data.detail || data.error || JSON.stringify(data);
            } catch {
                try {
                    errorText = await resp.text();
                } catch {
                    errorText = `Backend returned ${resp.status} ${resp.statusText}`;
                }
            }
            return NextResponse.json({ error: errorText || "Backend error" }, { status: resp.status });
        }

        const data = await resp.json();
        return NextResponse.json(data);
    } catch (error: unknown) {
        console.error("[PROXY] Auth org users fetch failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
