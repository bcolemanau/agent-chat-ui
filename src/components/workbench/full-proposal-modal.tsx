"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownText } from "@/components/thread/markdown-text";
import { cn } from "@/lib/utils";

type ProposalKind = "requirements" | "architecture" | "design";

interface FullProposalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  proposalType: string;
  previewData: Record<string, unknown> | undefined;
}

/** Renders requirements_data as markdown-style content. */
function RequirementsFullContent({ data }: { data: Record<string, unknown> }) {
  const title = (data.document_title as string) ?? "Requirements Package";
  const reqs = (data.requirements as Array<Record<string, unknown>>) ?? [];
  const scns = (data.scenarios as Array<Record<string, unknown>>) ?? [];
  const lines: string[] = [`# ${title}\n`, "## Requirements\n"];
  if (reqs.length === 0) {
    lines.push("*No requirement records in this draft.*\n");
  } else {
    for (const req of reqs) {
      const id = (req.req_id as string) ?? "REQ";
      const statement = (req.statement as string) ?? "";
      lines.push(`### ${id}: ${statement}`);
      if (req.fit_criteria) lines.push(`- Fit Criteria: ${String(req.fit_criteria)}`);
      if (req.verification_intent) lines.push(`- Verification: ${String(req.verification_intent)}`);
      lines.push("");
    }
  }
  lines.push("## Scenarios\n");
  if (scns.length === 0) {
    lines.push("*No scenario records in this draft.*\n");
  } else {
    for (const scn of scns) {
      const id = (scn.scn_id as string) ?? "SCN";
      const name = (scn.name as string) ?? "";
      lines.push(`### ${id}: ${name}`);
      if (scn.trigger) lines.push(`- Trigger: ${String(scn.trigger)}`);
      if (scn.success_path) lines.push(`- Success path: ${String(scn.success_path)}`);
      if (Array.isArray(scn.validates) && scn.validates.length)
        lines.push(`- Validates: ${(scn.validates as string[]).join(", ")}`);
      lines.push("");
    }
  }
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <MarkdownText>{lines.join("\n")}</MarkdownText>
    </div>
  );
}

/** Renders architecture_data as sections. Uses schema keys: component_name, interface_name, view_name, decision/title; description from purpose, protocol_specification, key_relationships, rationale. */
function ArchitectureFullContent({ data }: { data: Record<string, unknown> }) {
  const title = (data.architecture_title as string) ?? "Architecture Document";
  const components = (data.components as Array<Record<string, unknown>>) ?? [];
  const interfaces = (data.interfaces as Array<Record<string, unknown>>) ?? [];
  const views = (data.views as Array<Record<string, unknown>>) ?? [];
  const decisions = (data.architecture_decisions as Array<Record<string, unknown>>) ?? [];
  const sections: {
    heading: string;
    items: Array<Record<string, unknown>>;
    labelKeys: string[];
    descKeys: string[];
  }[] = [
    { heading: "Components", items: components, labelKeys: ["component_name", "comp_id", "name"], descKeys: ["purpose", "description", "summary"] },
    { heading: "Interfaces", items: interfaces, labelKeys: ["interface_name", "if_id", "name"], descKeys: ["protocol_specification", "interface_type", "description", "summary"] },
    { heading: "Views", items: views, labelKeys: ["view_name", "view_id", "name"], descKeys: ["key_relationships", "view_type", "description", "summary"] },
    { heading: "Architecture Decisions", items: decisions, labelKeys: ["decision", "dec_id", "title"], descKeys: ["rationale", "context", "consequences", "description", "summary"] },
  ];
  const lines: string[] = [`# ${title}\n`];
  for (const { heading, items, labelKeys, descKeys } of sections) {
    lines.push(`## ${heading}\n`);
    if (items.length === 0) {
      lines.push("*None.*\n");
    } else {
      for (const item of items) {
        const label = labelKeys.map((k) => item[k]).find((v) => v != null && String(v).trim()) ?? "";
        const desc = descKeys.map((k) => item[k]).find((v) => v != null && String(v).trim()) ?? "";
        lines.push(`- **${String(label)}**${desc ? ` — ${String(desc)}` : ""}`);
      }
      lines.push("");
    }
  }
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <MarkdownText>{lines.join("\n")}</MarkdownText>
    </div>
  );
}

