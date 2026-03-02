import { WorkbenchShell } from "@/components/workbench/shell";
import { RecordingProvider } from "@/providers/RecordingProvider";
import { OrgContextRefProvider } from "@/providers/OrgContextRefProvider";
import { GcpChatCopilotLayout } from "./gcp-chat-copilot-layout";

export default function GcpChatRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RecordingProvider>
      <OrgContextRefProvider>
        <WorkbenchShell>
          <GcpChatCopilotLayout>{children}</GcpChatCopilotLayout>
        </WorkbenchShell>
      </OrgContextRefProvider>
    </RecordingProvider>
  );
}
