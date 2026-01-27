import { WorkbenchShell } from "@/components/workbench/shell";
import { RecordingProvider } from "@/providers/RecordingProvider";

export default function WorkbenchLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Authentication is handled by middleware.ts
    // No need to check here - middleware ensures only authenticated users reach this point
    return (
        <RecordingProvider>
            <WorkbenchShell>{children}</WorkbenchShell>
        </RecordingProvider>
    );
}
