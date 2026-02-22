import { redirect } from "next/navigation";

export default async function WorkbenchIntegrationsRedirect({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = await searchParams;
    const q = new URLSearchParams(params as Record<string, string>).toString();
    redirect(`/integrations${q ? `?${q}` : ""}`);
}
