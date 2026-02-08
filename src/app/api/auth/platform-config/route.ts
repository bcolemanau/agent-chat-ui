import { NextResponse } from "next/server";
import { getSessionSafe } from "@/auth";
import { getBackendBaseUrl } from "@/lib/backend-proxy";

async function proxyError(resp: Response): Promise<NextResponse> {
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

export async function GET() {
    try {
        const session = await getSessionSafe();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (!session.user.idToken) {
            return NextResponse.json({ error: "Missing authentication token" }, { status: 401 });
        }

        const targetUrl = `${getBackendBaseUrl()}/auth/platform-config`;
        const resp = await fetch(targetUrl, {
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.user.idToken}`,
            },
        });

        if (!resp.ok) return proxyError(resp);
        const data = await resp.json();
        return NextResponse.json(data);
    } catch (error: unknown) {
        console.error("[PROXY] Auth platform-config GET failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PUT(req: Request) {
    try {
        const session = await getSessionSafe();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (!session.user.idToken) {
            return NextResponse.json({ error: "Missing authentication token" }, { status: 401 });
        }

        const body = await req.json();
        const targetUrl = `${getBackendBaseUrl()}/auth/platform-config`;
        const resp = await fetch(targetUrl, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.user.idToken}`,
            },
            body: JSON.stringify(body),
        });

        if (!resp.ok) return proxyError(resp);
        const data = await resp.json();
        return NextResponse.json(data);
    } catch (error: unknown) {
        console.error("[PROXY] Auth platform-config PUT failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
