"use client";

import { Thread } from "@/components/thread";
import { StreamProvider } from "@/providers/Stream";
import { ThreadProvider } from "@/providers/Thread";
import { ArtifactProvider } from "@/components/thread/artifact";
import { Toaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/error-boundary";
import React, { useEffect } from "react";
import { useSession } from "next-auth/react";
import { Login } from "@/components/Login";

const CLIENT_VERSION = "0.1.0-discovery-debug";
const BUILD_TIME = "2026-01-14T23:02:00Z"; // Manual tag for current session

export default function DemoPage(): React.ReactNode {
  const { status } = useSession();

  useEffect(() => {
    console.log(
      `%c[Agent Chat UI] %cVersion: ${CLIENT_VERSION} %c(Built: ${BUILD_TIME})`,
      "color: #3b82f6; font-weight: bold;",
      "color: #10b981;",
      "color: #6b7280;"
    );
  }, []);

  if (status === "loading") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-black">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900 dark:border-white"></div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <Login />;
  }

  return (
    <React.Suspense fallback={<div>Loading (layout)...</div>}>
      <Toaster />
      <ErrorBoundary>
        <ThreadProvider>
          <StreamProvider>
            <ArtifactProvider>
              <Thread />
            </ArtifactProvider>
          </StreamProvider>
        </ThreadProvider>
      </ErrorBoundary>
    </React.Suspense>
  );
}
