"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DecisionSummary, DecisionSummaryTab } from "@/lib/diff-types";
import { TRACEABILITY_COLORS as TRACE_COLORS } from "@/lib/diff-types";
import { FileText, Table2, GitBranch, ArrowRight, ShieldCheck, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DecisionSummaryViewProps {
  decisionSummary: DecisionSummary;
  className?: string;
}

export function DecisionSummaryView({ decisionSummary, className }: DecisionSummaryViewProps) {
  const [activeTab, setActiveTab] = useState<DecisionSummaryTab>("semantic");
  const { semanticSummary, tables, graph } = decisionSummary;

  return (
    <div className={cn("rounded-lg border border-border bg-card overflow-hidden", className)}>
      <div className="border-b bg-muted/30 px-3 py-2">
        <h3 className="text-sm font-semibold">Decision context</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          What was in front of you: change, coverage upstream, impact downstream
        </p>
      </div>
      <div className="p-3">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DecisionSummaryTab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="semantic" className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Summary
            </TabsTrigger>
            <TabsTrigger value="table" className="flex items-center gap-1.5">
              <Table2 className="h-3.5 w-3.5" />
              Table
            </TabsTrigger>
            <TabsTrigger value="graph" className="flex items-center gap-1.5">
              <GitBranch className="h-3.5 w-3.5" />
              Graph
            </TabsTrigger>
          </TabsList>

          <TabsContent value="semantic" className="mt-3">
            <Card className="border-border bg-muted/20">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm">Summary</CardTitle>
              </CardHeader>
              <CardContent className="py-2 px-3 text-sm text-foreground">
                {semanticSummary ? (
                  <p className="whitespace-pre-wrap">{semanticSummary}</p>
                ) : (
                  <p className="text-muted-foreground italic">No summary available.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="table" className="mt-3 space-y-4">
            {tables?.change && tables.change.length > 0 && (
              <Card className="border-border bg-muted/20">
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-sm">What you&apos;re changing</CardTitle>
                </CardHeader>
                <CardContent className="py-2 px-3 overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-1.5 font-medium">Item</th>
                        <th className="text-left py-1.5 font-medium">Kind</th>
                        <th className="text-left py-1.5 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tables.change.map((row, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="py-1">{String(row.item ?? "—")}</td>
                          <td className="py-1">{String(row.kind ?? "—")}</td>
                          <td className="py-1">{String(row.status ?? "—")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
            {tables?.coverage && tables.coverage.length > 0 && (
              <Card className="border-border bg-muted/20">
                <CardHeader className="py-2 px-3 flex flex-row items-center gap-2">
                  <CardTitle className="text-sm">What you covered upstream</CardTitle>
                  {tables.coverage.some((r) => r.covered === false) ? (
                    <ShieldAlert className="h-4 w-4 text-amber-500" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 text-green-600" />
                  )}
                </CardHeader>
                <CardContent className="py-2 px-3 overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-1.5 font-medium">Risk / ref</th>
                        <th className="text-left py-1.5 font-medium">Label</th>
                        <th className="text-left py-1.5 font-medium">Covered</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tables.coverage.map((row, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="py-1">{String(row.risk ?? "—")}</td>
                          <td className="py-1">{String(row.label ?? "—")}</td>
                          <td className="py-1">
                            {row.covered ? (
                              <span className="text-green-600">Yes</span>
                            ) : (
                              <span className="text-amber-600">No</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
            {tables?.impact && tables.impact.length > 0 && (
              <Card className="border-border bg-muted/20">
                <CardHeader className="py-2 px-3 flex flex-row items-center gap-2">
                  <CardTitle className="text-sm">What you&apos;re impacting downstream</CardTitle>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="py-2 px-3 overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-1.5 font-medium">Template</th>
                        <th className="text-left py-1.5 font-medium">Name</th>
                        <th className="text-left py-1.5 font-medium">May need re-validation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tables.impact.map((row, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="py-1">{String(row.template ?? "—")}</td>
                          <td className="py-1">{String(row.name ?? "—")}</td>
                          <td className="py-1">{row.may_revalidate ? "Yes" : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
            {(!tables || (tables.change?.length ?? 0) + (tables.coverage?.length ?? 0) + (tables.impact?.length ?? 0) === 0) && (
              <p className="text-sm text-muted-foreground italic">No table data available.</p>
            )}
          </TabsContent>

          <TabsContent value="graph" className="mt-3 space-y-4">
            {/* What you're changing (from diff) */}
            {tables?.change && tables.change.length > 0 && (
              <Card className="border-border bg-muted/20">
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-sm">What you&apos;re changing</CardTitle>
                </CardHeader>
                <CardContent className="py-2 px-3">
                  <div className="flex flex-wrap gap-1.5">
                    {tables.change.map((row, i) => (
                      <span
                        key={i}
                        className="rounded-md px-2 py-1 text-xs border bg-background"
                        title={[row.kind, row.status].filter(Boolean).join(" · ") || undefined}
                      >
                        {String(row.item ?? "—")}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            {/* Upstream → current → downstream */}
            {graph?.nodes && graph.nodes.length > 0 ? (
              <Card className="border-border bg-muted/20">
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-sm">Upstream → current → downstream</CardTitle>
                </CardHeader>
                <CardContent className="py-3 px-3">
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    {/* Upstream (coverage) */}
                    <div className="flex flex-col gap-1 min-w-[120px]">
                      <span className="text-xs font-medium text-muted-foreground" style={{ color: TRACE_COLORS.upstream }}>
                        Upstream (sources)
                      </span>
                      {graph.nodes
                        .filter((n) => n.type === "upstream")
                        .map((n) => (
                          <div
                            key={n.id}
                            className="rounded-md px-2 py-1 text-xs border"
                            style={{ borderColor: TRACE_COLORS.upstream, backgroundColor: `${TRACE_COLORS.upstream}12` }}
                          >
                            {n.name || n.id}
                          </div>
                        ))}
                      {graph.nodes.filter((n) => n.type === "upstream").length === 0 && (
                        <span className="text-xs text-muted-foreground italic">—</span>
                      )}
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    {/* Current */}
                    <div className="flex flex-col gap-1 min-w-[120px]">
                      <span className="text-xs font-medium text-muted-foreground" style={{ color: TRACE_COLORS.current }}>
                        Current
                      </span>
                      {graph.nodes
                        .filter((n) => n.type === "current")
                        .map((n) => (
                          <div
                            key={n.id}
                            className="rounded-md px-2 py-1 text-xs border font-medium"
                            style={{ borderColor: TRACE_COLORS.current, backgroundColor: `${TRACE_COLORS.current}20` }}
                          >
                            {n.name || n.id}
                          </div>
                        ))}
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    {/* Downstream (impact) */}
                    <div className="flex flex-col gap-1 min-w-[120px]">
                      <span className="text-xs font-medium text-muted-foreground" style={{ color: TRACE_COLORS.downstream }}>
                        Downstream (impact)
                      </span>
                      {graph.nodes
                        .filter((n) => n.type === "downstream")
                        .map((n) => (
                          <div
                            key={n.id}
                            className="rounded-md px-2 py-1 text-xs border"
                            style={{ borderColor: TRACE_COLORS.downstream, backgroundColor: `${TRACE_COLORS.downstream}12` }}
                          >
                            {n.name || n.id}
                          </div>
                        ))}
                      {graph.nodes.filter((n) => n.type === "downstream").length === 0 && (
                        <span className="text-xs text-muted-foreground italic">—</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}
            {(!tables?.change || tables.change.length === 0) && (!graph?.nodes || graph.nodes.length === 0) && (
              <p className="text-sm text-muted-foreground italic">No graph data available.</p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