/** Renders design_data as sections. Uses schema keys: component_name, interface_name, entity_name; description from purpose/specifications, specification, storage_design. */
function DesignFullContent({ data }: { data: Record<string, unknown> }) {
  const title = (data.document_title as string) ?? "Design Document";
  const components = (data.components as Array<Record<string, unknown>>) ?? [];
  const interfaces = (data.interfaces as Array<Record<string, unknown>>) ?? [];
  const dataModels = (data.data_models as Array<Record<string, unknown>>) ?? [];
  const sections: {
    heading: string;
    items: Array<Record<string, unknown>>;
    labelKeys: string[];
    descKeys: string[];
  }[] = [
    { heading: "Components", items: components, labelKeys: ["component_name", "design_comp_id", "name"], descKeys: ["purpose", "specifications", "description", "summary"] },
    { heading: "Interfaces", items: interfaces, labelKeys: ["interface_name", "design_if_id", "name"], descKeys: ["specification", "request_response", "security_design", "description", "summary"] },
    { heading: "Data Models", items: dataModels, labelKeys: ["entity_name", "data_id", "name"], descKeys: ["storage_design", "data_type", "description", "summary"] },
  ];
  const lines: string[] = [`# ${title}\n`];
  for (const { heading, items, labelKeys, descKeys } of sections) {
    lines.push(`## ${heading}\n`);
    if (items.length === 0) {
      lines.push("*None.*\n");
    } else {
      for (const item of items) {
        const label = labelKeys.map((k) => item[k]).find((v) => v != null && String(v).trim()) ?? "";
        const desc = descKeys.map((k) => item[k]).find((v) => v != null && String(v).trim()) ?? "";
        lines.push(`- **${String(label)}**${desc ? ` — ${String(desc)}` : ""}`);
      }
      lines.push("");
    }
  }
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <MarkdownText>{lines.join("\n")}</MarkdownText>
    </div>
  );
}

export interface FullProposalContentProps {
  title: string;
  proposalType: string;
  previewData: Record<string, unknown> | undefined;
}

/** Reusable full proposal content for use in modal or detail pane. */
export function FullProposalContent({
  title: _title,
  proposalType,
  previewData,
}: FullProposalContentProps) {
  const kind: ProposalKind | null =
    proposalType === "generate_requirements_proposal"
      ? "requirements"
      : proposalType === "generate_architecture_proposal"
        ? "architecture"
        : proposalType === "generate_design_proposal"
          ? "design"
          : null;

  const data = kind
    ? (previewData?.[
        kind === "requirements"
          ? "requirements_data"
          : kind === "architecture"
            ? "architecture_data"
            : "design_data"
      ] as Record<string, unknown> | undefined)
    : undefined;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto pr-2 border rounded-lg bg-muted/30 p-4">
      {kind === "requirements" && data && <RequirementsFullContent data={data} />}
      {kind === "architecture" && data && <ArchitectureFullContent data={data} />}
      {kind === "design" && data && <DesignFullContent data={data} />}
      {(!kind || !data) && (
        <p className="text-sm text-muted-foreground">Full proposal content is not available for this type.</p>
      )}
    </div>
  );
}

export function FullProposalModal({
  open,
  onOpenChange,
  title,
  proposalType,
  previewData,
}: FullProposalModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-3xl max-h-[85vh] flex flex-col",
          "overflow-hidden"
        )}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <FullProposalContent title={title} proposalType={proposalType} previewData={previewData} />
      </DialogContent>
    </Dialog>
  );
}
