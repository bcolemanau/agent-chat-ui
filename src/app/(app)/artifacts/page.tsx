import { redirect } from "next/navigation";

export default function ArtifactsPage() {
    redirect("/map?view=artifacts");
}
