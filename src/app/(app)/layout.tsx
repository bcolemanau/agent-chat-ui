import { WorkbenchShell } from "@/components/workbench/shell";
import { RecordingProvider } from "@/providers/RecordingProvider";
import { OrgContextRefProvider } from "@/providers/OrgContextRefProvider";

export default function AppLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <RecordingProvider>
            <OrgContextRefProvider>
                <WorkbenchShell>{children}</WorkbenchShell>
            </OrgContextRefProvider>
        </RecordingProvider>
    );
}
