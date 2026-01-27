import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Public routes that don't require authentication
    const publicRoutes = [
        "/api/auth", // NextAuth routes
        "/api/health", // Health check endpoint (for monitoring/load balancers)
        "/api/info", // Backend health check proxy (comment says "doesn't require auth")
        "/api/langsmith-config", // LangSmith config for client-side OpenTelemetry (exposes API key but needed for telemetry init)
        "/_next", // Next.js internal routes
        "/favicon.ico",
        "/logo.svg",
    ];

    // Check if the route is public
    const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

    // If it's a public route, allow access
    if (isPublicRoute) {
        return NextResponse.next();
    }

    // Get the session token
    const token = await getToken({ 
        req: request,
        secret: process.env.REFLEXION_JWT_SECRET || process.env.NEXTAUTH_SECRET 
    });

    // If no token and trying to access protected route
    if (!token) {
        // If already on root/login, allow it (Login component will handle display)
        if (pathname === "/" || pathname === "/login") {
            return NextResponse.next();
        }
        // Otherwise redirect to root which will show Login component
        const loginUrl = new URL("/", request.url);
        loginUrl.searchParams.set("callbackUrl", pathname);
        return NextResponse.redirect(loginUrl);
    }
    
    // If authenticated and on root, redirect to workbench
    if (token && pathname === "/") {
        return NextResponse.redirect(new URL("/workbench/map", request.url));
    }

    // User is authenticated, allow access
    return NextResponse.next();
}

// Configure which routes this middleware runs on
export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api/auth (NextAuth routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - logo.svg (logo file)
         */
        "/((?!api/auth|_next/static|_next/image|favicon.ico|logo.svg).*)",
    ],
};
