"use client";

import { SemanticDiff, HydrationDiffData, ContextFile } from "@/lib/diff-types";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProgressionDiffRendererProps {
  diff: SemanticDiff<HydrationDiffData>;
  showStats?: boolean;
}

export function ProgressionDiffRenderer({ 
  diff, 
  showStats = true 
}: ProgressionDiffRendererProps) {
  const completionPercentage = diff.metadata.progression?.completionPercentage || 0;
  const itemsAdded = diff.metadata.progression?.itemsAdded || 0;
  const itemsRemaining = diff.metadata.progression?.itemsRemaining || 0;
  
  const leftState = diff.left;
  const rightState = diff.right;
  
  // Extract added items from nested diff structure
  const artifactsAdded = (diff.diff as any)?.artifacts?.added || [];
  const contextAdded = (diff.diff as any)?.external_context?.added || [];
  
  const leftArtifacts = leftState.artifacts || [];
  const rightArtifacts = rightState.artifacts || [];
  const leftContext = leftState.external_context || [];
  const rightContext = rightState.external_context || [];

  return (
    <div className="flex flex-col gap-6">
      {/* Progress Header */}
      {showStats && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{diff.metadata.title}</h3>
            <span className="text-sm text-muted-foreground">
              {completionPercentage.toFixed(1)}% Complete
            </span>
          </div>
          <Progress value={completionPercentage} className="h-2" />
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{itemsAdded} items added</span>
            {itemsRemaining > 0 && (
              <span>{itemsRemaining} remaining</span>
            )}
          </div>
        </div>
      )}

      {/* Side-by-side comparison */}
      <div className="grid grid-cols-2 gap-4">
        {/* Left Panel */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium">{diff.metadata.leftLabel}</h4>
          </div>
          
          {/* Artifacts Section */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Methodology Artifacts ({leftArtifacts.length})
            </div>
            {leftArtifacts.length === 0 ? (
              <div className="text-sm text-muted-foreground italic">
                No artifacts gathered
              </div>
            ) : (
              <ul className="space-y-1">
                {leftArtifacts.map((artifact: string, idx: number) => (
                  <li key={idx} className="flex items-center gap-2 text-sm">
                    <Circle className="h-3 w-3 text-muted-foreground" />
                    <span>{artifact}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* External Context Section */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              External Context ({leftContext.length})
            </div>
            {leftContext.length === 0 ? (
              <div className="text-sm text-muted-foreground italic">
                No external context saved
              </div>
            ) : (
              <ul className="space-y-1">
                {leftContext.map((ctx: ContextFile, idx: number) => (
                  <li key={idx} className="flex items-center gap-2 text-sm">
                    <Circle className="h-3 w-3 text-muted-foreground" />
                    <span>{ctx.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right Panel */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium">{diff.metadata.rightLabel}</h4>
          </div>
          
          {/* Artifacts Section */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Methodology Artifacts ({rightArtifacts.length})
            </div>
            {rightArtifacts.length === 0 ? (
              <div className="text-sm text-muted-foreground italic">
                No artifacts gathered
              </div>
            ) : (
              <ul className="space-y-1">
                {rightArtifacts.map((artifact: string, idx: number) => {
                  const isAdded = artifactsAdded.includes(artifact);
                  return (
                    <li 
                      key={idx} 
                      className={cn(
                        "flex items-center gap-2 text-sm",
                        isAdded && "text-green-600 dark:text-green-400"
                      )}
                    >
                      {isAdded ? (
                        <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
                      ) : (
                        <Circle className="h-3 w-3 text-muted-foreground" />
                      )}
                      <span>{artifact}</span>
                      {isAdded && (
                        <span className="text-xs text-green-600 dark:text-green-400">
                          (added)
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* External Context Section */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              External Context ({rightContext.length})
            </div>
            {rightContext.length === 0 ? (
              <div className="text-sm text-muted-foreground italic">
                No external context saved
              </div>
            ) : (
              <ul className="space-y-1">
                {rightContext.map((ctx: ContextFile, idx: number) => {
                  const isAdded = contextAdded.some((c: ContextFile) => c.name === ctx.name && c.path === ctx.path);
                  return (
                    <li 
                      key={idx} 
                      className={cn(
                        "flex items-center gap-2 text-sm",
                        isAdded && "text-green-600 dark:text-green-400"
                      )}
                    >
                      {isAdded ? (
                        <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
                      ) : (
                        <Circle className="h-3 w-3 text-muted-foreground" />
                      )}
                      <span>{ctx.name}</span>
                      {isAdded && (
                        <span className="text-xs text-green-600 dark:text-green-400">
                          (added)
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Added Items Summary */}
      {(artifactsAdded.length > 0 || contextAdded.length > 0) && (
        <div className="rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-semibold text-green-900 dark:text-green-100">
              Items Added
            </span>
          </div>
          <div className="space-y-2 text-sm">
            {artifactsAdded.length > 0 && (
              <div>
                <span className="font-medium">Artifacts ({artifactsAdded.length}):</span>
                <ul className="list-disc list-inside ml-2 text-muted-foreground">
                  {artifactsAdded.map((artifact: string, idx: number) => (
                    <li key={idx}>{artifact}</li>
                  ))}
                </ul>
              </div>
            )}
            {contextAdded.length > 0 && (
              <div>
                <span className="font-medium">External Context ({contextAdded.length}):</span>
                <ul className="list-disc list-inside ml-2 text-muted-foreground">
                  {contextAdded.map((ctx: ContextFile, idx: number) => (
                    <li key={idx}>{ctx.name}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
