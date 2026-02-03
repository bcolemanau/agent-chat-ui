"use client";

import React from "react";
import { ContentRenderer } from "./index";
import { FileText, Download } from "lucide-react";

/** Human-readable label for common MIME types */
function getTypeLabel(mimeType: string): string {
  if (!mimeType || mimeType === "application/octet-stream") return "Document";
  if (mimeType === "application/pdf") return "PDF document";
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.startsWith("video/")) return "Video";
  return "Document";
}

/**
 * Binary Content Renderer
 * Renders binary content with inline PDF preview when possible, plus download option.
 */
export class BinaryRenderer implements ContentRenderer {
  render(content: string, metadata?: Record<string, any>): React.ReactNode {
    const filename = metadata?.filename || "file";
    const mimeType = metadata?.mime_type || "application/octet-stream";
    const isBase64 = /^data:/.test(content) || (typeof content === "string" && /^[A-Za-z0-9+/=]+$/.test(content));
    const dataUrl = isBase64 ? (content.startsWith("data:") ? content : `data:${mimeType};base64,${content}`) : null;
    const isPdf = mimeType === "application/pdf";
    const typeLabel = getTypeLabel(mimeType);

    return (
      <div className="binary-content-wrapper flex flex-col gap-3">
        {/* Header: friendly title and type */}
        <div className="flex items-center gap-2 text-sm text-foreground">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-medium truncate" title={filename !== "file" ? filename : typeLabel}>
            {filename !== "file" ? filename : typeLabel}
          </span>
          {filename !== "file" && (
            <span className="text-xs text-muted-foreground shrink-0">
              — {typeLabel}
            </span>
          )}
        </div>

        {/* Inline PDF preview when we have base64 PDF */}
        {isPdf && dataUrl && (
          <div className="rounded-lg border border-border overflow-hidden bg-muted/20 flex-1 min-h-[200px] flex flex-col">
            <iframe
              src={dataUrl}
              title={filename}
              className="w-full flex-1 min-h-[280px] max-h-[60vh]"
            />
          </div>
        )}

        {/* For non-PDF binary or when no preview: show message + download */}
        {(!isPdf || !dataUrl) && (
          <div className="flex flex-col items-center justify-center p-6 border border-border rounded-lg bg-muted/30">
            {!isPdf && (
              <p className="text-sm text-muted-foreground mb-2">
                {typeLabel} — open or download to view
              </p>
            )}
            {!dataUrl && (
              <p className="text-xs text-muted-foreground mb-4">
                Preview not available for this file.
              </p>
            )}
          </div>
        )}

        {/* Download button when we have a data URL */}
        {dataUrl && (
          <a
            href={dataUrl}
            download={filename}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            <Download className="h-4 w-4" />
            Download {filename !== "file" ? filename : typeLabel}
          </a>
        )}
      </div>
    );
  }
}

// Register the renderer
import { contentRendererRegistry } from "./index";
if (contentRendererRegistry) {
  contentRendererRegistry.register("binary", new BinaryRenderer());
}
