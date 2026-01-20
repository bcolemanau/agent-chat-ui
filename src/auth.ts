import { NextAuthOptions, DefaultSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { getUserConfig, UserConfig } from "./config/users";
import jwt from "jsonwebtoken";

// Extend built-in session types to include our custom fields
declare module "next-auth" {
    interface Session {
        user: UserConfig & DefaultSession["user"] & {
            idToken?: string; // This will now be our custom signed Backend Token
        }
    }
}

declare module "next-auth/jwt" {
    interface JWT extends UserConfig {
        idToken?: string;
    }
}

export const authOptions: NextAuthOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.AUTH_GOOGLE_ID!,
            clientSecret: process.env.AUTH_GOOGLE_SECRET!,
            authorization: {
                params: {
                    prompt: "consent",
                    access_type: "offline",
                    response_type: "code"
                }
            }
        })
    ],
    session: { strategy: "jwt" },
    callbacks: {
        async jwt({ token, account, user }) {
            // On initial sign in
            if (account && user) {
                // 1. Look up Organization/Role info from Backend
                const userEmail = user.email;
                let config = getUserConfig(userEmail);

                try {
                    let backendUrl = process.env.LANGGRAPH_API_URL || "https://reflexion-staging.up.railway.app";

                    // Remove trailing slash if present
                    if (backendUrl.endsWith("/")) {
                        backendUrl = backendUrl.slice(0, -1);
                    }

                    const profileUrl = `${backendUrl}/auth/profile?email=${userEmail}`;
                    console.log(`[AUTH] Fetching profile from: ${profileUrl}`);

                    const resp = await fetch(profileUrl, {
                        headers: {
                            "X-Api-Key": process.env.LANGSMITH_API_KEY!
                        }
                    });
                    if (resp.ok) {
                        const profile = await resp.json();
                        config = {
                            customerId: profile.customerId || config.customerId,
                            projectId: config.projectId || "demo-project", // Default project if not in profile
                            role: profile.role || config.role
                        };
                        console.log(`[AUTH] Successfully fetched profile for ${userEmail}:`, config);
                    } else {
                        console.error(`[AUTH] Backend profile lookup failed for ${userEmail}. Status: ${resp.status}, URL: ${profileUrl}`);
                    }
                } catch (e) {
                    console.error(`[AUTH] Exception during profile lookup for ${userEmail}:`, e);
                }

                token.customerId = config.customerId;
                token.projectId = config.projectId;
                token.role = config.role;

                // 2. Mint Backend-Compatible Token
                // This token mimics what reflexion_graph/security.py expects
                const backendPayload = {
                    sub: userEmail, // Or customer_id:project_id format if preferred
                    email: userEmail,
                    customer_id: config.customerId,
                    project_id: config.projectId,
                    role: config.role,
                };

                token.idToken = jwt.sign(backendPayload, process.env.NEXTAUTH_SECRET!, {
                    algorithm: "HS256",
                    expiresIn: "24h"
                });
            } else if (token.customerId && token.projectId && token.email) {
                // Maintenance: Check if idToken is expired or expiring soon (e.g. within 1 hour)
                // If so, mint a new one so the user's session remains valid for backend calls
                let shouldRefresh = !token.idToken;

                if (token.idToken) {
                    try {
                        const decoded = jwt.decode(token.idToken) as any;
                        if (decoded && decoded.exp) {
                            const now = Math.floor(Date.now() / 1000);
                            // Refresh if expired or expiring in < 1 hour
                            if (decoded.exp - now < 3600) {
                                shouldRefresh = true;
                            }
                        } else {
                            shouldRefresh = true;
                        }
                    } catch (e) {
                        shouldRefresh = true;
                    }
                }

                if (shouldRefresh) {
                    const backendPayload = {
                        sub: token.email,
                        email: token.email,
                        customer_id: token.customerId,
                        project_id: token.projectId,
                        role: token.role,
                    };
                    token.idToken = jwt.sign(backendPayload, process.env.NEXTAUTH_SECRET!, {
                        algorithm: "HS256",
                        expiresIn: "24h"
                    });
                    // console.log(`[AUTH] Refreshed expired/stale idToken for ${token.email}`);
                }
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.customerId = token.customerId as string;
                session.user.projectId = token.projectId as string;
                session.user.role = token.role as any;
                session.user.idToken = token.idToken as string;
            }
            return session;
        }
    },
    pages: {
        signIn: "/",
    }
};
