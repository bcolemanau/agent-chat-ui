import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import React from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";

const inter = Inter({
  subsets: ["latin"],
  preload: true,
  display: "swap",
});

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_CLIENT_NAME === "daikin" ? "Reflexion | Daikin" : "Reflexion Agent",
  description: "Advanced Agentic Coding Environment",
};

import { BrandingProvider } from "@/providers/Branding";
import { NextAuthProvider } from "@/providers/NextAuthProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <NextAuthProvider>
            <BrandingProvider>
              <NuqsAdapter>
                <TooltipProvider>
                  {children}
                </TooltipProvider>
              </NuqsAdapter>
            </BrandingProvider>
          </NextAuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
