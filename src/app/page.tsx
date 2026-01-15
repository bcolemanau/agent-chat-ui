"use client";

import { Thread } from "@/components/thread";
import { StreamProvider } from "@/providers/Stream";
import { ThreadProvider } from "@/providers/Thread";
import { ArtifactProvider } from "@/components/thread/artifact";
import { Toaster } from "@/components/ui/sonner";
import React, { useEffect } from "react";

const CLIENT_VERSION = "0.1.0-discovery-debug";
const BUILD_TIME = "2026-01-14T23:02:00Z"; // Manual tag for current session

export default function DemoPage(): React.ReactNode {
  useEffect(() => {
    console.log(
      `%c[Agent Chat UI] %cVersion: ${CLIENT_VERSION} %c(Built: ${BUILD_TIME})`,
      "color: #3b82f6; font-weight: bold;",
      "color: #10b981;",
      "color: #6b7280;"
    );
  }, []);

  return (
    <React.Suspense fallback={<div>Loading (layout)...</div>}>
      <Toaster />
      <ThreadProvider>
        <StreamProvider>
          <ArtifactProvider>
            <Thread />
          </ArtifactProvider>
        </StreamProvider>
      </ThreadProvider>
    </React.Suspense>
  );
}
