"use client";

import { ProjectConfigurationDiffView } from "@/components/workbench/project-configuration-diff-view";
import { useStreamContext } from "@/providers/Stream";
import { useQueryState } from "nuqs";
import { useEffect, useState } from "react";
import { ProjectConfigurationDiffView as ProjectConfigurationDiffViewType } from "@/lib/diff-types";

export default function HydrationPage() {
  const stream = useStreamContext();
  const [threadId] = useQueryState("threadId");
  const [diffData, setDiffData] = useState<ProjectConfigurationDiffViewType | undefined>();

  // Try to get diff data from stream context (from HITL proposal)
  useEffect(() => {
    // Debug: Log entire stream object to understand structure
    console.log("[HydrationPage] Full stream object keys:", Object.keys(stream || {}));
    console.log("[HydrationPage] stream.interrupt:", (stream as any)?.interrupt);
    console.log("[HydrationPage] stream.values:", (stream as any)?.values);
    console.log("[HydrationPage] stream.pendingInterrupt:", (stream as any)?.pendingInterrupt);
    console.log("[HydrationPage] stream.getInterrupt:", typeof (stream as any)?.getInterrupt);
    
    // Try multiple ways to access interrupt data
    let interrupts = null;
    
    // Method 1: Direct property
    if ((stream as any)?.interrupt) {
      interrupts = (stream as any).interrupt;
      console.log("[HydrationPage] Found interrupt via direct property");
    }
    // Method 2: Function call
    else if (typeof (stream as any)?.getInterrupt === "function") {
      try {
        interrupts = (stream as any).getInterrupt();
        console.log("[HydrationPage] Found interrupt via getInterrupt()");
      } catch (e) {
        console.log("[HydrationPage] getInterrupt() failed:", e);
      }
    }
    // Method 3: In values
    else if ((stream as any)?.values?.interrupt) {
      interrupts = (stream as any).values.interrupt;
      console.log("[HydrationPage] Found interrupt in values");
    }
    // Method 4: pendingInterrupt
    else if ((stream as any)?.pendingInterrupt) {
      interrupts = (stream as any).pendingInterrupt;
      console.log("[HydrationPage] Found interrupt via pendingInterrupt");
    }
    
    console.log("[HydrationPage] Final interrupts value:", interrupts);
    
    if (interrupts) {
      const interruptArray = Array.isArray(interrupts) ? interrupts : [interrupts];
      const hydrationInterrupt = interruptArray.find(
        (int: any) => {
          const actionName = int?.value?.action_requests?.[0]?.name || int?.action_requests?.[0]?.name;
          console.log("[HydrationPage] Checking interrupt action name:", actionName);
          return actionName === "propose_hydration_complete";
        }
      );

      if (hydrationInterrupt) {
        console.log("[HydrationPage] Found hydration interrupt:", hydrationInterrupt);
        
        // Try multiple paths to find preview_data
        const actionRequest = hydrationInterrupt.value?.action_requests?.[0] || hydrationInterrupt.action_requests?.[0];
        const previewData = 
          actionRequest?.preview_data ||  // Direct preview_data in action_request
          actionRequest?.args?.preview_data ||  // Nested in args
          actionRequest?.diff ||  // Direct diff
          actionRequest?.args?.diff ||  // Nested diff in args
          hydrationInterrupt.value?.preview_data ||  // Top-level fallback
          hydrationInterrupt.preview_data;  // Alternative top-level
        
        console.log("[HydrationPage] Found interrupt, previewData:", previewData);
        
        // Extract diff from preview_data if it exists
        if (previewData?.diff) {
          console.log("[HydrationPage] Found diff in previewData.diff:", previewData.diff);
          setDiffData(previewData.diff);
        } else if (previewData && previewData.type === "progression") {
          // Direct diff data (already in the right format)
          console.log("[HydrationPage] Found direct diff data");
          setDiffData(previewData);
        } else if (previewData) {
          // Log what we found for debugging
          console.log("[HydrationPage] PreviewData found but no diff:", Object.keys(previewData));
        } else {
          console.log("[HydrationPage] No previewData found in interrupt structure");
        }
      } else {
        console.log("[HydrationPage] No hydration interrupt found in", interruptArray.length, "interrupts");
      }
    }

    // Fallback: Check localStorage for test data (for development)
    if (!diffData) {
      try {
        const stored = localStorage.getItem("hydration_diff_data");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.type === "progression") {
            console.log("[HydrationPage] Using localStorage fallback data");
            setDiffData(parsed);
          }
        }
      } catch (e) {
        // Ignore
      }
    }
  }, [stream]); // Remove diffData from dependencies to avoid infinite loop

  const handleApprove = async () => {
    // Submit approval to resolve interrupt
    try {
      console.log("[HydrationPage] Submitting approve decision");
      // Match the format expected by the backend: decisions array
      const payload = { decisions: [{ type: "approve" }] };
      console.log("[HydrationPage] Resume payload:", payload);
      await stream.submit({} as any, {
        command: {
          resume: payload,
        },
      });
      console.log("[HydrationPage] Approve submitted successfully");
    } catch (error) {
      console.error("[HydrationPage] Failed to approve:", error);
    }
  };

  const handleReject = async () => {
    // Submit rejection to resolve interrupt
    try {
      console.log("[HydrationPage] Submitting reject decision");
      // Match the format expected by the backend: decisions array
      const payload = { decisions: [{ type: "reject", message: "Hydration not complete" }] };
      console.log("[HydrationPage] Resume payload:", payload);
      await stream.submit({} as any, {
        command: {
          resume: payload,
        },
      });
      console.log("[HydrationPage] Reject submitted successfully");
    } catch (error) {
      console.error("[HydrationPage] Failed to reject:", error);
    }
  };

  return (
    <ProjectConfigurationDiffView
      diffData={diffData}
      onApprove={handleApprove}
      onReject={handleReject}
    />
  );
}
