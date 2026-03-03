"use client";

import { useCallback, useEffect, useState } from "react";

export type RewriterPreset = "improve" | "more-formal" | "more-casual" | "shorter" | "longer";

const REWRITER_SUPPORTED =
  typeof globalThis !== "undefined" && "Rewriter" in globalThis;

export function useChromeRewriter() {
  const [availability, setAvailability] = useState<
    "unknown" | "available" | "downloadable" | "unavailable"
  >("unknown");
  const [isRewriting, setIsRewriting] = useState(false);

  const checkAvailability = useCallback(async () => {
    if (!REWRITER_SUPPORTED) {
      setAvailability("unavailable");
      return "unavailable" as const;
    }
    try {
      const R = (globalThis as unknown as { Rewriter: { availability(): Promise<string> } }).Rewriter;
      const result = (await R.availability()) as "available" | "downloadable" | "unavailable";
      setAvailability(result);
      return result;
    } catch {
      setAvailability("unavailable");
      return "unavailable" as const;
    }
  }, []);

  useEffect(() => {
    if (REWRITER_SUPPORTED && availability === "unknown") {
      checkAvailability();
    } else if (!REWRITER_SUPPORTED) {
      setAvailability("unavailable");
    }
  }, [REWRITER_SUPPORTED, availability, checkAvailability]);

  const rewrite = useCallback(
    async (
      text: string,
      preset: RewriterPreset = "improve"
    ): Promise<string | null> => {
      if (!text.trim()) return null;
      if (!REWRITER_SUPPORTED) return null;
      const av = availability === "unknown" ? await checkAvailability() : availability;
      if (av === "unavailable") return null;

      setIsRewriting(true);
      try {
        const R = (globalThis as unknown as { Rewriter: { create(opts?: RewriterCreateOptions): Promise<RewriterInstance> } }).Rewriter;
        const opts: RewriterCreateOptions = {
          format: "plain-text",
          length: preset === "shorter" ? "shorter" : preset === "longer" ? "longer" : "as-is",
          tone:
            preset === "more-formal"
              ? "more-formal"
              : preset === "more-casual"
                ? "more-casual"
                : "as-is",
        };
        if (preset === "improve") {
          opts.sharedContext = "Improve clarity and conciseness while keeping the same meaning.";
        }
        const rewriter = await R.create(opts);
        try {
          const result = await rewriter.rewrite(text.trim());
          return result ?? null;
        } finally {
          rewriter.destroy();
        }
      } catch {
        return null;
      } finally {
        setIsRewriting(false);
      }
    },
    [availability, checkAvailability]
  );

  return {
    isSupported: REWRITER_SUPPORTED,
    availability,
    checkAvailability,
    rewrite,
    isRewriting,
  };
}
