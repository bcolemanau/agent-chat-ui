import { redirect } from "next/navigation";

export default async function WorkbenchDiscoveryRedirect({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = await searchParams;
    const q = new URLSearchParams(params as Record<string, string>).toString();
    redirect(`/discovery${q ? `?${q}` : ""}`);
}
