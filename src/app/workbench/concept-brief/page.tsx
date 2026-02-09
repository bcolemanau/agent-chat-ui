"use client";

import { OptionsApprovalPage } from "@/components/workbench/options-approval-page";

export default function ConceptBriefPage() {
  return (
    <OptionsApprovalPage
      toolName="generate_concept_brief"
      rejectMessage="Concept brief options rejected"
    />
  );
}
