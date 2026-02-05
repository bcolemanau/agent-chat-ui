import { NextResponse } from "next/server";

/**
 * Root /health for load balancers or checks that hit /health (not /api/health).
 * /api/health is the primary health route; this avoids 404 when something requests GET /health.
 */
export async function GET() {
    return NextResponse.json({ status: "ok" });
}
