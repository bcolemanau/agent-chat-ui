"use client";

import { ContentRenderer } from "./index";
import { MarkdownText } from "@/components/thread/markdown-text";

/**
 * Markdown Content Renderer
 * Renders markdown content using the existing MarkdownText component
 */
export class MarkdownRenderer implements ContentRenderer {
  render(content: string, metadata?: Record<string, any>): React.ReactNode {
    console.log("[MarkdownRenderer] ENTER render", { contentLength: content?.length || 0, hasMetadata: !!metadata });
    const result = (
      <div className="markdown-content-wrapper">
        <MarkdownText>{content}</MarkdownText>
      </div>
    );
    console.log("[MarkdownRenderer] EXIT render: SUCCESS");
    return result;
  }
}

// Register the renderer - use direct import after registry is exported
// The registry is exported before this file is processed, so this should work
import { contentRendererRegistry } from "./index";

// Register immediately - registry should be initialized by now.
// All template-backed artifacts render as markdown (same edit MD experience); agents can use mermaid in content.
const markdownRenderer = new MarkdownRenderer();
if (contentRendererRegistry) {
  contentRendererRegistry.register("markdown", markdownRenderer);
  contentRendererRegistry.register("architecture", markdownRenderer);
  contentRendererRegistry.register("concept_brief", markdownRenderer);
  contentRendererRegistry.register("ux_brief", markdownRenderer);
  contentRendererRegistry.register("requirements_package", markdownRenderer);
  contentRendererRegistry.register("design", markdownRenderer);
  contentRendererRegistry.register("text", markdownRenderer);
}
