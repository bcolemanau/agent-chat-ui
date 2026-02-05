import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { getBackendBaseUrl } from "@/lib/backend-proxy";

export async function GET(req: Request) {
    try {
        // In Next.js 15, getServerSession needs headers from the request
        const session = await getServerSession(authOptions);

        if (!session || !session.user) {
            console.error("[PROXY] No session found for organizations request");
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (!session.user.idToken) {
            console.error("[PROXY] No idToken in session for organizations request");
            return NextResponse.json({ error: "Missing authentication token" }, { status: 401 });
        }

        const targetUrl = `${getBackendBaseUrl()}/auth/organizations`;
        console.log(`[PROXY] Fetching organizations from ${targetUrl}`);

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.user.idToken}`,
        };

        const resp = await fetch(targetUrl, { headers });

        if (!resp.ok) {
            // Clone response before reading to avoid "Body is unusable" error
            const clonedResp = resp.clone();
            let errorText = "";
            try {
                const errorData = await clonedResp.json();
                errorText = errorData.detail || errorData.error || JSON.stringify(errorData);
            } catch {
                // If JSON parsing fails, try text
                try {
                    errorText = await resp.text();
                } catch {
                    errorText = `Backend returned ${resp.status} ${resp.statusText}`;
                }
            }
            console.error(`[PROXY] Backend error (orgs): ${resp.status} - ${errorText}`);
            return NextResponse.json({ error: errorText || "Backend error" }, { status: resp.status });
        }

        const data = await resp.json();
        return NextResponse.json(data);

    } catch (error: any) {
        console.error("[PROXY] Organizations fetch failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const targetUrl = `${getBackendBaseUrl()}/auth/organizations`;

        const resp = await fetch(targetUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${session.user.idToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });

        if (!resp.ok) {
            const errorText = await resp.text();
            console.error(`[PROXY] Backend error (create org): ${resp.status} - ${errorText}`);
            return NextResponse.json({ error: errorText || "Backend error" }, { status: resp.status });
        }

        const data = await resp.json();
        return NextResponse.json(data);

    } catch (error: any) {
        console.error("[PROXY] Organization creation failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
