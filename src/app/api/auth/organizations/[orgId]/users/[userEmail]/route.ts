import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

function getBackendUrl(): string {
    const backendUrl = process.env.LANGGRAPH_API_URL;
    if (!backendUrl) {
        console.warn("[PROXY] LANGGRAPH_API_URL not set, using staging URL as fallback");
        return "https://reflexion-staging.up.railway.app".replace(/\/$/, "");
    }
    return backendUrl.endsWith("/") ? backendUrl.slice(0, -1) : backendUrl;
}

export async function PUT(
    req: Request,
    context: { params: Promise<{ orgId: string; userEmail: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (!session.user.idToken) {
            return NextResponse.json({ error: "Missing authentication token" }, { status: 401 });
        }

        const { orgId, userEmail } = await context.params;
        const body = await req.json();
        const targetUrl = `${getBackendUrl()}/auth/organizations/${encodeURIComponent(orgId)}/users/${encodeURIComponent(userEmail)}`;
        const resp = await fetch(targetUrl, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.user.idToken}`,
            },
            body: JSON.stringify(body),
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
        console.error("[PROXY] Org user update failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(
    _req: Request,
    context: { params: Promise<{ orgId: string; userEmail: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (!session.user.idToken) {
            return NextResponse.json({ error: "Missing authentication token" }, { status: 401 });
        }

        const { orgId, userEmail } = await context.params;
        const targetUrl = `${getBackendUrl()}/auth/organizations/${encodeURIComponent(orgId)}/users/${encodeURIComponent(userEmail)}`;
        const resp = await fetch(targetUrl, {
            method: "DELETE",
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
        console.error("[PROXY] Org user delete failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
