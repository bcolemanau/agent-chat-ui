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
                // 1. Look up Organization/Role info
                const userEmail = user.email;
                const config = getUserConfig(userEmail);

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

                // Sign with the shared secret
                // IMPORTANT: Backend must use the same secret (REFLEXION_JWT_SECRET)
                token.idToken = jwt.sign(backendPayload, process.env.NEXTAUTH_SECRET!, {
                    algorithm: "HS256",
                    expiresIn: "24h"
                });
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
