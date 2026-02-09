import { NextResponse } from "next/server";
import { getSessionSafe } from "@/auth";
import { getBackendBaseUrl } from "@/lib/backend-proxy";

export async function GET(req: Request) {
    try {
        // getSessionSafe() avoids throwing on invalid session cookie (e.g. after NEXTAUTH_SECRET change)
        const session = await getSessionSafe();

        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const targetUrl = `${getBackendBaseUrl()}/auth/branding`;

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };

        // Add authorization if idToken is available
        if (session.user.idToken) {
            headers["Authorization"] = `Bearer ${session.user.idToken}`;
        }

        const resp = await fetch(targetUrl, { headers });

        if (!resp.ok) {
            let errorText = "";
            try {
                const errorData = await resp.json();
                errorText = errorData.detail || errorData.error || JSON.stringify(errorData);
            } catch {
                errorText = await resp.text();
            }
            console.error(`[PROXY] Backend error (branding): ${resp.status} - ${errorText}`);
            return NextResponse.json({ error: errorText || "Backend error" }, { status: resp.status });
        }

        const data = await resp.json();
        return NextResponse.json(data);

    } catch (error: any) {
        console.error("[PROXY] Branding fetch failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
