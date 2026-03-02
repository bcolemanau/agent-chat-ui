import { NextResponse } from "next/server";
import { getBackendBaseUrl } from "@/lib/backend-proxy";

/**
 * Proxy to backend GET /kg/data/base. No auth required — for public demo/hero.
 * Returns base NPD model (nodes, links, metadata with entity_counts, phase_grouping, link_type_counts).
 */
export async function GET() {
    try {
        const baseUrl = getBackendBaseUrl();
        const targetUrl = `${baseUrl}/kg/data/base`;

        const resp = await fetch(targetUrl, {
            headers: { "Content-Type": "application/json" },
            next: { revalidate: 60 },
        });

        if (!resp.ok) {
            const errorText = await resp.text();
            console.error(`[PROXY] Demo KG error: ${resp.status} - ${errorText}`);
            return NextResponse.json({ error: "Backend error" }, { status: resp.status });
        }

        const data = (await resp.json()) as { nodes?: unknown[]; links?: unknown[]; metadata?: Record<string, unknown> };
        return NextResponse.json(data, {
            headers: {
                "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
            },
        });
    } catch (error: unknown) {
        console.error("[PROXY] Demo KG fetch failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
