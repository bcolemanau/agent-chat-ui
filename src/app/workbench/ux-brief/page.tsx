"use client";

import { OptionsApprovalPage } from "@/components/workbench/options-approval-page";

export default function UxBriefPage() {
  return (
    <OptionsApprovalPage
      toolName="generate_ux_brief"
      rejectMessage="UX brief options rejected"
    />
  );
}
