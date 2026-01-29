"use client";

import { useState } from "react";
import { useQueryState } from "nuqs";
import { useStreamContext } from "@/providers/Stream";
import { HydrationDiffView as HydrationDiffViewType } from "@/lib/diff-types";
import { ProgressionDiffRenderer } from "./diff-renderers/progression-diff-renderer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, AlertCircle, TrendingUp, Map, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface HydrationDiffViewProps {
  diffData?: HydrationDiffViewType;
  onApprove?: () => void;
  onReject?: () => void;
  isLoading?: boolean;
}

export function HydrationDiffView({
  diffData,
  onApprove,
  onReject,
  isLoading = false,
}: HydrationDiffViewProps) {
  const [activeTab, setActiveTab] = useState<"progress" | "remaining">("progress");
  const stream = useStreamContext();
  const [threadId] = useQueryState("threadId");

  // If no diffData provided, show empty state; when threadId is present offer links so context helps
  if (!diffData) {
    const mapHref = threadId ? `/workbench/map?threadId=${encodeURIComponent(threadId)}` : "/workbench/map";
    const artifactsHref = threadId
      ? `/workbench/map?threadId=${encodeURIComponent(threadId)}&view=artifacts`
      : "/workbench/map?view=artifacts";
    return (
      <div className="flex items-center justify-center p-8 h-full">
        <div className="text-center max-w-md space-y-4">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Hydration Data Available</h3>
          <p className="text-sm text-muted-foreground">
            Waiting for hydration proposal data. This view will display when the hydration agent
            proposes transitioning to the Concept phase.
          </p>
          {threadId && (
            <div className="pt-4 border-t space-y-2">
              <p className="text-xs text-muted-foreground">Continue in this project:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                <Button variant="outline" size="sm" asChild>
                  <a href={mapHref}>
                    <Map className="w-3.5 h-3.5 mr-1.5" />
                    Map
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={artifactsHref}>
                    <FileText className="w-3.5 h-3.5 mr-1.5" />
                    Artifacts
                  </a>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const { progress_diff, remaining_diff, metadata } = diffData;
  const completionPercentage = metadata.completion_percentage;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">{metadata.title}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {metadata.description}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Completion Badge */}
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium",
              completionPercentage >= 80 
                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                : completionPercentage >= 50
                ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
            )}>
              <TrendingUp className="h-4 w-4" />
              {completionPercentage.toFixed(1)}% Complete
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Artifacts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metadata.artifacts.completed} / {metadata.artifacts.total}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {metadata.artifacts.remaining} remaining
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>External Context</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metadata.external_context.completed} / {metadata.external_context.total}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {metadata.external_context.remaining} remaining
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Tabs for Progress vs Remaining */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "progress" | "remaining")} className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="border-b px-4 flex-shrink-0">
          <TabsList>
            <TabsTrigger value="progress">
              Progress Made
            </TabsTrigger>
            <TabsTrigger value="remaining">
              Remaining Work
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="progress" className="flex-1 overflow-y-auto p-4 min-h-0">
          <Card>
            <CardHeader>
              <CardTitle>{progress_diff.metadata.title}</CardTitle>
              <CardDescription>{progress_diff.metadata.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <ProgressionDiffRenderer diff={progress_diff} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="remaining" className="flex-1 overflow-y-auto p-4 min-h-0">
          <Card>
            <CardHeader>
              <CardTitle>{remaining_diff.metadata.title}</CardTitle>
              <CardDescription>{remaining_diff.metadata.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <ProgressionDiffRenderer diff={remaining_diff} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Actions */}
      {(onApprove || onReject) && (
        <div className="border-t p-4 flex items-center justify-end gap-2">
          {onReject && (
            <Button
              variant="outline"
              onClick={onReject}
              disabled={isLoading}
            >
              Reject
            </Button>
          )}
          {onApprove && (
            <Button
              onClick={onApprove}
              disabled={isLoading}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Approve Transition
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
