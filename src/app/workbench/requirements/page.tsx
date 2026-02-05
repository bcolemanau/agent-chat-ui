"use client";

import { SingleProposalApprovalPage } from "@/components/workbench/single-proposal-approval-page";

export default function RequirementsPage() {
  return (
    <SingleProposalApprovalPage
      toolName="generate_requirements_proposal"
      artifactType="requirements_package"
      rejectMessage="Requirements proposal rejected"
      pageTitle="Requirements Proposal"
    />
  );
}
