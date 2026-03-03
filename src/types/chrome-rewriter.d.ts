/**
 * Chrome Rewriter API (origin trial). See https://developer.chrome.com/docs/ai/rewriter-api
 */
declare global {
  interface RewriterCreateOptions {
    sharedContext?: string;
    length?: "shorter" | "as-is" | "longer";
    format?: "as-is" | "markdown" | "plain-text";
    tone?: "more-formal" | "as-is" | "more-casual";
    expectedInputLanguages?: string[];
    expectedContextLanguages?: string[];
    outputLanguage?: string;
    signal?: AbortSignal;
    monitor?: { addEventListener(type: "downloadprogress", handler: (e: { loaded: number; total: number }) => void): void };
  }

  interface RewriterRewriteOptions {
    context?: string;
    tone?: "more-formal" | "as-is" | "more-casual";
    signal?: AbortSignal;
  }

  type RewriterAvailability = "available" | "downloadable" | "unavailable";

  interface RewriterInstance {
    rewrite(text: string, options?: RewriterRewriteOptions): Promise<string>;
    rewriteStreaming(
      text: string,
      options?: RewriterRewriteOptions
    ): AsyncIterable<string>;
    destroy(): void;
  }

  interface RewriterConstructor {
    availability(): Promise<RewriterAvailability>;
    create(options?: RewriterCreateOptions): Promise<RewriterInstance>;
  }

  const Rewriter: RewriterConstructor | undefined;
}

export {};
